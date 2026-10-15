using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>UC30 trên CSDL thật: giao cho nhà xe, báo đã giao, khách xác nhận, job hoàn tất → doanh thu lô. Không chạy trong CI.</summary>
[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class OrderFulfilmentDatabaseTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    private sealed record Ctx(long CustomerId, long OperatorUserId, long OperatorId, long BatchId, long ListingId, string OrderNo, long GradeId);

    private static object Cart(long addressId, long listingId, decimal quantityKg) => new
    {
        addressId,
        lines = new[] { new { listingId, quantityKg } },
    };

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private Task WithDbAsync(Func<AppDbContext, Task> action) => fixture.WithDbAsync(async db =>
    {
        await action(db);
        return true;
    });

    private async Task<Ctx> SeedPaidAsync(decimal quantityKg = 1m)
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 10);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var customer = fixture.Client(customerId);
        using var checkout = await customer.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, listingId, quantityKg));
        checkout.EnsureSuccessStatusCode();
        var orderNo = (await checkout.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single().OrderNo;
        return await fixture.WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var listing = await db.ProductListings.Include(l => l.Batch).SingleAsync(l => l.ListingId == listingId);
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == orderNo);
            order.Status = "Paid";
            order.PaidAt = now;
            order.UpdatedAt = now;

            var user = new AppUser
            {
                Email = $"ship-op-{Guid.NewGuid():N}@test.local",
                FullName = "Hộ giao hàng",
                PasswordHash = "test-only",
                Status = "Active",
                CreatedAt = now,
                UpdatedAt = now,
            };
            user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.OperatorMember, GrantedAt = now });
            db.OperatorMembers.Add(new OperatorMember { User = user, OperatorId = listing.Batch.OperatorId, MemberRole = "Owner", JoinedAt = now });
            await db.SaveChangesAsync();
            return new Ctx(customerId, user.UserId, listing.Batch.OperatorId, listing.BatchId, listingId, orderNo, listing.GradeId);
        });
    }

    private Task<List<string>> AddCrabsAsync(Ctx ctx, int count, short weightG)
        => fixture.WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var n = Guid.NewGuid().ToString("N")[..6];
            var slot = new PhysicalSlot
            {
                OperatorId = ctx.OperatorId,
                SlotCode = $"P{n}",
                Status = "Occupied",
                CreatedAt = now,
                UpdatedAt = now,
            };
            var alloc = new SlotAllocation { BatchId = ctx.BatchId, Slot = slot, AllocatedAt = now, CreatedAt = now };
            db.SlotAllocations.Add(alloc);
            var harvest = new Harvest
            {
                BatchId = ctx.BatchId,
                HarvestedAt = now,
                HarvestedCount = count,
                TotalWeightKg = Math.Round(count * weightG / 1000m, 3),
                DeclaredBy = ctx.OperatorUserId,
                CreatedAt = now,
            };
            db.Harvests.Add(harvest);
            var evidence = new Evidence
            {
                BatchId = ctx.BatchId,
                MediaType = "Photo",
                FileUri = $"test://ship-{n}",
                Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N")[..32],
                Source = "FarmApi",
                ReviewStatus = "Accepted",
                ReceivedAt = now,
                CreatedAt = now,
            };
            db.Evidences.Add(evidence);
            await db.SaveChangesAsync();

            var codes = new List<string>();
            for (var i = 0; i < count; i++)
            {
                var code = "CS" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
                var crab = new CrabItem
                {
                    BatchId = ctx.BatchId,
                    SlotAllocationId = alloc.SlotAllocationId,
                    HarvestId = harvest.HarvestId,
                    GradeId = ctx.GradeId,
                    WeightG = weightG,
                    Status = "InStock",
                    StockedAt = now,
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                crab.CrabTag = new CrabTag
                {
                    TagCode = code,
                    Status = "Active",
                    PrintedAt = now,
                    PrintedBy = ctx.OperatorUserId,
                    ActivatedAt = now,
                    ActivationEvidenceId = evidence.EvidenceId,
                };
                db.CrabItems.Add(crab);
                codes.Add(code);
            }
            await db.SaveChangesAsync();
            return codes;
        });

    private async Task<(Ctx Ctx, List<string> Tags)> SeedPackedAsync(decimal quantityKg = 1m)
    {
        var ctx = await SeedPaidAsync(quantityKg);
        var tags = await AddCrabsAsync(ctx, 2, 500);
        using var client = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        using var pack = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/pack", new { tagCodes = tags });
        pack.EnsureSuccessStatusCode();
        return (ctx, tags);
    }

    private static Task<HttpResponseMessage> Ship(HttpClient op, string orderNo, object? body = null)
        => op.PostAsJsonAsync($"/api/orders/{orderNo}/ship", body ?? new
        {
            carrierName = "Nhà xe Phương Trang",
            vehiclePlate = "69b-123.45",
            driverPhone = "0901234567",
            expectedArrivalAt = DateTimeOffset.UtcNow.AddHours(4),
            note = "Gửi chuyến 14h",
        });

    private async Task<int> RunCompletionJobAsync()
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<OrderCompletionService>()
            .CompleteDueAsync(CancellationToken.None);
    }

    private Task ExpireReturnWindowAsync(string orderNo) => WithDbAsync(async db =>
    {
        var n = await db.SalesOrders.Where(o => o.OrderNo == orderNo)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.ReturnWindowEndsAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        Assert.Equal(1, n);
    });

    private Task<int> AssertChainAsync() => fixture.WithDbAsync(async db =>
    {
        var rows = await db.AuditLogs.AsNoTracking().OrderBy(a => a.AuditId).ToListAsync();
        string? previous = null;
        foreach (var row in rows)
        {
            Assert.Equal(previous, row.PrevHash);
            Assert.Matches("^[0-9a-f]{64}$", row.RowHash);
            if (row.PrevHash is not null) Assert.Matches("^[0-9a-f]{64}$", row.PrevHash);
            var content = JsonSerializer.Serialize(new
            {
                entityType = row.EntityType,
                entityId = row.EntityId,
                actionType = row.ActionType,
                oldValue = row.OldValue,
                newValue = row.NewValue,
                actorUserId = row.ActorUserId,
                occurredAt = row.OccurredAt,
            });
            Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((previous ?? "") + content))), row.RowHash);
            Assert.Equal(0, row.OccurredAt.Ticks % TimeSpan.TicksPerMillisecond);
            foreach (var snapshot in new[] { row.OldValue, row.NewValue }.Where(v => v is not null))
            {
                using var json = JsonDocument.Parse(snapshot!);
                Assert.All(json.RootElement.EnumerateObject(), p => Assert.True(char.IsLower(p.Name[0])));
            }
            previous = row.RowHash;
        }
        return rows.Count;
    });

    [Fact]
    public async Task Ship_don_Packed_chuyen_Shipping_luu_nha_xe_va_audit()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var client = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        using var response = await Ship(client, ctx.OrderNo);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<OperatorOrderDetailResponse>();
        Assert.NotNull(body);
        Assert.Equal("Shipping", body.Status);
        Assert.NotNull(body.Shipment);
        Assert.Equal("Nhà xe Phương Trang", body.Shipment.CarrierName);
        Assert.Equal("69B-123.45", body.Shipment.VehiclePlate);
        Assert.Equal("0901234567", body.Shipment.DriverPhone);
        Assert.NotNull(body.Shipment.ShippedAt);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal("Shipping", order.Status);
            Assert.NotNull(order.ShippedAt);
            Assert.Equal("Nhà xe Phương Trang", order.CarrierName);
            Assert.Equal("69B-123.45", order.VehiclePlate);

            var audits = await db.AuditLogs.Where(a => a.EntityType == "sales_order" && a.EntityId == order.OrderId && a.ActionType == "ship").ToListAsync();
            Assert.Single(audits);
            Assert.Equal(ctx.OperatorUserId, audits[0].ActorUserId);
        });
    }

    [Fact]
    public async Task Ship_don_chua_dong_goi_tra_422()
    {
        var ctx = await SeedPaidAsync();
        using var client = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        using var response = await Ship(client, ctx.OrderNo);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(FulfilmentErrors.InvalidStatus, await ErrorCode(response));

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal("Paid", order.Status);
        });
    }

    [Fact]
    public async Task Ship_don_cua_ho_khac_tra_403()
    {
        var (ctx1, _) = await SeedPackedAsync();
        var (ctx2, _) = await SeedPackedAsync();

        using var client2 = fixture.OperatorClient(ctx2.OperatorUserId, ctx2.OperatorId);
        using var response = await Ship(client2, ctx1.OrderNo);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(FulfilmentErrors.OrderForbidden, await ErrorCode(response));

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx1.OrderNo);
            Assert.Equal("Packed", order.Status);
        });
    }

    [Fact]
    public async Task Ship_thieu_nha_xe_hoac_sdt_sai_tra_400()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var client = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        using var emptyCarrier = await Ship(client, ctx.OrderNo, new { carrierName = "   ", driverPhone = "0901234567" });
        Assert.Equal(HttpStatusCode.BadRequest, emptyCarrier.StatusCode);

        using var badPhone = await Ship(client, ctx.OrderNo, new { carrierName = "Xe A", driverPhone = "12345" });
        Assert.Equal(HttpStatusCode.BadRequest, badPhone.StatusCode);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal("Packed", order.Status);
        });
    }

    [Fact]
    public async Task Ship_gio_du_kien_qua_khu_hoac_qua_7_ngay_tra_422()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var client = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        using var pastEta = await Ship(client, ctx.OrderNo, new
        {
            carrierName = "Xe A",
            driverPhone = "0901234567",
            expectedArrivalAt = DateTimeOffset.UtcNow.AddHours(-2),
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, pastEta.StatusCode);
        Assert.Equal(FulfilmentErrors.EtaInvalid, await ErrorCode(pastEta));

        using var futureEta = await Ship(client, ctx.OrderNo, new
        {
            carrierName = "Xe A",
            driverPhone = "0901234567",
            expectedArrivalAt = DateTimeOffset.UtcNow.AddDays(8),
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, futureEta.StatusCode);
        Assert.Equal(FulfilmentErrors.EtaInvalid, await ErrorCode(futureEta));

        using var validNoEta = await Ship(client, ctx.OrderNo, new
        {
            carrierName = "Xe A",
            driverPhone = "0901234567",
        });
        Assert.Equal(HttpStatusCode.OK, validNoEta.StatusCode);
    }

    [Fact]
    public async Task Ship_lan_hai_tra_422_khong_ghi_audit_them()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var client = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        using var res1 = await Ship(client, ctx.OrderNo);
        res1.EnsureSuccessStatusCode();

        using var res2 = await Ship(client, ctx.OrderNo);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res2.StatusCode);
        Assert.Equal(FulfilmentErrors.InvalidStatus, await ErrorCode(res2));

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            var count = await db.AuditLogs.CountAsync(a => a.EntityType == "sales_order" && a.EntityId == order.OrderId && a.ActionType == "ship");
            Assert.Equal(1, count);
        });
    }

    [Fact]
    public async Task Deliver_chuyen_Delivered_han_72h_cua_Sold_va_event_Delivered()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var client = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        using var ship = await Ship(client, ctx.OrderNo);
        ship.EnsureSuccessStatusCode();

        using var deliver = await client.PostAsync($"/api/orders/{ctx.OrderNo}/deliver", null);
        Assert.Equal(HttpStatusCode.OK, deliver.StatusCode);

        var body = await deliver.Content.ReadFromJsonAsync<OperatorOrderDetailResponse>();
        Assert.NotNull(body);
        Assert.Equal("Delivered", body.Status);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal("Delivered", order.Status);
            Assert.NotNull(order.DeliveredAt);
            Assert.NotNull(order.ReturnWindowEndsAt);
            Assert.Equal(TimeSpan.FromHours(72), order.ReturnWindowEndsAt.Value - order.DeliveredAt.Value);

            var crabs = await db.CrabItems.Where(c => c.OrderLine!.OrderId == order.OrderId).ToListAsync();
            Assert.Equal(2, crabs.Count);
            Assert.All(crabs, c => Assert.Equal("Sold", c.Status));

            var events = await db.CrabItemEvents.Where(e => e.Note == ctx.OrderNo && e.EventType == "Delivered").ToListAsync();
            Assert.Equal(2, events.Count);

            var auditDeliver = await db.AuditLogs.Where(a => a.EntityType == "sales_order" && a.EntityId == order.OrderId && a.ActionType == "deliver").ToListAsync();
            Assert.Single(auditDeliver);
        });
    }

    [Fact]
    public async Task Deliver_don_chua_giao_cho_nha_xe_tra_422()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var client = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        using var deliver = await client.PostAsync($"/api/orders/{ctx.OrderNo}/deliver", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, deliver.StatusCode);
        Assert.Equal(FulfilmentErrors.InvalidStatus, await ErrorCode(deliver));
    }

    [Fact]
    public async Task Receive_khi_dang_giao_chuyen_Delivered_ghi_received_at()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var opClient = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        using var ship = await Ship(opClient, ctx.OrderNo);
        ship.EnsureSuccessStatusCode();

        using var custClient = fixture.Client(ctx.CustomerId);
        using var receive = await custClient.PostAsync($"/api/orders/{ctx.OrderNo}/receive", null);
        Assert.Equal(HttpStatusCode.OK, receive.StatusCode);

        var body = await receive.Content.ReadFromJsonAsync<OrderTrackingResponse>();
        Assert.NotNull(body);
        Assert.Equal("Delivered", body.Status);
        Assert.False(body.CanConfirmReceipt);
        Assert.NotNull(body.Shipment);
        Assert.NotNull(body.Shipment.ReceivedAt);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal("Delivered", order.Status);
            Assert.NotNull(order.DeliveredAt);
            Assert.NotNull(order.ReceivedAt);
            Assert.Equal(order.DeliveredAt, order.ReceivedAt);

            var crabs = await db.CrabItems.Where(c => c.OrderLine!.OrderId == order.OrderId).ToListAsync();
            Assert.Equal(2, crabs.Count);
            Assert.All(crabs, c => Assert.Equal("Sold", c.Status));
        });
    }

    [Fact]
    public async Task Receive_sau_khi_ho_bao_giao_chi_ghi_received_at_khong_doi_han()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var opClient = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        using var ship = await Ship(opClient, ctx.OrderNo);
        ship.EnsureSuccessStatusCode();
        using var deliver = await opClient.PostAsync($"/api/orders/{ctx.OrderNo}/deliver", null);
        deliver.EnsureSuccessStatusCode();

        DateTimeOffset initialEndsAt = default;
        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            initialEndsAt = order.ReturnWindowEndsAt!.Value;
        });

        using var custClient = fixture.Client(ctx.CustomerId);
        using var receive = await custClient.PostAsync($"/api/orders/{ctx.OrderNo}/receive", null);
        Assert.Equal(HttpStatusCode.OK, receive.StatusCode);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.NotNull(order.ReceivedAt);
            Assert.Equal(initialEndsAt, order.ReturnWindowEndsAt);

            var events = await db.CrabItemEvents.Where(e => e.Note == ctx.OrderNo && e.EventType == "Delivered").ToListAsync();
            Assert.Equal(2, events.Count);
        });
    }

    [Fact]
    public async Task Receive_lan_hai_tra_200_khong_ghi_audit_them()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var opClient = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        using var ship = await Ship(opClient, ctx.OrderNo);
        ship.EnsureSuccessStatusCode();

        using var custClient = fixture.Client(ctx.CustomerId);
        using var rec1 = await custClient.PostAsync($"/api/orders/{ctx.OrderNo}/receive", null);
        rec1.EnsureSuccessStatusCode();

        using var rec2 = await custClient.PostAsync($"/api/orders/{ctx.OrderNo}/receive", null);
        Assert.Equal(HttpStatusCode.OK, rec2.StatusCode);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            var audits = await db.AuditLogs.Where(a => a.EntityType == "sales_order" && a.EntityId == order.OrderId && a.ActionType == "receive").ToListAsync();
            Assert.Single(audits);
        });
    }

    [Fact]
    public async Task Receive_don_nguoi_khac_403_va_don_chua_giao_422()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var opClient = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        using var ship = await Ship(opClient, ctx.OrderNo);
        ship.EnsureSuccessStatusCode();

        var (otherCustId, _) = await fixture.CreateCustomerAsync();
        using var otherClient = fixture.Client(otherCustId);
        using var forbidden = await otherClient.PostAsync($"/api/orders/{ctx.OrderNo}/receive", null);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal("order.not_owner", await ErrorCode(forbidden));

        var paidCtx = await SeedPaidAsync();
        using var myClient = fixture.Client(paidCtx.CustomerId);
        using var invalid = await myClient.PostAsync($"/api/orders/{paidCtx.OrderNo}/receive", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalid.StatusCode);
        Assert.Equal(FulfilmentErrors.InvalidStatus, await ErrorCode(invalid));
    }

    [Fact]
    public async Task Sai_vai_tro_bi_chan_boi_policy()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var custClient = fixture.Client(ctx.CustomerId);
        using var custShip = await Ship(custClient, ctx.OrderNo);
        Assert.Equal(HttpStatusCode.Forbidden, custShip.StatusCode);

        using var opClient = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        using var opReceive = await opClient.PostAsync($"/api/orders/{ctx.OrderNo}/receive", null);
        Assert.Equal(HttpStatusCode.Forbidden, opReceive.StatusCode);
    }

    [Fact]
    public async Task Job_hoan_tat_don_het_han_va_doanh_thu_vao_v_batch_actual_revenue()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var opClient = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        using var ship = await Ship(opClient, ctx.OrderNo);
        ship.EnsureSuccessStatusCode();
        using var deliver = await opClient.PostAsync($"/api/orders/{ctx.OrderNo}/deliver", null);
        deliver.EnsureSuccessStatusCode();

        await ExpireReturnWindowAsync(ctx.OrderNo);

        var completedCount = await RunCompletionJobAsync();
        Assert.Equal(1, completedCount);

        var runAgain = await RunCompletionJobAsync();
        Assert.Equal(0, runAgain);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal("Completed", order.Status);
            Assert.NotNull(order.CompletedAt);

            var revenue = await db.VBatchActualRevenues.SingleAsync(v => v.BatchId == ctx.BatchId);
            Assert.Equal(order.TotalAmount, revenue.OrderRevenue);

            var audits = await db.AuditLogs.Where(a => a.EntityType == "sales_order" && a.EntityId == order.OrderId && a.ActionType == "complete").ToListAsync();
            Assert.Single(audits);
            Assert.Null(audits[0].ActorUserId);
        });
    }

    [Fact]
    public async Task Job_bo_qua_don_chua_het_han_va_don_co_khieu_nai_mo()
    {
        var (ctxA, _) = await SeedPackedAsync();
        var (ctxB, _) = await SeedPackedAsync();

        using var opClientA = fixture.OperatorClient(ctxA.OperatorUserId, ctxA.OperatorId);
        (await Ship(opClientA, ctxA.OrderNo)).EnsureSuccessStatusCode();
        (await opClientA.PostAsync($"/api/orders/{ctxA.OrderNo}/deliver", null)).EnsureSuccessStatusCode();

        using var opClientB = fixture.OperatorClient(ctxB.OperatorUserId, ctxB.OperatorId);
        (await Ship(opClientB, ctxB.OrderNo)).EnsureSuccessStatusCode();
        (await opClientB.PostAsync($"/api/orders/{ctxB.OrderNo}/deliver", null)).EnsureSuccessStatusCode();

        var now = DateTimeOffset.UtcNow;
        await WithDbAsync(async db =>
        {
            var orderB = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctxB.OrderNo);
            orderB.ReturnWindowEndsAt = now.AddMinutes(-1);
            db.Complaints.Add(new Complaint
            {
                OrderId = orderB.OrderId,
                ComplaintType = "Damaged",
                Description = "Cua chết",
                Status = "Open",
                OpenedAt = now,
                CreatedAt = now,
                UpdatedAt = now,
            });
            await db.SaveChangesAsync();
        });

        var count = await RunCompletionJobAsync();
        Assert.Equal(0, count);

        await WithDbAsync(async db =>
        {
            var orderA = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctxA.OrderNo);
            var orderB = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctxB.OrderNo);
            Assert.Equal("Delivered", orderA.Status);
            Assert.Equal("Delivered", orderB.Status);

            var complaintB = await db.Complaints.SingleAsync(c => c.OrderId == orderB.OrderId);
            complaintB.Status = "Resolved";
            complaintB.Resolution = "NoAction";
            complaintB.ResolvedAt = now;
            complaintB.UpdatedAt = now;
            await db.SaveChangesAsync();
        });

        var countAfterResolve = await RunCompletionJobAsync();
        Assert.Equal(1, countAfterResolve);

        await WithDbAsync(async db =>
        {
            var orderB = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctxB.OrderNo);
            Assert.Equal("Completed", orderB.Status);
        });
    }

    [Fact]
    public async Task Danh_sach_ho_nuoi_loc_Shipping_va_chi_tiet_co_thong_tin_giao()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var opClient = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        (await Ship(opClient, ctx.OrderNo)).EnsureSuccessStatusCode();

        var list = await opClient.GetFromJsonAsync<OperatorOrderSummaryResponse[]>("/api/operators/me/orders?status=Shipping");
        Assert.NotNull(list);
        Assert.Contains(list, o => o.OrderNo == ctx.OrderNo && o.Status == "Shipping");

        var detail = await opClient.GetFromJsonAsync<OperatorOrderDetailResponse>($"/api/operators/me/orders/{ctx.OrderNo}");
        Assert.NotNull(detail);
        Assert.NotNull(detail.Shipment);
        Assert.Equal("Nhà xe Phương Trang", detail.Shipment.CarrierName);

        using var custClient = fixture.Client(ctx.CustomerId);
        var tracking = await custClient.GetFromJsonAsync<OrderTrackingResponse>($"/api/orders/{ctx.OrderNo}");
        Assert.NotNull(tracking);
        Assert.True(tracking.CanConfirmReceipt);
        Assert.NotNull(tracking.Shipment);
        Assert.Equal("0901234567", tracking.Shipment.DriverPhone);
        Assert.False(tracking.CanCancel);
    }

    [Fact]
    public async Task Chuoi_audit_khong_gay_sau_giao_nhan_hoan_tat()
    {
        var (ctx, _) = await SeedPackedAsync();
        using var opClient = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);
        (await Ship(opClient, ctx.OrderNo)).EnsureSuccessStatusCode();
        (await opClient.PostAsync($"/api/orders/{ctx.OrderNo}/deliver", null)).EnsureSuccessStatusCode();

        using var custClient = fixture.Client(ctx.CustomerId);
        (await custClient.PostAsync($"/api/orders/{ctx.OrderNo}/receive", null)).EnsureSuccessStatusCode();

        await ExpireReturnWindowAsync(ctx.OrderNo);
        var completed = await RunCompletionJobAsync();
        Assert.Equal(1, completed);

        var chainCount = await AssertChainAsync();
        Assert.True(chainCount >= 4);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            var actions = await db.AuditLogs.Where(a => a.EntityType == "sales_order" && a.EntityId == order.OrderId)
                .Select(a => a.ActionType).ToListAsync();
            Assert.Contains("ship", actions);
            Assert.Contains("deliver", actions);
            Assert.Contains("receive", actions);
            Assert.Contains("complete", actions);
        });
    }
}

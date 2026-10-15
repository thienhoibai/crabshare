using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

/// <summary>UC29 trên CSDL thật: sai lô/hạng, thiếu kg, đủ kg → Packed, tem đã dùng, chưa Paid, hộ khác 403.</summary>
[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class OrderPackingDatabaseTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    private static object Cart(long addressId, long listingId, decimal quantityKg) => new
    {
        addressId,
        lines = new[] { new { listingId, quantityKg } },
    };

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private sealed record Farm(long UserId, long OperatorId, long BatchId, long ListingId, string OrderNo, long GradeId);

    private async Task<Farm> SeedOrderAsync(string status = "Paid", decimal quantityKg = 1m)
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
            if (status == "Paid")
            {
                order.Status = "Paid";
                order.PaidAt = now;
                order.UpdatedAt = now;
            }
            var user = new AppUser
            {
                Email = $"pack-op-{Guid.NewGuid():N}@test.local", FullName = "Hộ đóng gói", PasswordHash = "test-only",
                Status = "Active", CreatedAt = now, UpdatedAt = now,
            };
            user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.OperatorMember, GrantedAt = now });
            db.OperatorMembers.Add(new OperatorMember { User = user, OperatorId = listing.Batch.OperatorId, MemberRole = "Owner", JoinedAt = now });
            await db.SaveChangesAsync();
            return new Farm(user.UserId, listing.Batch.OperatorId, listing.BatchId, listingId, orderNo, listing.GradeId);
        });
    }

    private Task<List<string>> AddCrabsAsync(Farm farm, int count, short weightG, long? gradeId = null, string tagStatus = "Active", string crabStatus = "InStock")
        => fixture.WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var n = Guid.NewGuid().ToString("N")[..6];
            var slot = new PhysicalSlot
            {
                OperatorId = farm.OperatorId, SlotCode = $"P{n}", Status = "Occupied", CreatedAt = now, UpdatedAt = now,
            };
            var alloc = new SlotAllocation { BatchId = farm.BatchId, Slot = slot, AllocatedAt = now, CreatedAt = now };
            db.SlotAllocations.Add(alloc);
            var harvest = new Harvest
            {
                BatchId = farm.BatchId, HarvestedAt = now, HarvestedCount = count,
                TotalWeightKg = Math.Round(count * weightG / 1000m, 3), DeclaredBy = farm.UserId, CreatedAt = now,
            };
            db.Harvests.Add(harvest);
            var evidence = new Evidence
            {
                BatchId = farm.BatchId, MediaType = "Photo", FileUri = $"test://pack-{n}",
                Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N")[..32],
                Source = "FarmApi", ReviewStatus = "Accepted", ReceivedAt = now, CreatedAt = now,
            };
            db.Evidences.Add(evidence);
            await db.SaveChangesAsync();

            var codes = new List<string>();
            var gid = gradeId ?? farm.GradeId;
            for (var i = 0; i < count; i++)
            {
                var code = "CS" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
                var crab = new CrabItem
                {
                    BatchId = farm.BatchId, SlotAllocationId = alloc.SlotAllocationId, HarvestId = harvest.HarvestId,
                    GradeId = gid, WeightG = weightG, Status = crabStatus, StockedAt = now, CreatedAt = now, UpdatedAt = now,
                };
                crab.CrabTag = new CrabTag
                {
                    TagCode = code, Status = tagStatus, PrintedAt = now, PrintedBy = farm.UserId,
                    ActivatedAt = tagStatus == "Active" ? now : null,
                    ActivationEvidenceId = tagStatus == "Active" ? evidence.EvidenceId : null,
                };
                db.CrabItems.Add(crab);
                codes.Add(code);
            }
            await db.SaveChangesAsync();
            return codes;
        });

    private Task<long> OtherGradeIdAsync() => fixture.WithDbAsync(db =>
        db.ProductGrades.Where(g => g.GradeCode == "L2").Select(g => g.GradeId).SingleAsync());

    [Fact]
    public async Task Quet_sai_lo_tra_422()
    {
        var farm = await SeedOrderAsync();
        var own = await AddCrabsAsync(farm, 2, 500);
        var otherListing = await fixture.CreateListingAsync(stockKg: 5);
        var other = await fixture.WithDbAsync(async db =>
        {
            var listing = await db.ProductListings.Include(l => l.Batch).SingleAsync(l => l.ListingId == otherListing);
            return farm with { OperatorId = listing.Batch.OperatorId, BatchId = listing.BatchId, GradeId = listing.GradeId };
        });
        var foreign = await AddCrabsAsync(other, 1, 500);
        using var client = fixture.OperatorClient(farm.UserId, farm.OperatorId);

        using var response = await client.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = new[] { own[0], foreign[0] } });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(PackingErrors.WrongBatch, await ErrorCode(response));
        Assert.Equal("InStock", await fixture.WithDbAsync(db => db.CrabItems.Where(c => c.CrabTag!.TagCode == own[0]).Select(c => c.Status).SingleAsync()));
    }

    [Fact]
    public async Task Quet_sai_hang_tra_422()
    {
        var farm = await SeedOrderAsync();
        var l2 = await OtherGradeIdAsync();
        var wrong = await AddCrabsAsync(farm, 1, 400, l2);
        using var client = fixture.OperatorClient(farm.UserId, farm.OperatorId);

        using var response = await client.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = wrong });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(PackingErrors.WrongGrade, await ErrorCode(response));
    }

    [Fact]
    public async Task Thieu_kg_tra_422_va_khong_doi_cua()
    {
        var farm = await SeedOrderAsync();
        var tags = await AddCrabsAsync(farm, 1, 500);
        using var client = fixture.OperatorClient(farm.UserId, farm.OperatorId);

        using var response = await client.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = tags });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(PackingErrors.NotEnoughWeight, await ErrorCode(response));
        var (crabStatus, orderStatus) = await fixture.WithDbAsync(async db =>
        {
            var crab = await db.CrabItems.SingleAsync(c => c.CrabTag!.TagCode == tags[0]);
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == farm.OrderNo);
            return (crab.Status, order.Status);
        });
        Assert.Equal("InStock", crabStatus);
        Assert.Equal("Paid", orderStatus);
    }

    [Fact]
    public async Task Du_kg_don_chuyen_Packed_va_ghi_event_audit()
    {
        var farm = await SeedOrderAsync();
        var tags = await AddCrabsAsync(farm, 2, 500);
        using var client = fixture.OperatorClient(farm.UserId, farm.OperatorId);

        using var response = await client.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = tags });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<OperatorOrderDetailResponse>(Json))!;
        Assert.Equal("Packed", body.Status);
        Assert.Equal(1m, body.Lines.Single().AssignedKg);
        Assert.Equal(2, body.Lines.Single().AssignedCount);
        Assert.Equal(2, body.Lines.Single().Tags.Count);

        var (crabs, events, orderStatus, audit) = await fixture.WithDbAsync(async db =>
        {
            var packed = await db.CrabItems.Include(c => c.CrabTag).Where(c => tags.Contains(c.CrabTag!.TagCode)).ToListAsync();
            var packedEvents = await db.CrabItemEvents.CountAsync(e => e.EventType == "Packed" && e.TagId != null
                && packed.Select(c => c.CrabItemId).Contains(e.CrabItemId));
            var status = await db.SalesOrders.Where(o => o.OrderNo == farm.OrderNo).Select(o => o.Status).SingleAsync();
            var log = await db.AuditLogs.SingleAsync(a => a.EntityType == "sales_order" && a.ActionType == "pack");
            return (packed, packedEvents, status, log);
        });
        Assert.All(crabs, c =>
        {
            Assert.Equal("Packed", c.Status);
            Assert.NotNull(c.OrderLineId);
        });
        Assert.Equal(2, events);
        Assert.Equal("Packed", orderStatus);
        Assert.Equal(farm.UserId, audit.ActorUserId);
        Assert.Contains("Packed", audit.NewValue);
    }

    [Fact]
    public async Task Tem_da_dung_tra_422_crab_not_in_stock()
    {
        var farm = await SeedOrderAsync();
        var tags = await AddCrabsAsync(farm, 2, 500);
        using var client = fixture.OperatorClient(farm.UserId, farm.OperatorId);
        (await client.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = tags })).EnsureSuccessStatusCode();

        var second = await SeedPaidOnListingAsync(farm.ListingId);
        using var again = await client.PostAsJsonAsync($"/api/orders/{second}/pack", new { tagCodes = tags });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, again.StatusCode);
        Assert.Equal(PackingErrors.CrabNotInStock, await ErrorCode(again));
    }

    [Fact]
    public async Task Don_chua_Paid_tra_422()
    {
        var farm = await SeedOrderAsync(status: "PendingPayment");
        var tags = await AddCrabsAsync(farm, 2, 500);
        using var client = fixture.OperatorClient(farm.UserId, farm.OperatorId);

        using var response = await client.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = tags });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(PackingErrors.OrderNotPaid, await ErrorCode(response));
    }

    [Fact]
    public async Task Ho_khac_khong_dong_goi_duoc_don_403()
    {
        var farm = await SeedOrderAsync();
        var tags = await AddCrabsAsync(farm, 2, 500);
        var other = await SeedOrderAsync();
        using var stranger = fixture.OperatorClient(other.UserId, other.OperatorId);

        using var response = await stranger.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = tags });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("pack.order_forbidden", await ErrorCode(response));
        Assert.Equal("Paid", await fixture.WithDbAsync(db => db.SalesOrders.Where(o => o.OrderNo == farm.OrderNo).Select(o => o.Status).SingleAsync()));
    }

    [Fact]
    public async Task Tem_trung_trong_lan_quet_va_tem_chua_kich_hoat()
    {
        var farm = await SeedOrderAsync();
        var printed = await AddCrabsAsync(farm, 1, 500, tagStatus: "Printed");
        var active = await AddCrabsAsync(farm, 2, 500);
        using var client = fixture.OperatorClient(farm.UserId, farm.OperatorId);

        using var dup = await client.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = new[] { active[0], active[0] } });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, dup.StatusCode);
        Assert.Equal(PackingErrors.DuplicateTag, await ErrorCode(dup));

        using var inactive = await client.PostAsJsonAsync($"/api/orders/{farm.OrderNo}/pack", new { tagCodes = printed });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, inactive.StatusCode);
        Assert.Equal(PackingErrors.TagNotActive, await ErrorCode(inactive));
    }

    [Fact]
    public async Task Danh_sach_va_chi_tiet_don_Paid_cua_ho()
    {
        var farm = await SeedOrderAsync();
        using var client = fixture.OperatorClient(farm.UserId, farm.OperatorId);

        var list = await client.GetFromJsonAsync<OperatorOrderSummaryResponse[]>($"/api/operators/me/orders?status=Paid");
        Assert.Contains(list!, o => o.OrderNo == farm.OrderNo && o.Status == "Paid" && o.TotalKg == 1m);
        var detail = await client.GetFromJsonAsync<OperatorOrderDetailResponse>($"/api/operators/me/orders/{farm.OrderNo}");
        Assert.Equal("Paid", detail!.Status);
        Assert.Equal(0m, detail.Lines.Single().AssignedKg);

        using var badStatus = await client.GetAsync("/api/operators/me/orders?status=Cancelled");
        Assert.Equal(HttpStatusCode.BadRequest, badStatus.StatusCode);
        Assert.Equal(PackingErrors.InvalidStatus, await ErrorCode(badStatus));
    }

    private async Task<string> SeedPaidOnListingAsync(long listingId)
    {
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var customer = fixture.Client(customerId);
        using var checkout = await customer.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, listingId, 1m));
        checkout.EnsureSuccessStatusCode();
        var orderNo = (await checkout.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single().OrderNo;
        await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == orderNo);
            order.Status = "Paid";
            order.PaidAt = DateTimeOffset.UtcNow;
            order.UpdatedAt = order.PaidAt.Value;
            await db.SaveChangesAsync();
            return true;
        });
        return orderNo;
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>NH-12 (CS-64) trên LocalDB thật: đánh giá một lần đơn Completed, trả cả đơn trong hạn đổi trả, chặn các trường hợp vi phạm và tính điểm trung bình niêm yết.</summary>
[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class OrderRatingReturnDatabaseTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
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
                Email = $"rate-op-{Guid.NewGuid():N}@test.local",
                FullName = "Hộ nuôi CS-64",
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

    private async Task<Ctx> DeliverAsync(decimal quantityKg = 1m)
    {
        var ctx = await SeedPaidAsync(quantityKg);
        await WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            await db.SalesOrders.Where(o => o.OrderId == order.OrderId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(o => o.Status, "Delivered")
                    .SetProperty(o => o.DeliveredAt, now)
                    .SetProperty(o => o.ReturnWindowEndsAt, now.AddHours(72))
                    .SetProperty(o => o.UpdatedAt, now));
            await db.PaymentRequests.Where(p => p.OrderId == order.OrderId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(p => p.Status, "Paid")
                    .SetProperty(p => p.UpdatedAt, now));
        });
        return ctx;
    }

    private async Task<Ctx> CompleteAsync(decimal quantityKg = 1m)
    {
        var ctx = await DeliverAsync(quantityKg);
        await WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            await db.SalesOrders.Where(o => o.OrderNo == ctx.OrderNo)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(o => o.Status, "Completed")
                    .SetProperty(o => o.CompletedAt, now)
                    .SetProperty(o => o.ReturnWindowEndsAt, now.AddHours(-1))
                    .SetProperty(o => o.UpdatedAt, now));
        });
        return ctx;
    }

    private async Task<int> RunCompletionJobAsync()
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<OrderCompletionService>()
            .CompleteDueAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Danh_gia_don_Completed_201_roi_lan_2_409()
    {
        var ctx = await CompleteAsync();
        using var client = fixture.Client(ctx.CustomerId);

        using var res1 = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/rating", new { stars = 5, comment = " Tươi " });
        Assert.Equal(HttpStatusCode.Created, res1.StatusCode);
        var body = await res1.Content.ReadFromJsonAsync<RatingResponse>();
        Assert.NotNull(body);
        Assert.Equal(5, body.Stars);
        Assert.Equal("Tươi", body.Comment);

        using var res2 = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/rating", new { stars = 1 });
        Assert.Equal(HttpStatusCode.Conflict, res2.StatusCode);
        Assert.Equal("rating.already_exists", await ErrorCode(res2));

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            var count = await db.ProductRatings.CountAsync(r => r.OrderId == order.OrderId);
            Assert.Equal(1, count);
        });

        var view = await client.GetFromJsonAsync<OrderRatingView>($"/api/orders/{ctx.OrderNo}/rating");
        Assert.NotNull(view);
        Assert.False(view.CanRate);
        Assert.NotNull(view.Rating);
        Assert.Equal(5, view.Rating.Stars);
    }

    [Fact]
    public async Task Danh_gia_khi_chua_Completed_422()
    {
        var ctx = await DeliverAsync();
        using var client = fixture.Client(ctx.CustomerId);

        using var res = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/rating", new { stars = 4, comment = "Tốt" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("rating.order_not_completed", await ErrorCode(res));

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            var count = await db.ProductRatings.CountAsync(r => r.OrderId == order.OrderId);
            Assert.Equal(0, count);
        });
    }

    [Fact]
    public async Task Danh_gia_don_nguoi_khac_403_va_khong_co_don_404()
    {
        var ctx = await CompleteAsync();
        var (otherCustomerId, _) = await fixture.CreateCustomerAsync();
        using var otherClient = fixture.Client(otherCustomerId);

        using var forbidden = await otherClient.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/rating", new { stars = 5 });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal("order.not_owner", await ErrorCode(forbidden));

        using var notFound = await otherClient.PostAsJsonAsync("/api/orders/ODDOESNOTEXIST/rating", new { stars = 5 });
        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
        Assert.Equal("order.not_found", await ErrorCode(notFound));
    }

    [Fact]
    public async Task Sao_ngoai_1_den_5_va_comment_dai_400()
    {
        var ctx = await CompleteAsync();
        using var client = fixture.Client(ctx.CustomerId);

        using var zeroStars = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/rating", new { stars = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, zeroStars.StatusCode);

        using var sixStars = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/rating", new { stars = 6 });
        Assert.Equal(HttpStatusCode.BadRequest, sixStars.StatusCode);

        using var longComment = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/rating", new { stars = 5, comment = new string('a', 501) });
        Assert.Equal(HttpStatusCode.BadRequest, longComment.StatusCode);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal(0, await db.ProductRatings.CountAsync(r => r.OrderId == order.OrderId));
        });
    }

    [Fact]
    public async Task Tra_hang_trong_han_thanh_Returned_va_lenh_hoan()
    {
        var ctx = await DeliverAsync();
        decimal stockBefore = 0;
        decimal revenueBefore = 0;
        long expectedPaid = 0;
        await WithDbAsync(async db =>
        {
            var listing = await db.ProductListings.SingleAsync(l => l.ListingId == ctx.ListingId);
            stockBefore = listing.StockQtyKg;
            var rev = await db.VBatchActualRevenues.SingleAsync(v => v.BatchId == ctx.BatchId);
            revenueBefore = rev.OrderRevenue;
            var order = await db.SalesOrders.Include(o => o.PaymentRequests).SingleAsync(o => o.OrderNo == ctx.OrderNo);
            expectedPaid = (long)order.PaymentRequests.Where(p => p.Status == "Paid").Sum(p => p.Amount);
        });

        using var client = fixture.Client(ctx.CustomerId);
        using var res = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return", new { reason = "Cua chết khi mở thùng nhận hàng" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var body = await res.Content.ReadFromJsonAsync<ReturnOrderResponse>();
        Assert.NotNull(body);
        Assert.Equal("Returned", body.Status);
        Assert.Equal(expectedPaid, body.RefundAmount);
        Assert.True(body.RefundInstructionId > 0);

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal("Returned", order.Status);
            Assert.Null(order.CancelledAt);
            Assert.Null(order.CancelReason);

            var instructions = await db.PaymentInstructions
                .Where(i => i.OrderId == order.OrderId && i.InstructionType == "Refund")
                .ToListAsync();
            Assert.Single(instructions);
            Assert.Equal(expectedPaid, (long)instructions[0].Amount);

            var listing = await db.ProductListings.SingleAsync(l => l.ListingId == ctx.ListingId);
            Assert.Equal(stockBefore, listing.StockQtyKg);

            var rev = await db.VBatchActualRevenues.SingleAsync(v => v.BatchId == ctx.BatchId);
            Assert.Equal(revenueBefore, rev.OrderRevenue);

            var audit = await db.AuditLogs.SingleAsync(a => a.EntityType == "sales_order" && a.EntityId == order.OrderId && a.ActionType == "return");
            Assert.NotNull(audit.NewValue);
            using var doc = JsonDocument.Parse(audit.NewValue!);
            Assert.Equal("Returned", doc.RootElement.GetProperty("status").GetString());
        });
    }

    [Fact]
    public async Task Tra_hang_het_han_va_sai_trang_thai()
    {
        var ctxExpired = await DeliverAsync();
        await WithDbAsync(async db =>
        {
            await db.SalesOrders.Where(o => o.OrderNo == ctxExpired.OrderNo)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.ReturnWindowEndsAt, DateTimeOffset.UtcNow.AddMinutes(-5)));
        });

        using var clientA = fixture.Client(ctxExpired.CustomerId);
        using var resA = await clientA.PostAsJsonAsync($"/api/orders/{ctxExpired.OrderNo}/return", new { reason = "Trả hàng khi đã quá hạn 72 giờ" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, resA.StatusCode);
        Assert.Equal("order.return_window_closed", await ErrorCode(resA));

        var ctxPaid = await SeedPaidAsync();
        using var clientB = fixture.Client(ctxPaid.CustomerId);
        using var resB = await clientB.PostAsJsonAsync($"/api/orders/{ctxPaid.OrderNo}/return", new { reason = "Trả hàng khi đơn mới thanh toán" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, resB.StatusCode);
        Assert.Equal("order.return_not_delivered", await ErrorCode(resB));

        var ctxReturned = await DeliverAsync();
        using var clientC = fixture.Client(ctxReturned.CustomerId);
        using var firstReturn = await clientC.PostAsJsonAsync($"/api/orders/{ctxReturned.OrderNo}/return", new { reason = "Trả hàng lần đầu hợp lệ trong hạn" });
        firstReturn.EnsureSuccessStatusCode();

        using var secondReturn = await clientC.PostAsJsonAsync($"/api/orders/{ctxReturned.OrderNo}/return", new { reason = "Trả hàng lần thứ hai trên đơn đã trả" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, secondReturn.StatusCode);
        Assert.Equal("order.already_returned", await ErrorCode(secondReturn));

        await WithDbAsync(async db =>
        {
            var orderA = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctxExpired.OrderNo);
            var orderB = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctxPaid.OrderNo);
            var orderC = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctxReturned.OrderNo);
            Assert.Equal(0, await db.PaymentInstructions.CountAsync(i => i.OrderId == orderA.OrderId));
            Assert.Equal(0, await db.PaymentInstructions.CountAsync(i => i.OrderId == orderB.OrderId));
            Assert.Equal(1, await db.PaymentInstructions.CountAsync(i => i.OrderId == orderC.OrderId && i.InstructionType == "Refund"));
        });
    }

    [Fact]
    public async Task Tra_hang_bi_chan_boi_khieu_nai_tai_khoan_dong_va_quyet_toan()
    {
        var ctx1 = await DeliverAsync();
        var ctx2 = await DeliverAsync();
        var ctx3 = await DeliverAsync();

        var now = DateTimeOffset.UtcNow;
        await WithDbAsync(async db =>
        {
            var order1 = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx1.OrderNo);
            db.Complaints.Add(new Complaint
            {
                OrderId = order1.OrderId,
                ComplaintType = "Damaged",
                Description = "Cua yếu khi nhận",
                Status = "Open",
                OpenedAt = now,
                CreatedAt = now,
                UpdatedAt = now,
            });

            var order2 = await db.SalesOrders.Include(o => o.PaymentRequests).SingleAsync(o => o.OrderNo == ctx2.OrderNo);
            var accountId2 = order2.PaymentRequests.First().BatchAccountId;
            await db.BatchAccounts.Where(a => a.BatchAccountId == accountId2)
                .ExecuteUpdateAsync(s => s.SetProperty(a => a.Status, "Closed"));

            db.Settlements.Add(new Settlement
            {
                BatchId = ctx3.BatchId,
                RevisionNo = 1,
                ActualRevenue = 1_000_000m,
                LockedStandardCost = 1_000_000m,
                RevenuePool = 0,
                OperatorSharePct = 20m,
                OperatorRemuneration = 0,
                DepreciationAmount = 0,
                TaxTotal = 0,
                Status = "Approved",
                ApprovedAt = now,
                CreatedAt = now,
                UpdatedAt = now,
            });

            await db.SaveChangesAsync();
        });

        using var c1 = fixture.Client(ctx1.CustomerId);
        using var r1 = await c1.PostAsJsonAsync($"/api/orders/{ctx1.OrderNo}/return", new { reason = "Muốn trả hàng khi đang có khiếu nại" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, r1.StatusCode);
        Assert.Equal("order.return_blocked_by_complaint", await ErrorCode(r1));

        using var c2 = fixture.Client(ctx2.CustomerId);
        using var r2 = await c2.PostAsJsonAsync($"/api/orders/{ctx2.OrderNo}/return", new { reason = "Muốn trả hàng khi tài khoản lô đã đóng" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, r2.StatusCode);
        Assert.Equal("order.return_batch_account_closed", await ErrorCode(r2));

        using var c3 = fixture.Client(ctx3.CustomerId);
        using var r3 = await c3.PostAsJsonAsync($"/api/orders/{ctx3.OrderNo}/return", new { reason = "Muốn trả hàng khi lô đã quyết toán" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, r3.StatusCode);
        Assert.Equal("order.return_batch_settled", await ErrorCode(r3));

        await WithDbAsync(async db =>
        {
            Assert.Equal("Delivered", (await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx1.OrderNo)).Status);
            Assert.Equal("Delivered", (await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx2.OrderNo)).Status);
            Assert.Equal("Delivered", (await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx3.OrderNo)).Status);
        });
    }

    [Fact]
    public async Task Khieu_nai_Rejected_van_tra_duoc()
    {
        var ctx = await DeliverAsync();
        var now = DateTimeOffset.UtcNow;
        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            db.Complaints.Add(new Complaint
            {
                OrderId = order.OrderId,
                ComplaintType = "Damaged",
                Description = "Khiếu nại đã bị bác bỏ",
                Status = "Rejected",
                Resolution = "NoAction",
                OpenedAt = now,
                ResolvedAt = now,
                CreatedAt = now,
                UpdatedAt = now,
            });
            await db.SaveChangesAsync();
        });

        using var client = fixture.Client(ctx.CustomerId);
        using var res = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return", new { reason = "Trả hàng trong hạn sau khi khiếu nại bị bác bỏ" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<ReturnOrderResponse>();
        Assert.NotNull(body);
        Assert.Equal("Returned", body.Status);
    }

    [Fact]
    public async Task Ly_do_ngan_422_va_canReturn_khop()
    {
        var ctxDelivered = await DeliverAsync();
        var ctxCompleted = await CompleteAsync();

        using var clientDelivered = fixture.Client(ctxDelivered.CustomerId);
        using var shortRes = await clientDelivered.PostAsJsonAsync($"/api/orders/{ctxDelivered.OrderNo}/return", new { reason = "ngan" });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, shortRes.StatusCode);
        Assert.Equal("order.return_reason_required", await ErrorCode(shortRes));

        var detailDelivered = await clientDelivered.GetFromJsonAsync<OrderTrackingResponse>($"/api/orders/{ctxDelivered.OrderNo}");
        Assert.NotNull(detailDelivered);
        Assert.True(detailDelivered.CanReturn);

        using var clientCompleted = fixture.Client(ctxCompleted.CustomerId);
        var detailCompleted = await clientCompleted.GetFromJsonAsync<OrderTrackingResponse>($"/api/orders/{ctxCompleted.OrderNo}");
        Assert.NotNull(detailCompleted);
        Assert.False(detailCompleted.CanReturn);
    }

    [Fact]
    public async Task Job_khong_hoan_tat_don_da_Returned()
    {
        var ctx = await DeliverAsync();
        using var client = fixture.Client(ctx.CustomerId);
        using var ret = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return", new { reason = "Trả hàng hợp lệ trước khi job chạy" });
        ret.EnsureSuccessStatusCode();

        await WithDbAsync(async db =>
        {
            await db.SalesOrders.Where(o => o.OrderNo == ctx.OrderNo)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.ReturnWindowEndsAt, DateTimeOffset.UtcNow.AddHours(-2)));
        });

        await RunCompletionJobAsync();

        await WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.SingleAsync(o => o.OrderNo == ctx.OrderNo);
            Assert.Equal("Returned", order.Status);
            Assert.Null(order.CompletedAt);
        });
    }

    [Fact]
    public async Task Diem_niem_yet_trung_binh_dung_don()
    {
        var otherListingId = await fixture.CreateListingAsync(stockKg: 10);
        var ctx = await CompleteAsync();
        using var client = fixture.Client(ctx.CustomerId);

        using var rate = await client.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/rating", new { stars = 4, comment = "Cua chắc thịt" });
        Assert.Equal(HttpStatusCode.Created, rate.StatusCode);

        var detail = await client.GetFromJsonAsync<StoreListingDetailResponse>($"/api/listings/{ctx.ListingId}");
        Assert.NotNull(detail);
        Assert.Equal(1, detail.Listing.RatingCount);
        Assert.Equal(4m, detail.Listing.AverageStars);

        var otherDetail = await client.GetFromJsonAsync<StoreListingDetailResponse>($"/api/listings/{otherListingId}");
        Assert.NotNull(otherDetail);
        Assert.Equal(0, otherDetail.Listing.RatingCount);
        Assert.Null(otherDetail.Listing.AverageStars);

        var list = await client.GetFromJsonAsync<PagedResult<StoreListingResponse>>("/api/listings?pageSize=100");
        Assert.NotNull(list);
        var ratedItem = Assert.Single(list.Items, i => i.ListingId == ctx.ListingId);
        Assert.Equal(1, ratedItem.RatingCount);
        Assert.Equal(4m, ratedItem.AverageStars);
    }

    [Fact]
    public async Task Yeu_cau_tra_hang_co_bang_chung_va_Operator_phe_duyet()
    {
        var ctx = await DeliverAsync();
        using var customer = fixture.Client(ctx.CustomerId);
        using var op = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        // 1. Gửi yêu cầu trả hàng thiếu bằng chứng -> 422
        using var missingEvidence = await customer.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return", new
        {
            reason = "Cua chết khi mở thùng nhận hàng",
            requireApproval = true,
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, missingEvidence.StatusCode);
        Assert.Equal("order.return_evidence_required", await ErrorCode(missingEvidence));

        // 2. Gửi yêu cầu trả hàng có bằng chứng -> Pending
        using var reqRes = await customer.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return", new
        {
            reason = "Cua chết khi mở thùng nhận hàng",
            evidenceUri = "https://example.com/unboxing-video.mp4",
            requireApproval = true,
        });
        Assert.Equal(HttpStatusCode.OK, reqRes.StatusCode);
        var reqBody = await reqRes.Content.ReadFromJsonAsync<ReturnOrderResponse>();
        Assert.NotNull(reqBody);
        Assert.Equal("ReturnRequested", reqBody.Status);
        Assert.Equal("Pending", reqBody.ReturnRequest?.Status);

        // 3. Operator từ chối yêu cầu trả hàng -> Rejected
        using var rejectRes = await op.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return/reject", new
        {
            reason = "Video chưa quay rõ mã tem QR trên càng cua",
            evidenceUri = "https://example.com/packing-photo.jpg",
        });
        Assert.Equal(HttpStatusCode.OK, rejectRes.StatusCode);
        var opDetailAfterReject = await rejectRes.Content.ReadFromJsonAsync<OperatorOrderDetailResponse>();
        Assert.NotNull(opDetailAfterReject);
        Assert.Equal("Rejected", opDetailAfterReject.ReturnRequest?.Status);

        // 4. Khách xem lại đơn thấy lý do từ chối và được phép gửi lại (CanReturn = true)
        var trackAfterReject = await customer.GetFromJsonAsync<OrderTrackingResponse>($"/api/orders/{ctx.OrderNo}");
        Assert.NotNull(trackAfterReject);
        Assert.True(trackAfterReject.CanReturn);
        Assert.Equal("Rejected", trackAfterReject.ReturnRequest?.Status);
        Assert.Equal("Video chưa quay rõ mã tem QR trên càng cua", trackAfterReject.ReturnRequest?.OperatorNote);

        // 5. Khách gửi lại yêu cầu bổ sung bằng chứng -> Pending
        using var resubmitRes = await customer.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return", new
        {
            reason = "Đã quay rõ mã tem QR trên càng cua bị chết",
            evidenceUri = "https://example.com/clear-qr-video.mp4",
            requireApproval = true,
        });
        resubmitRes.EnsureSuccessStatusCode();

        // 6. Operator duyệt chấp nhận trả hàng -> Returned + tạo lệnh hoàn tiền
        using var approveRes = await op.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return/approve", new
        {
            note = "Đã xác minh đúng mã tem QR, đồng ý hoàn tiền cho khách.",
        });
        Assert.Equal(HttpStatusCode.OK, approveRes.StatusCode);
        var opDetailAfterApprove = await approveRes.Content.ReadFromJsonAsync<OperatorOrderDetailResponse>();
        Assert.NotNull(opDetailAfterApprove);
        Assert.Equal("Returned", opDetailAfterApprove.Status);
        Assert.Equal("Approved", opDetailAfterApprove.ReturnRequest?.Status);
        Assert.True(opDetailAfterApprove.RefundAmount > 0);
    }

    [Fact]
    public async Task Operator_xem_duoc_thong_ke_counts_va_loc_theo_cac_trang_thai()
    {
        var ctx = await DeliverAsync();
        using var customer = fixture.Client(ctx.CustomerId);
        using var op = fixture.OperatorClient(ctx.OperatorUserId, ctx.OperatorId);

        // Ban đầu chưa có yêu cầu trả hàng
        var countsBefore = await op.GetFromJsonAsync<OperatorOrderCountsResponse>("/api/operators/me/orders/counts");
        Assert.NotNull(countsBefore);
        Assert.True(countsBefore.All >= 1);
        Assert.Equal(0, countsBefore.ReturnRequested);
        Assert.True(countsBefore.Delivered >= 1);

        // Khách gửi yêu cầu trả hàng
        using var returnRes = await customer.PostAsJsonAsync($"/api/orders/{ctx.OrderNo}/return", new
        {
            reason = "Cua chết khi giao",
            evidenceUri = "https://example.com/dead.jpg",
            requireApproval = true,
        });
        returnRes.EnsureSuccessStatusCode();

        // Kiểm tra counts sau khi gửi yêu cầu trả hàng
        var countsAfter = await op.GetFromJsonAsync<OperatorOrderCountsResponse>("/api/operators/me/orders/counts");
        Assert.NotNull(countsAfter);
        Assert.Equal(1, countsAfter.ReturnRequested);

        // Operator lọc danh sách với status = All
        var allList = await op.GetFromJsonAsync<List<OperatorOrderSummaryResponse>>("/api/operators/me/orders?status=All");
        Assert.NotNull(allList);
        Assert.Contains(allList, o => o.OrderNo == ctx.OrderNo);

        // Operator lọc danh sách với status = ReturnRequested
        var returnReqList = await op.GetFromJsonAsync<List<OperatorOrderSummaryResponse>>("/api/operators/me/orders?status=ReturnRequested");
        Assert.NotNull(returnReqList);
        var pendingOrder = Assert.Single(returnReqList, o => o.OrderNo == ctx.OrderNo);
        Assert.Equal("Pending", pendingOrder.ReturnRequest?.Status);
    }
}

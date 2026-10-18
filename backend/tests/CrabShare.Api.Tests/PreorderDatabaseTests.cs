using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Features.Payments;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class PreorderDatabaseTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private static async Task<WebhookResult> SimulateAsync(HttpClient client, string referenceCode)
    {
        using var response = await client.PostAsJsonAsync("/api/dev/payments/simulate", new { referenceCode });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WebhookResult>())!;
    }

    [Fact]
    public async Task Dat_truoc_2kg_tao_don_PreOrder_va_khoan_coc_DC_khong_giu_ton_listing()
    {
        var info = await fixture.CreateInProductionListingAsync(expectedOutputKg: 20, pricePerKg: 400_000, depositPct: 15);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new
        {
            listingId = info.ListingId,
            quantityKg = 2m,
            addressId,
        });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<PreorderResponse>())!;
        Assert.Equal("PendingPayment", body.Status);
        Assert.Equal(800_000L, body.TotalAmount);
        Assert.Equal(120_000L, body.DepositAmount);
        Assert.Equal(120_000L, body.Payment.Amount);
        Assert.StartsWith("DC", body.Payment.ReferenceCode);

        await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == body.OrderNo);
            Assert.Equal("PreOrder", order.OrderType);
            Assert.Equal("PendingPayment", order.Status);
            Assert.Equal(120_000m, order.DepositAmount);
            Assert.Null(order.PaidAt);

            var listing = await db.ProductListings.AsNoTracking().SingleAsync(l => l.ListingId == info.ListingId);
            Assert.Equal(0m, listing.ReservedQtyKg);
            Assert.Equal(0m, listing.StockQtyKg);
            Assert.False(await db.StockReservations.AnyAsync(r => r.OrderLine.OrderId == order.OrderId));
            return true;
        });
    }

    [Fact]
    public async Task Simulate_ma_DC_chuyen_don_sang_DepositPaid_paidAt_null_reserved_bang_0()
    {
        var info = await fixture.CreateInProductionListingAsync(expectedOutputKg: 20, pricePerKg: 400_000, depositPct: 15);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 2m, addressId });
        var body = (await res.Content.ReadFromJsonAsync<PreorderResponse>())!;

        var sim = await SimulateAsync(client, body.Payment.ReferenceCode);
        Assert.Equal(WebhookResult.Matched, sim.Outcome);
        Assert.Equal(PaymentPurposes.PreOrderDeposit, sim.Purpose);

        await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == body.OrderNo);
            Assert.Equal("DepositPaid", order.Status);
            Assert.Null(order.PaidAt);

            var listing = await db.ProductListings.AsNoTracking().SingleAsync(l => l.ListingId == info.ListingId);
            Assert.Equal(0m, listing.ReservedQtyKg);
            Assert.True(AuditChainVerifier.Verify(await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync()).IsValid);
            return true;
        });
    }

    [Fact]
    public async Task Simulate_bang_orderNo_khong_khop_khoan_coc()
    {
        var info = await fixture.CreateInProductionListingAsync();
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 1m, addressId });
        var body = (await res.Content.ReadFromJsonAsync<PreorderResponse>())!;

        using var simRes = await client.PostAsJsonAsync("/api/dev/payments/simulate", new { referenceCode = body.OrderNo });
        Assert.Equal(HttpStatusCode.NotFound, simRes.StatusCode);

        await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == body.OrderNo);
            Assert.Equal("PendingPayment", order.Status);
            return true;
        });
    }

    [Fact]
    public async Task Dat_vuot_tran_tra_422_preorder_cap_exceeded()
    {
        var info = await fixture.CreateInProductionListingAsync(expectedOutputKg: 20); // cap = 12 kg
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 13m, addressId });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("preorder.cap_exceeded", await ErrorCode(res));

        await fixture.WithDbAsync(async db =>
        {
            Assert.Equal(0, await db.SalesOrders.CountAsync(o => o.BatchId == info.BatchId));
            return true;
        });
    }

    [Fact]
    public async Task Hai_request_song_song_cung_day_qua_tran_mot_201_mot_422()
    {
        var info = await fixture.CreateInProductionListingAsync(expectedOutputKg: 20); // cap = 12 kg
        var (c1, a1) = await fixture.CreateCustomerAsync();
        var (c2, a2) = await fixture.CreateCustomerAsync();
        using var client1 = fixture.Client(c1);
        using var client2 = fixture.Client(c2);

        var t1 = client1.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 8m, addressId = a1 });
        var t2 = client2.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 8m, addressId = a2 });
        var responses = await Task.WhenAll(t1, t2);

        var codes = responses.Select(r => r.StatusCode).OrderBy(c => c).ToArray();
        Assert.Equal([HttpStatusCode.Created, HttpStatusCode.UnprocessableEntity], codes);
        var failed = responses.Single(r => r.StatusCode == HttpStatusCode.UnprocessableEntity);
        Assert.Equal("preorder.cap_exceeded", await ErrorCode(failed));

        await fixture.WithDbAsync(async db =>
        {
            var totalPreorderKg = await db.OrderLines
                .Where(l => l.BatchId == info.BatchId && l.SalesOrder.OrderType == "PreOrder" && l.SalesOrder.Status != "Cancelled" && l.SalesOrder.Status != "Returned")
                .SumAsync(l => (decimal?)l.QuantityKg) ?? 0m;
            Assert.True(totalPreorderKg <= 12m);
            Assert.Equal(8m, totalPreorderKg);
            return true;
        });
    }

    [Fact]
    public async Task Lo_Harvesting_goi_preorders_tra_422_preorder_batch_not_in_production()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 10);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId, quantityKg = 1m, addressId });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("preorder.batch_not_in_production", await ErrorCode(res));
    }

    [Fact]
    public async Task Thanh_vien_ho_nuoi_dat_truoc_lo_cua_minh_tra_422_preorder_related_party()
    {
        var info = await fixture.CreateInProductionListingAsync();
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        await fixture.AttachOperatorMemberAsync(customerId, info.OperatorId);
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 1m, addressId });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("preorder.related_party", await ErrorCode(res));
    }

    [Fact]
    public async Task Tai_khoan_lo_Closed_tra_422_order_batch_account_unavailable()
    {
        var info = await fixture.CreateInProductionListingAsync(accountStatus: "Closed");
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 1m, addressId });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("order.batch_account_unavailable", await ErrorCode(res));
    }

    [Fact]
    public async Task Issue_balances_khi_lo_Harvesting_phat_dung_mot_khoan_DT_idempotent()
    {
        var info = await fixture.CreateInProductionListingAsync(expectedOutputKg: 20, pricePerKg: 400_000, depositPct: 15);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 2m, addressId });
        var placed = (await res.Content.ReadFromJsonAsync<PreorderResponse>())!;
        await SimulateAsync(client, placed.Payment.ReferenceCode);

        await fixture.SetBatchStatusAsync(info.BatchId, "Harvesting");

        using var issue1 = await client.PostAsync($"/api/dev/preorders/issue-balances/{info.BatchCode}", null);
        Assert.Equal(HttpStatusCode.OK, issue1.StatusCode);
        var body1 = (await issue1.Content.ReadFromJsonAsync<IssueBalancesResponse>())!;
        Assert.Equal(1, body1.IssuedCount);
        Assert.Contains(placed.OrderNo, body1.OrderNos);

        using var issue2 = await client.PostAsync($"/api/dev/preorders/issue-balances/{info.BatchCode}", null);
        Assert.Equal(HttpStatusCode.OK, issue2.StatusCode);
        var body2 = (await issue2.Content.ReadFromJsonAsync<IssueBalancesResponse>())!;
        Assert.Equal(0, body2.IssuedCount);

        await fixture.WithDbAsync(async db =>
        {
            var balanceReq = await db.PaymentRequests.AsNoTracking()
                .SingleAsync(r => r.Order!.OrderNo == placed.OrderNo && r.Purpose == PaymentPurposes.PreOrderBalance);
            Assert.StartsWith("DT", balanceReq.ReferenceCode);
            Assert.Equal(680_000m, balanceReq.Amount);
            return true;
        });
    }

    [Fact]
    public async Task Issue_balances_khi_lo_con_InProduction_tra_422_preorder_batch_not_harvesting()
    {
        var info = await fixture.CreateInProductionListingAsync();
        var (customerId, _) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsync($"/api/dev/preorders/issue-balances/{info.BatchCode}", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("preorder.batch_not_harvesting", await ErrorCode(res));
    }

    [Fact]
    public async Task Simulate_ma_DT_chuyen_don_sang_Paid_va_ghi_paidAt()
    {
        var info = await fixture.CreateInProductionListingAsync(expectedOutputKg: 20, pricePerKg: 400_000, depositPct: 15);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 2m, addressId });
        var placed = (await res.Content.ReadFromJsonAsync<PreorderResponse>())!;
        await SimulateAsync(client, placed.Payment.ReferenceCode);

        await fixture.SetBatchStatusAsync(info.BatchId, "Harvesting");
        await client.PostAsync($"/api/dev/preorders/issue-balances/{info.BatchCode}", null);

        var dtRef = await fixture.WithDbAsync(db =>
            db.PaymentRequests.AsNoTracking()
                .Where(r => r.Order!.OrderNo == placed.OrderNo && r.Purpose == PaymentPurposes.PreOrderBalance)
                .Select(r => r.ReferenceCode)
                .SingleAsync());

        var sim = await SimulateAsync(client, dtRef);
        Assert.Equal(WebhookResult.Matched, sim.Outcome);
        Assert.Equal(PaymentPurposes.PreOrderBalance, sim.Purpose);

        await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == placed.OrderNo);
            Assert.Equal("Paid", order.Status);
            Assert.NotNull(order.PaidAt);
            Assert.True(AuditChainVerifier.Verify(await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync()).IsValid);
            return true;
        });
    }

    [Fact]
    public async Task Qua_han_15_phut_chua_tra_coc_job_expiry_huy_don_va_tra_tran()
    {
        var info = await fixture.CreateInProductionListingAsync(expectedOutputKg: 20); // cap = 12 kg
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 12m, addressId });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var placed = (await res.Content.ReadFromJsonAsync<PreorderResponse>())!;

        await fixture.WithDbAsync(async db =>
        {
            await db.PaymentRequests
                .Where(r => r.PaymentRequestId == placed.Payment.PaymentRequestId)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
            return 0;
        });

        await using (var scope = fixture.Factory.Services.CreateAsyncScope())
        {
            var expiry = scope.ServiceProvider.GetRequiredService<ReservationExpiryService>();
            var count = await expiry.ReleaseExpiredAsync(CancellationToken.None);
            Assert.True(count >= 1);
        }

        await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == placed.OrderNo);
            Assert.Equal("Cancelled", order.Status);
            Assert.Equal(ReservationExpiryService.TimeoutReason, order.CancelReason);
            var req = await db.PaymentRequests.AsNoTracking().SingleAsync(r => r.PaymentRequestId == placed.Payment.PaymentRequestId);
            Assert.Equal("Expired", req.Status);
            return true;
        });

        using var retry = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 12m, addressId });
        Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
    }

    [Fact]
    public async Task Get_listing_cong_khai_co_isPreorder_true_va_remainingPreorderKg_giam_sau_khi_dat()
    {
        var info = await fixture.CreateInProductionListingAsync(expectedOutputKg: 20); // cap = 12 kg
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        var before = (await client.GetFromJsonAsync<StoreListingDetailResponse>($"/api/listings/{info.ListingId}"))!;
        Assert.True(before.Listing.IsPreorder);
        Assert.Equal("InProduction", before.Listing.BatchStatus);
        Assert.Equal(12m, before.Listing.RemainingPreorderKg);
        Assert.Equal(15m, before.Listing.DepositPct);

        using var res = await client.PostAsJsonAsync("/api/preorders", new { listingId = info.ListingId, quantityKg = 3.5m, addressId });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);

        var after = (await client.GetFromJsonAsync<StoreListingDetailResponse>($"/api/listings/{info.ListingId}"))!;
        Assert.Equal(8.5m, after.Listing.RemainingPreorderKg);
    }

    [Fact]
    public async Task Checkout_ban_le_listing_InProduction_bi_chan_422_order_batch_not_harvesting()
    {
        var info = await fixture.CreateInProductionListingAsync();
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var res = await client.PostAsJsonAsync("/api/orders/checkout", new
        {
            addressId,
            lines = new[] { new { listingId = info.ListingId, quantityKg = 1m } },
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("order.batch_not_harvesting", await ErrorCode(res));
    }
}

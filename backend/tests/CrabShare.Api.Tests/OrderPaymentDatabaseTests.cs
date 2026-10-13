using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Features.Payments;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Tests;

/// <summary>
/// NH-06 (CS-43): tiền đơn hàng về qua webhook TH-06 → đơn Paid, giữ chỗ Committed, tồn gốc trừ đúng một lần
/// (TL-28 §3.3, §8); webhook gửi lại hoặc tiền đến lần hai không trừ tồn thêm.
/// </summary>
[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class OrderPaymentDatabaseTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private string Secret => fixture.Factory.Services.GetRequiredService<IOptions<PaymentOptions>>().Value.WebhookSecret;

    private static object Cart(long addressId, params (long ListingId, decimal QuantityKg)[] lines) => new
    {
        addressId,
        lines = lines.Select(l => new { listingId = l.ListingId, quantityKg = l.QuantityKg }).ToArray(),
    };

    private async Task<(HttpClient Client, CheckoutOrderResponse Order)> PlaceAsync(params (long ListingId, decimal QuantityKg)[] lines)
    {
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        var client = fixture.Client(customerId);
        using var response = await client.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, lines));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single();
        return (client, order);
    }

    private static async Task<WebhookResult> SimulateAsync(HttpClient client, string referenceCode)
    {
        using var response = await client.PostAsJsonAsync("/api/dev/payments/simulate", new { referenceCode });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WebhookResult>())!;
    }

    /// <summary>Gửi webhook như trung gian thanh toán (cùng providerTxnId để thử gửi lại).</summary>
    private async Task<WebhookResult> WebhookAsync(CheckoutOrderResponse order, string providerTxnId)
    {
        var body = JsonSerializer.Serialize(new
        {
            providerTxnId, accountNo = order.Payment.AccountNo, amount = order.Payment.Amount,
            content = $"{order.Payment.ReferenceCode} thanh toan don", occurredAt = DateTimeOffset.UtcNow,
        }, Json);
        using var client = fixture.Factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/webhooks/payment-provider")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add(WebhookSignature.Header, WebhookSignature.Compute(Secret, body));
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WebhookResult>())!;
    }

    private Task<(decimal Stock, decimal Reserved)> StockAsync(long listingId) => fixture.WithDbAsync(async db =>
    {
        var l = await db.ProductListings.AsNoTracking().SingleAsync(x => x.ListingId == listingId);
        return (l.StockQtyKg, l.ReservedQtyKg);
    });

    [Fact]
    public async Task Tien_ve_thi_don_Paid_giu_cho_Committed_va_tru_ton_dung_so()
    {
        var first = await fixture.CreateListingAsync(stockKg: 10, pricePerKg: 400_000);
        var second = await fixture.CreateListingAsync(stockKg: 4, pricePerKg: 300_000); // đối chứng: không nằm trong đơn
        var (client, order) = await PlaceAsync((first, 2.5m));
        Assert.True(order.Payment.PaymentRequestId > 0);
        Assert.Equal((10m, 2.5m), await StockAsync(first));
        var before = DateTimeOffset.UtcNow;

        var result = await SimulateAsync(client, order.Payment.ReferenceCode);

        Assert.Equal(WebhookResult.Matched, result.Outcome);
        Assert.Equal((order.Payment.ReferenceCode, order.Payment.PaymentRequestId, PaymentPurposes.OrderPayment),
            (result.ReferenceCode, result.PaymentRequestId, result.Purpose));
        Assert.Null(result.RefundInstructionId);

        Assert.Equal((7.5m, 0m), await StockAsync(first));
        Assert.Equal((4m, 0m), await StockAsync(second)); // niêm yết khác không bị đụng
        await fixture.WithDbAsync(async db =>
        {
            var row = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == order.OrderNo);
            Assert.Equal("Paid", row.Status);
            Assert.NotNull(row.PaidAt);
            Assert.InRange(row.PaidAt!.Value, before.AddSeconds(-5), DateTimeOffset.UtcNow.AddSeconds(5));
            Assert.Equal(row.PaidAt, row.UpdatedAt);

            var reservation = await db.StockReservations.AsNoTracking().SingleAsync(s => s.OrderLine.OrderId == row.OrderId);
            Assert.Equal(("Committed", 2.5m), (reservation.Status, reservation.QuantityKg));

            var payment = await db.PaymentRequests.AsNoTracking().SingleAsync(p => p.PaymentRequestId == order.Payment.PaymentRequestId);
            Assert.Equal(("Paid", row.OrderId), (payment.Status, payment.OrderId!.Value));

            var audits = await db.AuditLogs.Where(a =>
                    (a.EntityType == "sales_order" && a.EntityId == row.OrderId)
                    || (a.EntityType == "payment_request" && a.EntityId == payment.PaymentRequestId && a.ActionType == "paid")
                    || (a.EntityType == "provider_transaction" && a.EntityId == result.TransactionId && a.ActionType == "receive"))
                .ToListAsync();
            Assert.Equal(3, audits.Count);
            var paid = Assert.Single(audits, a => a.EntityType == "sales_order");
            Assert.Equal("paid", paid.ActionType);
            Assert.Contains("\"committed\"", paid.NewValue);
            Assert.True(AuditChainVerifier.Verify(await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync()).IsValid);
            return true;
        });

        var mine = (await client.GetFromJsonAsync<PaymentRequestResponse>($"/api/payment-requests/{order.Payment.PaymentRequestId}"))!;
        Assert.Equal("Paid", mine.Status);
        Assert.Null(mine.QrContent);
    }

    [Fact]
    public async Task Webhook_gui_lai_cung_giao_dich_khong_tru_ton_lan_nua()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 6);
        var (_, order) = await PlaceAsync((listingId, 1.5m));
        var providerTxnId = $"BANK-{Guid.NewGuid():N}"[..30];

        var first = await WebhookAsync(order, providerTxnId);
        var second = await WebhookAsync(order, providerTxnId);

        Assert.Equal(WebhookResult.Matched, first.Outcome);
        Assert.Equal(WebhookResult.Duplicate, second.Outcome);
        Assert.Equal(first.TransactionId, second.TransactionId);
        Assert.Equal((4.5m, 0m), await StockAsync(listingId));
        await fixture.WithDbAsync(async db =>
        {
            var row = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == order.OrderNo);
            Assert.Equal("Paid", row.Status);
            Assert.Equal(1, await db.ProviderTransactions.CountAsync(t => t.ProviderTxnId == providerTxnId));
            Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.EntityType == "sales_order" && a.EntityId == row.OrderId && a.ActionType == "paid"));
            Assert.Equal(1, await db.StockReservations.CountAsync(s => s.OrderLine.OrderId == row.OrderId && s.Status == "Committed"));
            return true;
        });
    }

    [Fact]
    public async Task Tien_den_lan_hai_cho_don_da_Paid_thi_LatePayment_lap_lenh_hoan_va_ton_giu_nguyen()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 6, pricePerKg: 500_000);
        var (client, order) = await PlaceAsync((listingId, 2m));

        var first = await SimulateAsync(client, order.Payment.ReferenceCode);
        var second = await SimulateAsync(client, order.Payment.ReferenceCode);

        Assert.Equal(WebhookResult.Matched, first.Outcome);
        Assert.Equal(WebhookResult.LatePayment, second.Outcome);
        Assert.NotNull(second.RefundInstructionId);
        Assert.Equal((4m, 0m), await StockAsync(listingId));
        await fixture.WithDbAsync(async db =>
        {
            var row = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == order.OrderNo);
            Assert.Equal("Paid", row.Status);
            var refund = await db.PaymentInstructions.AsNoTracking().SingleAsync(i => i.InstructionId == second.RefundInstructionId);
            Assert.Equal(("Refund", "Created", 1_000_000m, row.OrderId), (refund.InstructionType, refund.Status, refund.Amount, refund.OrderId!.Value));
            Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.EntityType == "sales_order" && a.EntityId == row.OrderId && a.ActionType == "paid"));
            Assert.True(AuditChainVerifier.Verify(await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync()).IsValid);
            return true;
        });
    }

    [Fact]
    public async Task Don_da_huy_ma_tien_van_ve_thi_chi_ghi_audit_khong_tru_ton()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 6);
        var (client, order) = await PlaceAsync((listingId, 1m));
        // Giả lập NH-07 huỷ đơn và trả giữ chỗ nhưng chưa huỷ payment_request (webhook vẫn khớp được mã)
        var orderId = await fixture.WithDbAsync(async db =>
        {
            var row = await db.SalesOrders.SingleAsync(o => o.OrderNo == order.OrderNo);
            row.Status = "Cancelled";
            row.CancelledAt = DateTimeOffset.UtcNow;
            await db.StockReservations.Where(s => s.OrderLine.OrderId == row.OrderId).ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "Released"));
            await db.ProductListings.Where(l => l.ListingId == listingId).ExecuteUpdateAsync(s => s.SetProperty(l => l.ReservedQtyKg, l => l.ReservedQtyKg - 1m));
            await db.SaveChangesAsync();
            return row.OrderId;
        });

        var result = await SimulateAsync(client, order.Payment.ReferenceCode);

        Assert.Equal(WebhookResult.Matched, result.Outcome); // khoản thu vẫn Paid; đơn không đổi, admin đối soát
        Assert.Equal((6m, 0m), await StockAsync(listingId));
        await fixture.WithDbAsync(async db =>
        {
            var row = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderId == orderId);
            Assert.Equal(("Cancelled", (DateTimeOffset?)null), (row.Status, row.PaidAt));
            Assert.Equal("Released", (await db.StockReservations.AsNoTracking().SingleAsync(s => s.OrderLine.OrderId == orderId)).Status);
            Assert.True(await db.AuditLogs.AnyAsync(a => a.EntityType == "sales_order" && a.EntityId == orderId && a.ActionType == "payment_after_close"));
            Assert.False(await db.AuditLogs.AnyAsync(a => a.EntityType == "sales_order" && a.EntityId == orderId && a.ActionType == "paid"));
            Assert.True(AuditChainVerifier.Verify(await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync()).IsValid);
            return true;
        });
    }
}

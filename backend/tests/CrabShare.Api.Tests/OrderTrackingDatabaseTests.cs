using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Orders;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>
/// NH-07 trên CSDL thật: lịch sử / chi tiết đơn của chính khách, huỷ khi chưa đóng gói, job trả tồn khi quá hạn
/// thanh toán, lệnh hoàn khi huỷ đơn đã trả, chuỗi audit không gãy. Không chạy trong CI.
/// </summary>
[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class OrderTrackingDatabaseTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private async Task<(HttpClient Client, CheckoutOrderResponse Order, long ListingId, long CustomerId)> PlaceAsync(
        decimal stockKg = 10, decimal quantityKg = 1)
    {
        var listingId = await fixture.CreateListingAsync(stockKg: stockKg);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        var client = fixture.Client(customerId);
        using var response = await client.PostAsJsonAsync("/api/orders/checkout", new
        {
            addressId,
            lines = new[] { new { listingId, quantityKg } },
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single();
        return (client, order, listingId, customerId);
    }

    private Task<T> StockAsync<T>(long listingId, Func<decimal, decimal, T> read) => fixture.WithDbAsync(async db =>
    {
        var listing = await db.ProductListings.AsNoTracking().SingleAsync(l => l.ListingId == listingId);
        return read(listing.StockQtyKg, listing.ReservedQtyKg);
    });

    private async Task MarkPaidAsync(string orderNo)
    {
        await fixture.WithDbAsync(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var order = await db.SalesOrders
                .Include(o => o.OrderLines).ThenInclude(l => l.StockReservation)
                .Include(o => o.PaymentRequests)
                .SingleAsync(o => o.OrderNo == orderNo);
            order.Status = "Paid";
            order.PaidAt = now;
            order.UpdatedAt = now;
            foreach (var request in order.PaymentRequests.Where(r => r.Status == "Pending"))
            {
                request.Status = "Paid";
                request.UpdatedAt = now;
            }
            await db.SaveChangesAsync();
            foreach (var line in order.OrderLines)
            {
                if (line.StockReservation is not { Status: "Active" } reservation) continue;
                var qty = reservation.QuantityKg;
                var n = await db.StockReservations
                    .Where(r => r.StockReservationId == reservation.StockReservationId && r.Status == "Active")
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, "Committed").SetProperty(r => r.UpdatedAt, now));
                if (n == 0) continue;
                await db.ProductListings.Where(l => l.ListingId == reservation.ListingId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(l => l.ReservedQtyKg, l => l.ReservedQtyKg >= qty ? l.ReservedQtyKg - qty : 0m)
                        .SetProperty(l => l.StockQtyKg, l => l.StockQtyKg - qty));
            }
            return true;
        });
    }

    private async Task SetStatusAsync(string orderNo, string status) => await fixture.WithDbAsync(async db =>
    {
        var n = await db.SalesOrders.Where(o => o.OrderNo == orderNo)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, status).SetProperty(o => o.UpdatedAt, DateTimeOffset.UtcNow));
        Assert.Equal(1, n);
        return true;
    });

    private async Task ExpireReservationAsync(string orderNo) => await fixture.WithDbAsync(async db =>
    {
        var past = DateTimeOffset.UtcNow.AddMinutes(-2);
        var n = await db.StockReservations.Where(r => r.OrderLine.SalesOrder.OrderNo == orderNo)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ExpiresAt, past));
        Assert.True(n >= 1);
        return true;
    });

    private async Task<int> RunExpiryJobAsync()
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ReservationExpiryService>()
            .ReleaseExpiredAsync(CancellationToken.None);
    }

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
    public async Task Lich_su_va_chi_tiet_chi_tra_don_cua_chinh_khach()
    {
        var (client, order, _, _) = await PlaceAsync();
        using (client)
        {
            var page = (await client.GetFromJsonAsync<PagedResult<OrderSummaryResponse>>("/api/orders"))!;
            var mine = Assert.Single(page.Items, o => o.OrderNo == order.OrderNo);
            Assert.Equal("PendingPayment", mine.Status);
            Assert.True(mine.TotalKg > 0);

            var tracking = (await client.GetFromJsonAsync<OrderTrackingResponse>($"/api/orders/{order.OrderNo}"))!;
            Assert.Equal(order.OrderNo, tracking.OrderNo);
            Assert.Equal("PendingPayment", tracking.Status);
            Assert.True(tracking.CanCancel);
            Assert.Equal("placed", tracking.Timeline[0].Step);
            Assert.True(tracking.Timeline[0].Done);
            Assert.False(tracking.Timeline.Single(s => s.Step == "paid").Done);
            Assert.Equal(order.Payment.ReferenceCode, tracking.Payment!.ReferenceCode);
        }
    }

    [Fact]
    public async Task Huy_PendingPayment_tra_ton_va_huy_ma_QR()
    {
        var (client, order, listingId, _) = await PlaceAsync(quantityKg: 1.5m);
        using (client)
        {
            Assert.Equal(1.5m, await StockAsync(listingId, (_, reserved) => reserved));

            using var response = await client.PostAsJsonAsync($"/api/orders/{order.OrderNo}/cancel", new { reason = "Đổi ý, không mua nữa" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var cancelled = (await response.Content.ReadFromJsonAsync<CancelOrderResponse>())!;
            Assert.Equal("Cancelled", cancelled.Status);
            Assert.Equal(1.5m, cancelled.ReleasedKg);
            Assert.Null(cancelled.RefundInstructionId);

            var tracking = (await client.GetFromJsonAsync<OrderTrackingResponse>($"/api/orders/{order.OrderNo}"))!;
            Assert.Equal("Cancelled", tracking.Status);
            Assert.False(tracking.CanCancel);
            Assert.Equal("Đổi ý, không mua nữa", tracking.CancelReason);
            Assert.Equal("cancelled", tracking.Timeline[^1].Step);
        }

        var (stock, reserved, reservationStatus, paymentStatus) = await fixture.WithDbAsync(async db =>
        {
            var listing = await db.ProductListings.AsNoTracking().SingleAsync(l => l.ListingId == listingId);
            var reservation = await db.StockReservations.AsNoTracking().SingleAsync(r => r.OrderLine.SalesOrder.OrderNo == order.OrderNo);
            var payment = await db.PaymentRequests.AsNoTracking().SingleAsync(p => p.ReferenceCode == order.OrderNo);
            return (listing.StockQtyKg, listing.ReservedQtyKg, reservation.Status, payment.Status);
        });
        Assert.Equal(10m, stock);
        Assert.Equal(0m, reserved);
        Assert.Equal("Released", reservationStatus);
        Assert.Equal("Cancelled", paymentStatus);
    }

    [Fact]
    public async Task Huy_Paid_lap_lenh_hoan_va_cong_lai_ton()
    {
        var (client, order, listingId, _) = await PlaceAsync(stockKg: 8, quantityKg: 2);
        await MarkPaidAsync(order.OrderNo);
        Assert.Equal((6m, 0m), await StockAsync(listingId, (stock, reserved) => (stock, reserved)));

        using (client)
        {
            using var response = await client.PostAsJsonAsync($"/api/orders/{order.OrderNo}/cancel",
                new { reason = "Đặt nhầm, xin hoàn tiền" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var cancelled = (await response.Content.ReadFromJsonAsync<CancelOrderResponse>())!;
            Assert.Equal("Cancelled", cancelled.Status);
            Assert.Equal(2m, cancelled.ReleasedKg);
            Assert.NotNull(cancelled.RefundInstructionId);

            var tracking = (await client.GetFromJsonAsync<OrderTrackingResponse>($"/api/orders/{order.OrderNo}"))!;
            Assert.False(tracking.CanCancel);
            Assert.Contains(tracking.Timeline, s => s.Step == "paid" && s.Done);
            Assert.Equal("cancelled", tracking.Timeline[^1].Step);
        }

        var (stock, reserved, reservationStatus, refundType, refundStatus, refundOrderId) = await fixture.WithDbAsync(async db =>
        {
            var listing = await db.ProductListings.AsNoTracking().SingleAsync(l => l.ListingId == listingId);
            var reservation = await db.StockReservations.AsNoTracking().SingleAsync(r => r.OrderLine.SalesOrder.OrderNo == order.OrderNo);
            var salesOrder = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == order.OrderNo);
            var refund = await db.PaymentInstructions.AsNoTracking().SingleAsync(i => i.OrderId == salesOrder.OrderId);
            return (listing.StockQtyKg, listing.ReservedQtyKg, reservation.Status, refund.InstructionType, refund.Status, refund.OrderId);
        });
        Assert.Equal(8m, stock);
        Assert.Equal(0m, reserved);
        Assert.Equal("Released", reservationStatus);
        Assert.Equal("Refund", refundType);
        Assert.Equal("Created", refundStatus);
        Assert.NotNull(refundOrderId);
    }

    [Fact]
    public async Task Huy_don_Packed_thi_422()
    {
        var (client, order, listingId, _) = await PlaceAsync();
        await SetStatusAsync(order.OrderNo, "Packed");
        using (client)
        {
            using var response = await client.PostAsJsonAsync($"/api/orders/{order.OrderNo}/cancel", new { reason = "Muốn huỷ sau khi đóng gói" });
            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
            Assert.Equal("order.cannot_cancel", await ErrorCode(response));

            var tracking = (await client.GetFromJsonAsync<OrderTrackingResponse>($"/api/orders/{order.OrderNo}"))!;
            Assert.Equal("Packed", tracking.Status);
            Assert.False(tracking.CanCancel);
        }
        Assert.Equal(1m, await StockAsync(listingId, (_, reserved) => reserved));
    }

    [Fact]
    public async Task Don_cua_nguoi_khac_thi_403()
    {
        var (owner, order, _, _) = await PlaceAsync();
        var (otherId, _) = await fixture.CreateCustomerAsync();
        using var other = fixture.Client(otherId);
        using (owner)
        {
            using var get = await other.GetAsync($"/api/orders/{order.OrderNo}");
            Assert.Equal(HttpStatusCode.Forbidden, get.StatusCode);
            Assert.Equal("order.not_owner", await ErrorCode(get));

            using var cancel = await other.PostAsJsonAsync($"/api/orders/{order.OrderNo}/cancel", new { reason = "Không phải đơn của tôi" });
            Assert.Equal(HttpStatusCode.Forbidden, cancel.StatusCode);
            Assert.Equal("order.not_owner", await ErrorCode(cancel));

            var mine = await other.GetFromJsonAsync<PagedResult<OrderSummaryResponse>>("/api/orders");
            Assert.DoesNotContain(mine!.Items, o => o.OrderNo == order.OrderNo);
        }
    }

    [Fact]
    public async Task Job_huy_don_qua_han_thanh_toan_va_khong_de_don_da_Paid()
    {
        var (unpaidClient, unpaid, unpaidListing, _) = await PlaceAsync();
        var (paidClient, paid, paidListing, _) = await PlaceAsync();
        await MarkPaidAsync(paid.OrderNo);
        await ExpireReservationAsync(unpaid.OrderNo);
        await ExpireReservationAsync(paid.OrderNo);

        Assert.Equal(1, await RunExpiryJobAsync());
        Assert.Equal(0, await RunExpiryJobAsync());

        var unpaidState = await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == unpaid.OrderNo);
            var reservation = await db.StockReservations.AsNoTracking().SingleAsync(r => r.OrderLine.SalesOrder.OrderNo == unpaid.OrderNo);
            var payment = await db.PaymentRequests.AsNoTracking().SingleAsync(p => p.ReferenceCode == unpaid.OrderNo);
            return (Status: order.Status, Reason: order.CancelReason, Reservation: reservation.Status, Payment: payment.Status);
        });
        Assert.Equal("Cancelled", unpaidState.Status);
        Assert.Equal(ReservationExpiryService.TimeoutReason, unpaidState.Reason);
        Assert.Equal("Released", unpaidState.Reservation);
        Assert.Equal("Expired", unpaidState.Payment);
        Assert.Equal(0m, await StockAsync(unpaidListing, (_, reserved) => reserved));

        var paidState = await fixture.WithDbAsync(async db =>
        {
            var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderNo == paid.OrderNo);
            var reservation = await db.StockReservations.AsNoTracking().SingleAsync(r => r.OrderLine.SalesOrder.OrderNo == paid.OrderNo);
            return (Status: order.Status, Reservation: reservation.Status);
        });
        Assert.Equal("Paid", paidState.Status);
        Assert.Equal("Committed", paidState.Reservation);
        Assert.Equal((9m, 0m), await StockAsync(paidListing, (stock, reserved) => (stock, reserved)));

        unpaidClient.Dispose();
        paidClient.Dispose();
    }

    [Fact]
    public async Task Huy_don_va_job_ghi_audit_thanh_mot_chuoi()
    {
        var before = await fixture.WithDbAsync(db => db.AuditLogs.CountAsync());
        var (pendingClient, pending, _, _) = await PlaceAsync();
        using (pendingClient)
        {
            (await pendingClient.PostAsJsonAsync($"/api/orders/{pending.OrderNo}/cancel", new { reason = "Kiểm tra chuỗi audit" }))
                .EnsureSuccessStatusCode();
        }

        var (timeoutClient, timeout, _, _) = await PlaceAsync();
        await ExpireReservationAsync(timeout.OrderNo);
        Assert.Equal(1, await RunExpiryJobAsync());
        timeoutClient.Dispose();

        var (paidClient, paid, _, _) = await PlaceAsync();
        await MarkPaidAsync(paid.OrderNo);
        using (paidClient)
        {
            (await paidClient.PostAsJsonAsync($"/api/orders/{paid.OrderNo}/cancel", new { reason = "Hoàn vì kiểm tra audit" }))
                .EnsureSuccessStatusCode();
        }

        var total = await AssertChainAsync();
        Assert.True(total > before);
        var (cancelReasons, refundCreates) = await fixture.WithDbAsync(async db =>
        {
            var reasons = await db.AuditLogs.AsNoTracking()
                .Where(a => a.EntityType == "sales_order" && a.ActionType == OrderCancellationService.CustomerCancelAction)
                .Select(a => a.NewValue)
                .ToListAsync();
            var refunds = await db.AuditLogs.CountAsync(a => a.EntityType == "payment_instruction" && a.ActionType == "create");
            return (reasons, refunds);
        });
        Assert.True(cancelReasons.Count >= 3);
        Assert.Contains(cancelReasons, v => v != null && v.Contains(ReservationExpiryService.TimeoutReason, StringComparison.Ordinal));
        Assert.True(refundCreates >= 1);
    }
}

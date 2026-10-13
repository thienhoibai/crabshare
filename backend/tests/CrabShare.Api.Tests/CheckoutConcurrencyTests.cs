using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Features.Orders;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

/// <summary>
/// UC26 trên CSDL thật: chứng minh checkout đồng thời không bán vượt (NFR Transactional integrity, TL-28 §9.2),
/// tách đơn theo lô (TL-29) và cả giỏ là một giao dịch.
/// </summary>
[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class CheckoutConcurrencyTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
    private static object Cart(long addressId, params (long ListingId, decimal QuantityKg)[] lines) => new
    {
        addressId,
        lines = lines.Select(l => new { listingId = l.ListingId, quantityKg = l.QuantityKg }).ToArray(),
    };

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    [Fact]
    public async Task Nam_muoi_checkout_song_song_khong_ban_vuot_va_tong_giu_bang_ton()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 10);
        var customers = new List<(long CustomerId, long AddressId)>();
        for (var i = 0; i < 50; i++) customers.Add(await fixture.CreateCustomerAsync());
        var clients = customers.Select(c => (Client: fixture.Client(c.CustomerId), c.AddressId)).ToList();

        using var start = new ManualResetEventSlim();
        var requests = clients.Select(c => Task.Run(async () =>
        {
            start.Wait();
            return await c.Client.PostAsJsonAsync("/api/orders/checkout", Cart(c.AddressId, (listingId, 1m)));
        })).ToList();
        start.Set();
        var responses = await Task.WhenAll(requests);

        Assert.Equal(10, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        var rejected = responses.Where(r => r.StatusCode != HttpStatusCode.OK).ToList();
        Assert.Equal(40, rejected.Count);
        Assert.All(rejected, r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        foreach (var r in rejected) Assert.Equal("order.insufficient_stock", await ErrorCode(r));

        var (stock, reserved, activeKg, orders, paymentRequests) = await fixture.WithDbAsync(async db =>
        {
            var listing = await db.ProductListings.AsNoTracking().SingleAsync(l => l.ListingId == listingId);
            var active = await db.StockReservations.Where(s => s.ListingId == listingId && s.Status == "Active").SumAsync(s => s.QuantityKg);
            var orderCount = await db.SalesOrders.CountAsync(o => o.BatchId == listing.BatchId && o.Status == "PendingPayment");
            var requestCount = await db.PaymentRequests.CountAsync(p => p.Order!.BatchId == listing.BatchId && p.Status == "Pending");
            return (listing.StockQtyKg, listing.ReservedQtyKg, active, orderCount, requestCount);
        });
        Assert.Equal(10m, stock);
        Assert.Equal(stock, reserved);
        Assert.Equal(reserved, activeKg);
        Assert.Equal(10, orders);
        Assert.Equal(10, paymentRequests);

        foreach (var r in responses) r.Dispose();
        foreach (var c in clients) c.Client.Dispose();
    }

    [Fact]
    public async Task Gio_hai_lo_tach_thanh_hai_don_moi_don_mot_ma_va_mot_tai_khoan()
    {
        var first = await fixture.CreateListingAsync(stockKg: 5, pricePerKg: 400_000);
        var second = await fixture.CreateListingAsync(stockKg: 5, pricePerKg: 300_000);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var response = await client.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, (first, 1.5m), (second, 2m)));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!;
        Assert.Equal(2, result.Orders.Count);
        Assert.Equal(2, result.Orders.Select(o => o.BatchCode).Distinct().Count());
        Assert.Equal(2, result.Orders.Select(o => o.Payment.AccountNo).Distinct().Count());
        Assert.All(result.Orders, o =>
        {
            Assert.Equal("PendingPayment", o.Status);
            Assert.Equal(13, o.OrderNo.Length);
            Assert.Equal(o.OrderNo, o.Payment.ReferenceCode);
            Assert.Equal(o.TotalAmount, o.Payment.Amount);
            Assert.Single(o.Lines);
        });
        Assert.Equal(600_000, result.Orders.Single(o => o.Lines[0].ListingId == first).TotalAmount);
        Assert.Equal(600_000, result.Orders.Single(o => o.Lines[0].ListingId == second).TotalAmount);
    }

    [Fact]
    public async Task Dong_don_chup_phien_ban_gia_va_doi_gia_sau_khong_sua_don_cu()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 5, pricePerKg: 400_000);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);
        var initialRevision = await fixture.WithDbAsync(db => db.PriceHistories.Where(h => h.ListingId == listingId).Select(h => h.PriceHistoryId).SingleAsync());

        using var before = await client.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, (listingId, 1m)));
        var newRevision = await fixture.ChangePriceAsync(listingId, 450_000);
        using var after = await client.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, (listingId, 1m)));

        Assert.Equal(HttpStatusCode.OK, before.StatusCode);
        Assert.Equal(HttpStatusCode.OK, after.StatusCode);
        var firstNo = (await before.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single().OrderNo;
        var secondNo = (await after.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single().OrderNo;
        var lines = await fixture.WithDbAsync(db => db.OrderLines.AsNoTracking()
            .Where(l => l.ListingId == listingId)
            .Select(l => new { l.SalesOrder.OrderNo, l.UnitPrice, l.PriceHistoryId, RevisionPrice = db.PriceHistories.Single(h => h.PriceHistoryId == l.PriceHistoryId).PricePerKg })
            .ToListAsync());

        var first = lines.Single(l => l.OrderNo == firstNo);
        var second = lines.Single(l => l.OrderNo == secondNo);
        Assert.Equal((400_000m, initialRevision), (first.UnitPrice, first.PriceHistoryId));
        Assert.Equal((450_000m, newRevision), (second.UnitPrice, second.PriceHistoryId));
        Assert.All(lines, l => Assert.Equal(l.RevisionPrice, l.UnitPrice));
    }

    [Fact]
    public async Task Mot_dong_thieu_hang_thi_ca_gio_khong_duoc_giu_va_khong_tao_don()
    {
        var enough = await fixture.CreateListingAsync(stockKg: 5);
        var scarce = await fixture.CreateListingAsync(stockKg: 1);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var response = await client.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, (enough, 2m), (scarce, 3m)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("order.insufficient_stock", await ErrorCode(response));
        var (reserved, orders) = await fixture.WithDbAsync(async db =>
        {
            var ids = new[] { enough, scarce };
            var sum = await db.ProductListings.Where(l => ids.Contains(l.ListingId)).SumAsync(l => l.ReservedQtyKg);
            var count = await db.SalesOrders.CountAsync(o => o.CustomerId == customerId);
            return (sum, count);
        });
        Assert.Equal(0m, reserved);
        Assert.Equal(0, orders);
    }

    [Fact]
    public async Task Ma_QR_het_han_cung_luc_voi_giu_cho()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 3);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);
        var before = DateTimeOffset.UtcNow;

        using var response = await client.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, (listingId, 1m)));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var order = (await response.Content.ReadFromJsonAsync<CheckoutResponse>())!.Orders.Single();
        Assert.Equal(order.ExpiresAt, order.Payment.ExpiresAt);
        Assert.InRange(order.ExpiresAt, before.AddMinutes(15).AddSeconds(-5), DateTimeOffset.UtcNow.AddMinutes(15).AddSeconds(5));

        var (reservationExpiry, requestExpiry) = await fixture.WithDbAsync(async db =>
        {
            var reservation = await db.StockReservations.SingleAsync(s => s.OrderLine.SalesOrder.OrderNo == order.OrderNo);
            var request = await db.PaymentRequests.SingleAsync(p => p.ReferenceCode == order.OrderNo);
            return (reservation.ExpiresAt, request.ExpiresAt);
        });
        Assert.Equal(reservationExpiry, requestExpiry);
    }

    [Fact]
    public async Task Dia_chi_cua_khach_khac_bi_tu_choi()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 3);
        var (customerId, _) = await fixture.CreateCustomerAsync();
        var (_, otherAddressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var response = await client.PostAsJsonAsync("/api/orders/checkout", Cart(otherAddressId, (listingId, 1m)));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("order.address_not_found", await ErrorCode(response));
    }

    [Theory]
    [InlineData("Draft")]
    [InlineData("Closed")]
    public async Task Niem_yet_khong_dang_ban_bi_tu_choi(string status)
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 3, status: status);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var response = await client.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, (listingId, 1m)));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("order.listing_not_on_sale", await ErrorCode(response));
    }

    [Fact]
    public async Task Lo_chua_mo_tai_khoan_chuyen_dung_thi_khong_dat_duoc()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 3, accountStatus: "Requested");
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var client = fixture.Client(customerId);

        using var response = await client.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, (listingId, 1m)));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("order.batch_account_unavailable", await ErrorCode(response));
    }
}

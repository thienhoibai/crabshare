using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Alerts;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>NH-04 trên CSDL thật: quản trị ẩn niêm yết thì khách không thấy, không đặt được; checkout làm tồn xuống dưới ngưỡng thì phát LowStock.</summary>
[Trait("Category", "Database")]
[Collection("OrderDatabase")]
public class ListingModerationDatabaseTests(OrderDatabaseFixture fixture) : IClassFixture<OrderDatabaseFixture>
{
    private sealed class FakeAlertRaiser : IAlertRaiser
    {
        public ConcurrentQueue<(long BatchId, string Type, string Severity, string Message, TimeSpan AckWithin)> Calls { get; } = new();

        public Task RaiseAsync(long batchId, string type, string severity, string message, TimeSpan ackWithin, CancellationToken ct)
        {
            Calls.Enqueue((batchId, type, severity, message, ackWithin));
            return Task.CompletedTask;
        }
    }

    private readonly FakeAlertRaiser _alerts = new();

    private HttpClient Client(long userId, string role)
    {
        var client = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddScoped<IAlertRaiser>(_ => _alerts))).CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        return client;
    }

    private static object Cart(long addressId, long listingId, decimal quantityKg) => new
    {
        addressId,
        lines = new[] { new { listingId, quantityKg } },
    };

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private Task<long> CreateAdminAsync() => fixture.WithDbAsync(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        var user = new AppUser
        {
            Email = $"admin-{Guid.NewGuid():N}@test.local", FullName = "Quản trị test", PasswordHash = "test-only",
            Status = "Active", CreatedAt = now, UpdatedAt = now,
        };
        user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.PlatformAdmin, GrantedAt = now, CreatedAt = now });
        db.AppUsers.Add(user);
        await db.SaveChangesAsync();
        return user.UserId;
    });

    private Task AddPriceAsync(long listingId, long changedBy, bool flagged, int minutesAgo) => fixture.WithDbAsync(async db =>
    {
        var at = DateTimeOffset.UtcNow.AddMinutes(-minutesAgo);
        db.PriceHistories.Add(new PriceHistory
        {
            ListingId = listingId, PricePerKg = 400_000, EffectiveFrom = at, ChangedBy = changedBy,
            FlaggedAbnormal = flagged, ReasonCode = "Initial", CreatedAt = at,
        });
        return await db.SaveChangesAsync();
    });

    private Task<long> BatchIdAsync(long listingId)
        => fixture.WithDbAsync(db => db.ProductListings.Where(l => l.ListingId == listingId).Select(l => l.BatchId).SingleAsync());

    [Fact]
    public async Task An_niem_yet_thi_cua_hang_va_checkout_bo_qua()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 10);
        var adminId = await CreateAdminAsync();
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var admin = Client(adminId, Roles.PlatformAdmin);
        using var customer = Client(customerId, Roles.Customer);
        using var anonymous = fixture.Factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/listings/{listingId}")).StatusCode);

        using var hide = await admin.PostAsJsonAsync($"/api/admin/listings/{listingId}/hide", new { reason = "  Ảnh không đúng sản phẩm  " });
        Assert.Equal(HttpStatusCode.OK, hide.StatusCode);
        var hidden = (await hide.Content.ReadFromJsonAsync<AdminListingResponse>())!;
        Assert.NotNull(hidden.HiddenAt);
        Assert.Equal("Ảnh không đúng sản phẩm", hidden.HiddenReason);
        Assert.Equal("Quản trị test", hidden.HiddenBy);
        Assert.Equal("Published", hidden.Status);

        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/listings/{listingId}")).StatusCode);
        var store = await anonymous.GetFromJsonAsync<PagedResult<StoreListingResponse>>("/api/listings?pageSize=100");
        Assert.DoesNotContain(store!.Items, l => l.ListingId == listingId);

        using var checkout = await customer.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, listingId, 1));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, checkout.StatusCode);
        Assert.Equal("order.listing_not_on_sale", await ErrorCode(checkout));

        using var again = await admin.PostAsJsonAsync($"/api/admin/listings/{listingId}/hide", new { reason = "Lần hai" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("listing.already_hidden", await ErrorCode(again));
    }

    [Fact]
    public async Task An_niem_yet_khong_ton_tai_tra_ve_404()
    {
        var adminId = await CreateAdminAsync();
        using var admin = Client(adminId, Roles.PlatformAdmin);

        using var response = await admin.PostAsJsonAsync("/api/admin/listings/999999999/hide", new { reason = "Không có" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Token_quan_tri_nhung_tai_khoan_khong_con_quyen_tra_ve_403()
    {
        var (customerId, _) = await fixture.CreateCustomerAsync();
        using var client = Client(customerId, Roles.PlatformAdmin);

        using var response = await client.GetAsync("/api/admin/listings");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("listing.admin_required", await ErrorCode(response));
    }

    [Fact]
    public async Task Danh_sach_co_chi_lay_niem_yet_co_lan_doi_gia_gan_nhat_bat_thuong()
    {
        var adminId = await CreateAdminAsync();
        var flagged = await fixture.CreateListingAsync(stockKg: 10);
        var corrected = await fixture.CreateListingAsync(stockKg: 10);
        await AddPriceAsync(flagged, adminId, flagged: false, minutesAgo: 10);
        await AddPriceAsync(flagged, adminId, flagged: true, minutesAgo: 1);
        await AddPriceAsync(corrected, adminId, flagged: true, minutesAgo: 10);
        await AddPriceAsync(corrected, adminId, flagged: false, minutesAgo: 1);
        using var admin = Client(adminId, Roles.PlatformAdmin);

        var page = await admin.GetFromJsonAsync<PagedResult<AdminListingResponse>>("/api/admin/listings?flagged=true&hidden=false&pageSize=100");

        var row = Assert.Single(page!.Items, l => l.ListingId == flagged);
        Assert.True(row.LatestPrice!.FlaggedAbnormal);
        Assert.Equal("Quản trị test", row.LatestPrice.ChangedBy);
        Assert.DoesNotContain(page.Items, l => l.ListingId == corrected);
    }

    [Fact]
    public async Task Checkout_lam_ton_duoi_nguong_thi_phat_LowStock_cho_lo()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 6);
        var batchId = await BatchIdAsync(listingId);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var customer = Client(customerId, Roles.Customer);

        using var response = await customer.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, listingId, 2));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var call = Assert.Single(_alerts.Calls, c => c.BatchId == batchId);
        Assert.Equal(AlertTypes.LowStock, call.Type);
        Assert.Equal(AlertSeverities.Medium, call.Severity);
        Assert.Equal(TimeSpan.FromHours(24), call.AckWithin);
        Assert.Contains("còn 4 kg", call.Message);
    }

    [Fact]
    public async Task Checkout_con_tren_nguong_thi_khong_bao()
    {
        var listingId = await fixture.CreateListingAsync(stockKg: 20);
        var batchId = await BatchIdAsync(listingId);
        var (customerId, addressId) = await fixture.CreateCustomerAsync();
        using var customer = Client(customerId, Roles.Customer);

        using var response = await customer.PostAsJsonAsync("/api/orders/checkout", Cart(addressId, listingId, 1));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(_alerts.Calls, c => c.BatchId == batchId);
    }
}

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>NH-04 — phân quyền, dữ liệu vào và bộ lọc kiểm duyệt niêm yết, dừng trước khi chạm CSDL.</summary>
public class AdminListingsControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client(params string[] roles)
    {
        var app = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false"));
        var client = app.CreateClient();
        if (roles.Length > 0)
        {
            var tokens = app.Services.GetRequiredService<TokenService>();
            var (token, _) = tokens.Create(99, "test@crabshare.local", "Test", roles, roles.Contains(Roles.OperatorMember) ? 1 : null);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }

    [Fact]
    public async Task Chua_dang_nhap_tra_ve_401()
    {
        var response = await Client().GetAsync("/api/admin/listings?flagged=true");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(Roles.Customer)]
    [InlineData(Roles.OperatorMember)]
    [InlineData(Roles.EvidenceReviewer)]
    public async Task Khong_phai_quan_tri_tra_ve_403(string role)
    {
        var list = await Client(role).GetAsync("/api/admin/listings");
        var hide = await Client(role).PostAsJsonAsync("/api/admin/listings/1/hide", new { reason = "Giá sai" });

        Assert.Equal(HttpStatusCode.Forbidden, list.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, hide.StatusCode);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"reason\":\"   \"}")]
    public async Task An_khong_kem_ly_do_tra_ve_400(string body)
    {
        var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
        var response = await Client(Roles.PlatformAdmin).PostAsync("/api/admin/listings/1/hide", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Ly_do_qua_300_ky_tu_tra_ve_400()
    {
        var response = await Client(Roles.PlatformAdmin).PostAsJsonAsync("/api/admin/listings/1/hide", new { reason = new string('x', 301) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/admin/listings?status=Hidden")]
    [InlineData("/api/admin/listings?flagged=abc")]
    [InlineData("/api/admin/listings?pageSize=101")]
    public async Task Tham_so_loc_khong_hop_le_tra_ve_400(string url)
    {
        var response = await Client(Roles.PlatformAdmin).GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static ProductListing Listing(long id, string status = "Published", bool hidden = false, params bool[] flags)
    {
        var listing = new ProductListing { ListingId = id, Status = status, HiddenAt = hidden ? DateTimeOffset.UtcNow : null };
        var at = new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero);
        for (var i = 0; i < flags.Length; i++)
            listing.PriceHistories.Add(new PriceHistory { PriceHistoryId = id * 10 + i, EffectiveFrom = at.AddDays(i), FlaggedAbnormal = flags[i] });
        return listing;
    }

    private static long[] Ids(IEnumerable<ProductListing> list) => list.Select(l => l.ListingId).OrderBy(id => id).ToArray();

    [Fact]
    public void Loc_co_theo_lan_doi_gia_gan_nhat()
    {
        var source = new[]
        {
            Listing(1, flags: [false, true]),
            Listing(2, flags: [true, false]),
            Listing(3, flags: [false]),
            Listing(4),
        }.AsQueryable();

        Assert.Equal([1], Ids(ListingModerationService.Filter(source, new AdminListingQuery { Flagged = true })));
        Assert.Equal([2, 3, 4], Ids(ListingModerationService.Filter(source, new AdminListingQuery { Flagged = false })));
    }

    [Fact]
    public void Loc_theo_trang_thai_an_va_status()
    {
        var source = new[] { Listing(1), Listing(2, hidden: true), Listing(3, "SoldOut"), Listing(4, "SoldOut", hidden: true) }.AsQueryable();

        Assert.Equal([2, 4], Ids(ListingModerationService.Filter(source, new AdminListingQuery { Hidden = true })));
        Assert.Equal([1, 3], Ids(ListingModerationService.Filter(source, new AdminListingQuery { Hidden = false })));
        Assert.Equal([3], Ids(ListingModerationService.Filter(source, new AdminListingQuery { Hidden = false, Status = "SoldOut" })));
    }
}

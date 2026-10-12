using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Orders;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;

namespace CrabShare.Api.Tests;

/// <summary>UC26 — quy tắc thuần của checkout và phân quyền; không cần CSDL, chạy trong CI.</summary>
public class CheckoutRulesTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public void Ma_don_dai_13_ky_tu_va_chi_dung_bang_chu_Crockford()
    {
        var codes = Enumerable.Range(0, 500).Select(_ => OrderNumber.New()).ToList();

        Assert.All(codes, c =>
        {
            Assert.Equal(13, c.Length);
            Assert.StartsWith("OD", c);
            Assert.All(c[2..], ch => Assert.Contains(ch, OrderNumber.Alphabet));
        });
        Assert.Equal(codes.Count, codes.Distinct().Count());
    }

    [Fact]
    public void Gop_dong_trung_niem_yet_va_sap_theo_listingId()
    {
        var lines = OrderService.NormalizeLines([(7, 1.5m), (3, 0.25m), (7, 0.5m)]);

        Assert.Equal([(3L, 0.25m), (7L, 2m)], lines);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(0.0005)]
    public void Tu_choi_so_kg_khong_hop_le(double quantity)
    {
        var ex = Assert.Throws<BusinessRuleException>(() => OrderService.NormalizeLines([(1, (decimal)quantity)]));
        Assert.Equal("order.invalid_quantity", ex.Code);
    }

    [Fact]
    public void Gio_trong_bi_tu_choi()
    {
        var ex = Assert.Throws<BusinessRuleException>(() => OrderService.NormalizeLines([]));
        Assert.Equal("order.empty_cart", ex.Code);
    }

    [Fact]
    public void Moi_lo_mot_don()
    {
        var groups = OrderService.SplitByBatch([
            new(ListingId: 5, BatchId: 20, QuantityKg: 1, UnitPrice: 400_000),
            new(ListingId: 2, BatchId: 10, QuantityKg: 2, UnitPrice: 300_000),
            new(ListingId: 4, BatchId: 20, QuantityKg: 1, UnitPrice: 450_000),
        ]);

        Assert.Equal(2, groups.Count);
        Assert.Equal([2L], groups[0].Select(l => l.ListingId));
        Assert.Equal([4L, 5L], groups[1].Select(l => l.ListingId));
        Assert.All(groups, g => Assert.Single(g.Select(l => l.BatchId).Distinct()));
    }

    [Theory]
    [InlineData(1.5, 333_333, 500_000)]
    [InlineData(0.001, 499, 0)]
    [InlineData(0.001, 500, 1)]
    public void Thanh_tien_lam_tron_den_dong(double quantity, long price, long expected)
        => Assert.Equal(expected, OrderService.LineAmount((decimal)quantity, price));

    private HttpClient Client(string? role = null)
    {
        var client = factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false")
            .ConfigureTestServices(KycControllerTests.AddTestAuth)).CreateClient();
        if (role is not null)
        {
            client.DefaultRequestHeaders.Add("X-Test-User", "1");
            client.DefaultRequestHeaders.Add("X-Test-Role", role);
        }
        return client;
    }

    private static object Body => new { lines = new[] { new { listingId = 1, quantityKg = 1 } }, addressId = 1 };

    [Fact]
    public async Task Chua_dang_nhap_thi_401()
    {
        using var response = await Client().PostAsJsonAsync("/api/orders/checkout", Body);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(Roles.OperatorMember)]
    [InlineData(Roles.PlatformAdmin)]
    public async Task Vai_tro_khac_khach_hang_thi_403(string role)
    {
        using var response = await Client(role).PostAsJsonAsync("/api/orders/checkout", Body);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Gio_rong_bi_validation_chan_truoc_khi_cham_CSDL()
    {
        using var response = await Client(Roles.Customer).PostAsJsonAsync("/api/orders/checkout", new { lines = Array.Empty<object>(), addressId = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

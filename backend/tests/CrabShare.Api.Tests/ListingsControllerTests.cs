using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>Phân quyền và kiểm tra dữ liệu vào của niêm yết — dừng trước khi chạm CSDL.</summary>
public class ListingsControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
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
    public async Task Tao_niem_yet_khi_chua_dang_nhap_tra_ve_401()
    {
        var response = await Client().PostAsJsonAsync("/api/listings", new { batchCode = "L1", gradeCode = "L1", pricePerKg = 400000 });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Khach_hang_khong_tao_duoc_niem_yet()
    {
        var response = await Client(Roles.Customer).PostAsJsonAsync("/api/listings", new { batchCode = "L1", gradeCode = "L1", pricePerKg = 400000 });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Gia_bang_0_va_thieu_ma_lo_tra_ve_400()
    {
        var response = await Client(Roles.OperatorMember).PostAsJsonAsync("/api/listings", new { gradeCode = "L1", pricePerKg = 0 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Doi_gia_khong_kem_ly_do_tra_ve_400()
    {
        var response = await Client(Roles.OperatorMember).PatchAsJsonAsync("/api/listings/1/price", new { pricePerKg = 350000 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Ly_do_doi_gia_khong_hop_le_tra_ve_400()
    {
        var response = await Client(Roles.OperatorMember).PatchAsJsonAsync("/api/listings/1/price", new { pricePerKg = 350000, reason = "Initial" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace CrabShare.Api.Tests;

/// <summary>Các test này dừng ở bước kiểm tra dữ liệu vào nên không cần CSDL.</summary>
public class AuthControllerTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private HttpClient Client() => factory.WithWebHostBuilder(b => b.UseSetting("Seed:Enabled", "false")).CreateClient();

    [Fact]
    public async Task Me_khi_chua_dang_nhap_tra_ve_401()
    {
        var response = await Client().GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Dang_ky_sai_du_lieu_tra_ve_400_kem_loi_tung_truong()
    {
        // role gửi dạng chữ như web đang gửi; lỗi phải nằm ở Email và Password chứ không phải ở role
        var response = await Client().PostAsJsonAsync("/api/auth/register",
            new { email = "khong-phai-email", password = "ngan", fullName = "A", role = "Investor" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("errors");
        Assert.True(errors.TryGetProperty("Email", out _));
        Assert.True(errors.TryGetProperty("Password", out _));
        Assert.Equal(2, errors.EnumerateObject().Count());
    }

    [Fact]
    public async Task Dang_ky_vai_tro_khong_hop_le_tra_ve_400()
    {
        var response = await Client().PostAsJsonAsync("/api/auth/register",
            new { email = "a@b.vn", password = "12345678", fullName = "A", role = "PlatformAdmin" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

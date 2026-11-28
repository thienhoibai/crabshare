using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class GoogleAuthDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private WebApplicationFactory<Program> App(StubGoogleVerifier stub) =>
        fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
        {
            s.Replace(ServiceDescriptor.Singleton<IGoogleTokenVerifier>(stub));
            s.AddAuthentication(o =>
            {
                o.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                o.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
                o.DefaultForbidScheme = JwtBearerDefaults.AuthenticationScheme;
            });
        }));

    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    [Fact]
    public async Task Google_user_moi_tao_day_du_Party_chan_dang_nhap_mat_khau_va_giu_user_khi_doi_email()
    {
        var sub = "gsub-" + Guid.NewGuid().ToString("N");
        var email = $"g-{Guid.NewGuid():N}@gmail.com";
        var stub = new StubGoogleVerifier(new GoogleIdentity(sub, email, "Phạm Minh Tuấn"));
        using var app = App(stub);
        using var client = app.CreateClient();

        var first = await client.PostAsJsonAsync("/api/auth/google", new { idToken = "valid-token" });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var auth = (await first.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal([Roles.Customer], auth.User.Roles);
        Assert.True(auth.User.CustomerProfileRequired);

        // JWT trả về gọi được /api/auth/me
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var me = await client.GetFromJsonAsync<MeResponse>("/api/auth/me");
        Assert.Equal(auth.User.UserId, me!.UserId);
        client.DefaultRequestHeaders.Authorization = null;

        // Tài khoản chỉ có Google không bị crash khi thử đăng nhập mật khẩu và vẫn trả 401 chuẩn
        var pwAttempt = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "any-password-123" });
        Assert.Equal(HttpStatusCode.Unauthorized, pwAttempt.StatusCode);

        // Party + Customer được tạo đồng bộ trong CSDL
        await Db(async db =>
        {
            var user = await db.AppUsers.Include(u => u.Customer).SingleAsync(u => u.UserId == auth.User.UserId);
            Assert.Equal("", user.PasswordHash);
            Assert.Equal(sub, user.GoogleSubject);
            Assert.NotNull(user.PartyId);
            Assert.NotNull(user.Customer);
            var party = await db.Parties.Include(p => p.Roles).SingleAsync(p => p.PartyId == user.PartyId);
            Assert.Equal("Individual", party.PartyType);
            Assert.Contains(party.Roles, r => r.RoleType == "Customer");
            return true;
        });

        // Lần đăng nhập sau dù Google Workspace đổi email vẫn khớp đúng userId qua google_subject
        stub.Next = new GoogleIdentity(sub, $"renamed-{Guid.NewGuid():N}@workspace.vn", "Phạm Minh Tuấn");
        var second = await client.PostAsJsonAsync("/api/auth/google", new { idToken = "valid-token-2" });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var auth2 = (await second.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal(auth.User.UserId, auth2.User.UserId);
    }

    [Fact]
    public async Task Google_dang_ky_vai_tro_Investor_tao_ho_so_Investor()
    {
        var stub = new StubGoogleVerifier(new GoogleIdentity("gsub-" + Guid.NewGuid().ToString("N"), $"inv-{Guid.NewGuid():N}@gmail.com", "Lê Hoàng"));
        using var app = App(stub);
        using var client = app.CreateClient();

        var res = await client.PostAsJsonAsync("/api/auth/google", new { idToken = "valid-token", role = "Investor" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var auth = (await res.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.Equal([Roles.Customer, Roles.Investor], auth.User.Roles);
        Assert.False(auth.User.CustomerProfileRequired);

        await Db(async db =>
        {
            Assert.NotNull(await db.Investors.SingleOrDefaultAsync(i => i.UserId == auth.User.UserId));
            return true;
        });
    }

    [Fact]
    public async Task Lien_ket_tai_khoan_cu_chan_quan_tri_va_chan_tai_khoan_khoa()
    {
        var email = $"existing-{Guid.NewGuid():N}@gmail.com";
        var stub = new StubGoogleVerifier(new GoogleIdentity("gsub-link-" + Guid.NewGuid().ToString("N"), email, "Khách Cũ"));
        using var app = App(stub);
        using var client = app.CreateClient();

        var reg = await client.PostAsJsonAsync("/api/auth/register",
            new { email, password = "password123", fullName = "Khách Cũ", role = "Customer" });
        reg.EnsureSuccessStatusCode();
        var existingUser = (await reg.Content.ReadFromJsonAsync<AuthResponse>())!.User;

        // Tự động gắn google_subject khi email trùng với tài khoản thường
        var linked = await client.PostAsJsonAsync("/api/auth/google", new { idToken = "token-1" });
        Assert.Equal(HttpStatusCode.OK, linked.StatusCode);
        Assert.Equal(existingUser.UserId, (await linked.Content.ReadFromJsonAsync<AuthResponse>())!.User.UserId);

        // Khoá tài khoản thì đăng nhập Google bị chặn 403 auth.locked
        await Db(async db =>
        {
            await db.AppUsers.Where(u => u.UserId == existingUser.UserId)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, "Locked"));
            return true;
        });
        var lockedRes = await client.PostAsJsonAsync("/api/auth/google", new { idToken = "token-1" });
        Assert.Equal(HttpStatusCode.Forbidden, lockedRes.StatusCode);
        Assert.Equal("auth.locked", (await lockedRes.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        // Tài khoản quản trị không cho phép tự động liên kết qua email
        var adminEmail = $"admin-{Guid.NewGuid():N}@crabshare.cloud";
        await Db(async db =>
        {
            var now = DateTimeOffset.UtcNow;
            var admin = new AppUser
            {
                Email = adminEmail, FullName = "Admin", PasswordHash = "hash", Status = "Active", CreatedAt = now, UpdatedAt = now,
            };
            admin.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.PlatformAdmin, GrantedAt = now, CreatedAt = now });
            db.AppUsers.Add(admin);
            await db.SaveChangesAsync();
            return true;
        });
        stub.Next = new GoogleIdentity("gsub-admin-" + Guid.NewGuid().ToString("N"), adminEmail, "Admin");
        var adminRes = await client.PostAsJsonAsync("/api/auth/google", new { idToken = "token-admin" });
        Assert.Equal(HttpStatusCode.Forbidden, adminRes.StatusCode);
        Assert.Equal("auth.google_privileged_account", (await adminRes.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    private sealed class StubGoogleVerifier(GoogleIdentity initial) : IGoogleTokenVerifier
    {
        public GoogleIdentity Next { get; set; } = initial;
        public Task<GoogleIdentity> VerifyAsync(string idToken, CancellationToken ct) => Task.FromResult(Next);
    }
}

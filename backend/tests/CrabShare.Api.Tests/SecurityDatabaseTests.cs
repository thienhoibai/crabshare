using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class SecurityDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    [Fact]
    public async Task Raw_sql_is_protected_owner_can_read_and_global_duplicate_is_still_rejected()
    {
        var one = await fixture.CreateInvestorAsync(); var two = await fixture.CreateInvestorAsync();
        using var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", one.ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", Roles.Investor);
        const string number = "009876543210123";
        var request = new PayoutAccountRequest { BankCode = "VCB", AccountNo = number, AccountHolderName = "KYC Test" };
        (await client.PutAsJsonAsync("/api/me/payout-account", request)).EnsureSuccessStatusCode();
        var response = await client.GetFromJsonAsync<PayoutProfileResponse>("/api/me/payout-account");
        Assert.Equal(number, response!.Account!.AccountNo);
        await Db(async db =>
        {
            var raw = await db.Database.SqlQuery<string>($"SELECT account_no AS Value FROM dbo.payout_account WHERE owner_user_id={one}").SingleAsync();
            Assert.StartsWith(PayoutAccountProtection.Prefix, raw); Assert.DoesNotContain(number, raw);
            var digest = await db.Database.SqlQuery<string>($"SELECT account_no_digest AS Value FROM dbo.payout_account WHERE owner_user_id={one}").SingleAsync();
            Assert.Matches("^[0-9a-f]{64}$", digest);
            Assert.DoesNotContain(number, string.Join("", await db.AuditLogs.Select(a => a.NewValue).ToListAsync()));
            return true;
        });
        client.DefaultRequestHeaders.Remove("X-Test-User"); client.DefaultRequestHeaders.Add("X-Test-User", two.ToString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/me/payout-account", request)).StatusCode);
    }

    [Fact]
    public async Task Legacy_upgrade_encrypts_in_place_without_rewriting_audit_or_business_state()
    {
        var id = await fixture.CreateInvestorAsync();
        await Db(async db =>
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT dbo.payout_account(owner_user_id,bank_code,account_no,account_holder_name,name_match_status,status) VALUES({id},'ACB','0012','KYC Test','Matched','Active')");
            return true;
        });
        var before = await Db(db => db.AuditLogs.CountAsync());
        var service = new PayoutProtectionUpgrade(fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>());
        await service.StartAsync(default); await service.StartAsync(default);
        await Db(async db =>
        {
            var account = await db.PayoutAccounts.SingleAsync(a => a.OwnerUserId == id);
            Assert.Equal("0012", account.AccountNo); Assert.Equal("Active", account.Status);
            Assert.NotNull(account.AccountNoDigest); Assert.Equal(before, await db.AuditLogs.CountAsync());
            Assert.StartsWith(PayoutAccountProtection.Prefix, await db.Database.SqlQuery<string>($"SELECT account_no AS Value FROM dbo.payout_account WHERE owner_user_id={id}").SingleAsync());
            return true;
        });
    }

    [Fact]
    public async Task Current_database_roles_override_unexpired_jwt_and_locked_account_is_unauthorized()
    {
        var id = await fixture.CreateInvestorAsync();
        await Db(async db => { db.AppUserRoles.Add(new AppUserRole { UserId = id, RoleCode = Roles.Investor }); await db.SaveChangesAsync(); return true; });
        using var app = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddAuthentication(o =>
        {
            o.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            o.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            o.DefaultForbidScheme = JwtBearerDefaults.AuthenticationScheme;
        })));
        using var client = app.CreateClient();
        var token = app.Services.GetRequiredService<TokenService>().Create(id, "jwt@test.local", "KYC Test", [Roles.PlatformAdmin], null).Token;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/me/kyc")).StatusCode);
        await Db(async db => { await db.AppUserRoles.Where(r => r.UserId == id).ExecuteDeleteAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/me/kyc")).StatusCode);
        await Db(async db => { await db.AppUsers.Where(u => u.UserId == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, "Locked")); return true; });
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Repeated_invalid_credentials_return_generic_401_then_429()
    {
        using var client = fixture.Factory.CreateClient();
        var email = $"missing-{Guid.NewGuid():N}@test.local";
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = "wrong-password" })).StatusCode);
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email.ToUpperInvariant(), Password = "wrong-password" });
        Assert.Equal((HttpStatusCode)429, response.StatusCode); Assert.NotNull(response.Headers.RetryAfter);
    }
}

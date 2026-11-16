using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class PaymentProfileDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private HttpClient Client(long id, string role)
    {
        var client = fixture.Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", id.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        return client;
    }

    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private async Task<long> Customer()
        => await Db(async db =>
        {
            var user = new AppUser { Email = $"address-{Guid.NewGuid():N}@test.local", FullName = "Nguyễn An", PasswordHash = "test", Status = "Active",
                Customer = new Customer { CreatedAt = DateTimeOffset.UtcNow } };
            db.AppUsers.Add(user); await db.SaveChangesAsync(); return user.UserId;
        });

    private async Task<long> Operator(string role)
        => await Db(async db =>
        {
            var user = new AppUser { Email = $"owner-{Guid.NewGuid():N}@test.local", FullName = "Nguyễn An", PasswordHash = "test", Status = "Active" };
            var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "HTX Cua Cà Mau", TaxCode = Guid.NewGuid().ToString("N")[..14],
                BusinessRegNo = "TEST", FarmAddress = "Cà Mau", Status = "Approved" };
            db.OperatorMembers.Add(new OperatorMember { User = user, Operator = op, MemberRole = role });
            await db.SaveChangesAsync(); return user.UserId;
        });

    private static PayoutAccountRequest Bank(string name = "KYC Test", string? number = null)
        => new() { BankCode = "vcb", AccountNo = number ?? Random.Shared.NextInt64(1000000000, 9999999999).ToString(), AccountHolderName = name };
    private static AddressRequest Address(string line, bool isDefault = false)
        => new() { RecipientName = "Nguyễn An", RecipientPhone = "0901234567", AddressLine = line, Province = "Cà Mau", IsDefault = isDefault };

    [Fact]
    public async Task Matching_account_is_active_and_records_bank_check_without_changing_identity()
    {
        var id = await fixture.CreateInvestorAsync(); using var client = Client(id, Roles.Investor);
        var response = await client.PutAsJsonAsync("/api/me/payout-account", Bank()); response.EnsureSuccessStatusCode();
        var profile = (await response.Content.ReadFromJsonAsync<PayoutProfileResponse>())!;
        Assert.Equal("Active", profile.Account!.Status); Assert.Equal("Matched", profile.Account.NameMatchStatus);
        await Db(async db =>
        {
            Assert.Equal("Passed", (await db.KycChecks.SingleAsync(k => k.UserId == id)).Result);
            Assert.Equal("BankNameMatch", (await db.KycChecks.SingleAsync(k => k.UserId == id)).CheckType);
            Assert.Equal("Unverified", (await db.Investors.SingleAsync(i => i.UserId == id)).VerificationStatus);
            Assert.True(await db.AuditLogs.AnyAsync(a => a.EntityType == "PayoutAccount" && a.EntityId == profile.Account.PayoutAccountId));
            return true;
        });
        Assert.Equal(profile.Account.PayoutAccountId, (await client.GetFromJsonAsync<PayoutProfileResponse>("/api/me/payout-account"))!.Account!.PayoutAccountId);
    }

    [Fact]
    public async Task Mismatch_is_locked_and_can_be_corrected()
    {
        var id = await fixture.CreateInvestorAsync(); using var client = Client(id, Roles.Investor);
        var input = Bank("Someone Else");
        var response = await client.PutAsJsonAsync("/api/me/payout-account", input); response.EnsureSuccessStatusCode();
        Assert.Equal("Locked", (await response.Content.ReadFromJsonAsync<PayoutProfileResponse>())!.Account!.Status);
        Assert.Equal("Failed", await Db(async db => (await db.KycChecks.SingleAsync(k => k.UserId == id)).Result));
        input.AccountHolderName = "KYC Test";
        response = await client.PutAsJsonAsync("/api/me/payout-account", input); response.EnsureSuccessStatusCode();
        Assert.Equal("Active", (await response.Content.ReadFromJsonAsync<PayoutProfileResponse>())!.Account!.Status);
    }

    [Fact]
    public async Task Replacing_account_closes_old_record_and_preserves_its_bank_details()
    {
        var id = await fixture.CreateInvestorAsync(); using var client = Client(id, Roles.Investor);
        var first = Bank(); (await client.PutAsJsonAsync("/api/me/payout-account", first)).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync("/api/me/payout-account", Bank())).EnsureSuccessStatusCode();
        await Db(async db =>
        {
            var accounts = await db.PayoutAccounts.Where(a => a.OwnerUserId == id).ToListAsync();
            Assert.Equal(2, accounts.Count); Assert.Single(accounts, a => a.Status == "Active");
            Assert.Equal("Closed", accounts.Single(a => a.AccountNo == first.AccountNo).Status); return true;
        });
    }

    [Fact]
    public async Task Concurrent_updates_leave_one_active_account()
    {
        var id = await fixture.CreateInvestorAsync();
        using var a = Client(id, Roles.Investor); using var b = Client(id, Roles.Investor);
        var responses = await Task.WhenAll(a.PutAsJsonAsync("/api/me/payout-account", Bank()), b.PutAsJsonAsync("/api/me/payout-account", Bank()));
        foreach (var response in responses) response.EnsureSuccessStatusCode();
        Assert.Equal(1, await Db(db => db.PayoutAccounts.CountAsync(p => p.OwnerUserId == id && p.Status == "Active")));
    }

    [Fact]
    public async Task Another_owner_cannot_claim_a_bank_account()
    {
        using var a = Client(await fixture.CreateInvestorAsync(), Roles.Investor);
        using var b = Client(await fixture.CreateInvestorAsync(), Roles.Investor); var input = Bank();
        (await a.PutAsJsonAsync("/api/me/payout-account", input)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await b.PutAsJsonAsync("/api/me/payout-account", input)).StatusCode);
    }

    [Fact]
    public async Task Locked_users_cannot_access_profiles_and_matched_locked_accounts_cannot_be_bypassed()
    {
        var id = await fixture.CreateInvestorAsync(); using var client = Client(id, Roles.Investor);
        (await client.PutAsJsonAsync("/api/me/payout-account", Bank())).EnsureSuccessStatusCode();
        await Db(async db => { var account = await db.PayoutAccounts.SingleAsync(p => p.OwnerUserId == id); account.Status = "Locked"; await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/me/payout-account", Bank())).StatusCode);
        await Db(async db => { var user = await db.AppUsers.SingleAsync(u => u.UserId == id); user.Status = "Locked"; await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/me/payout-account")).StatusCode);
    }

    [Fact]
    public async Task Owner_uses_operator_legal_name_but_staff_is_denied()
    {
        var id = await Operator("Owner"); using var owner = Client(id, Roles.OperatorMember);
        var response = await owner.PutAsJsonAsync("/api/me/payout-account?ownerType=Operator", Bank("HTX CUA CA MAU")); response.EnsureSuccessStatusCode();
        var profile = (await response.Content.ReadFromJsonAsync<PayoutProfileResponse>())!;
        Assert.Equal("Operator", profile.OwnerType); Assert.Equal("Active", profile.Account!.Status);
        await Db(async db => { var account = await db.PayoutAccounts.SingleAsync(a => a.PayoutAccountId == profile.Account.PayoutAccountId);
            Assert.Null(account.OwnerUserId); Assert.NotNull(account.OwnerOperatorId); return true; });
        using var staff = Client(await Operator("Staff"), Roles.OperatorMember);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/me/payout-account")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsJsonAsync("/api/me/payout-account", Bank())).StatusCode);
    }

    [Fact]
    public async Task Address_crud_switches_default_and_keeps_other_addresses()
    {
        using var client = Client(await Customer(), Roles.Customer);
        var response = await client.PostAsJsonAsync("/api/me/addresses", Address("12 Đường A"));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var first = (await response.Content.ReadFromJsonAsync<AddressResponse>())!; Assert.True(first.IsDefault);
        Assert.Equal(first.AddressId, (await client.GetFromJsonAsync<AddressResponse>(response.Headers.Location!))!.AddressId);
        response = await client.PostAsJsonAsync("/api/me/addresses", Address("14 Đường B", true)); response.EnsureSuccessStatusCode();
        var second = (await response.Content.ReadFromJsonAsync<AddressResponse>())!;
        var list = (await client.GetFromJsonAsync<AddressResponse[]>("/api/me/addresses"))!;
        Assert.Equal(2, list.Length); Assert.Single(list, a => a.IsDefault); Assert.False(list.Single(a => a.AddressId == first.AddressId).IsDefault);
        (await client.PutAsJsonAsync($"/api/me/addresses/{first.AddressId}", Address("16 Đường C", true))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/me/addresses/{first.AddressId}")).StatusCode);
        list = (await client.GetFromJsonAsync<AddressResponse[]>("/api/me/addresses"))!;
        Assert.Single(list); Assert.True(list[0].IsDefault); Assert.Equal(second.AddressId, list[0].AddressId);
    }

    [Fact]
    public async Task Cannot_read_update_or_delete_another_customers_address()
    {
        using var a = Client(await Customer(), Roles.Customer); using var b = Client(await Customer(), Roles.Customer);
        var response = await a.PostAsJsonAsync("/api/me/addresses", Address("12 Đường A")); response.EnsureSuccessStatusCode();
        var id = (await response.Content.ReadFromJsonAsync<AddressResponse>())!.AddressId;
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/api/me/addresses/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.PutAsJsonAsync($"/api/me/addresses/{id}", Address("Changed"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.DeleteAsync($"/api/me/addresses/{id}")).StatusCode);
        Assert.Empty((await b.GetFromJsonAsync<AddressResponse[]>("/api/me/addresses"))!);
    }

    [Fact]
    public async Task Concurrent_default_addresses_preserve_both_rows_and_one_default()
    {
        var id = await Customer(); using var a = Client(id, Roles.Customer); using var b = Client(id, Roles.Customer);
        var responses = await Task.WhenAll(a.PostAsJsonAsync("/api/me/addresses", Address("A", true)), b.PostAsJsonAsync("/api/me/addresses", Address("B", true)));
        foreach (var response in responses) response.EnsureSuccessStatusCode();
        var list = (await a.GetFromJsonAsync<AddressResponse[]>("/api/me/addresses"))!;
        Assert.Equal(2, list.Length); Assert.Single(list, address => address.IsDefault);
    }
}

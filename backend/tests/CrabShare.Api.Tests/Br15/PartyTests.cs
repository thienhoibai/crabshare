using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests.Br15;

/// <summary>G0: đối tác, vai trò, địa điểm, bên liên quan, pool kiểm phẩm, tham số nền tảng (BR-001…017, 217, 218).</summary>
[Trait("Category", "Database")]
public sealed class PartyTests(Br15Fixture f) : IClassFixture<Br15Fixture>
{
    [Fact]
    public async Task Register_creates_one_party_with_customer_and_investor_roles()
    {
        using var anon = f.Factory.CreateClient();
        var email = $"org-{Guid.NewGuid():N}@test.local";
        var response = await anon.PostAsJsonAsync("/api/auth/register", new
        {
            email, password = "Test-password-123", fullName = "Trần Đại Diện", role = "Investor",
            partyType = "Company", legalName = "Công ty TNHH Hải Sản Test", registrationNo = $"03{Random.Shared.Next(10000000, 99999999)}",
            customerType = "Wholesaler",
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var db = f.OpenDb();
        var user = await db.AppUsers.Include(u => u.Investor).Include(u => u.Customer).SingleAsync(u => u.Email == email);
        var party = await db.Parties.Include(p => p.Roles).SingleAsync(p => p.PartyId == user.PartyId);
        Assert.Equal("Company", party.PartyType);
        Assert.Equal("Công ty TNHH Hải Sản Test", party.LegalName);
        Assert.Equal("Trần Đại Diện", party.Representative);
        Assert.Equal(["Customer", "Investor"], party.Roles.Select(r => r.RoleType).Order().ToArray());
        Assert.Equal("Organization", user.Investor!.InvestorKind);
        Assert.Equal("Wholesaler", user.Customer!.CustomerType);
        Assert.StartsWith("DT", party.PartyCode);
    }

    [Fact]
    public async Task Organization_registration_requires_legal_name()
    {
        using var anon = f.Factory.CreateClient();
        var response = await anon.PostAsJsonAsync("/api/auth/register", new
        {
            email = $"x-{Guid.NewGuid():N}@test.local", password = "Test-password-123", fullName = "A", partyType = "Household",
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("auth.legal_name_required", await Br15Fixture.ErrorCode(response));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("+84")]
    public async Task A_phone_number_already_in_use_is_refused_in_plain_words(string prefixOfSecondAttempt)
    {
        using var anon = f.Factory.CreateClient();
        var subscriber = $"76{Random.Shared.Next(1000000, 9999999)}";
        object Body(string phone) => new { email = $"p-{Guid.NewGuid():N}@test.local", password = "Test-password-123", fullName = "Người Dùng Số", phone };

        Assert.Equal(HttpStatusCode.OK, (await anon.PostAsJsonAsync("/api/auth/register", Body("+84" + subscriber))).StatusCode);

        // Cùng số đó, gõ lại y hệt hoặc gõ theo kiểu trong nước, đều là trùng
        var second = await anon.PostAsJsonAsync("/api/auth/register", Body(prefixOfSecondAttempt + subscriber));
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        var problem = await second.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("auth.phone_taken", problem.GetProperty("code").GetString());
        var detail = problem.GetProperty("detail").GetString()!;
        Assert.Equal("Số điện thoại này đã được dùng cho một tài khoản khác.", detail);
        Assert.DoesNotContain(subscriber, detail);
    }

    [Fact]
    public async Task Supplier_recorded_by_farmer_waits_for_admin_then_appears_in_directory()
    {
        var farmer = await f.CreateFarmerAsync();
        using var client = farmer.Client(f);
        var created = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/parties/external", new
        {
            legalName = $"Vựa cua Năm Căn {f.Next()}", partyType = "Household", phone = "0912345678", roleType = "Supplier",
        }));
        Assert.Equal("Pending", created.GetProperty("verificationStatus").GetString());
        var partyId = created.GetProperty("partyId").GetInt64();

        var before = await Br15Fixture.Body(await client.GetAsync("/api/parties/directory?roleType=Supplier"));
        Assert.DoesNotContain(before.EnumerateArray(), p => p.GetProperty("partyId").GetInt64() == partyId);

        using var admin = f.Admin();
        var verified = await Br15Fixture.Body(await admin.PostAsync($"/api/admin/parties/{partyId}/verify", null));
        Assert.Equal("Verified", verified.GetProperty("verificationStatus").GetString());
        Assert.Contains(verified.GetProperty("roles").EnumerateArray(),
            r => r.GetProperty("roleType").GetString() == "Supplier" && r.GetProperty("status").GetString() == "Active");

        var after = await Br15Fixture.Body(await client.GetAsync("/api/parties/directory?roleType=Supplier"));
        Assert.Contains(after.EnumerateArray(), p => p.GetProperty("partyId").GetInt64() == partyId);
    }

    [Fact]
    public async Task Reject_needs_reason_and_role_cannot_activate_on_unverified_party()
    {
        var farmer = await f.CreateFarmerAsync();
        using var client = farmer.Client(f);
        var created = await Br15Fixture.Body(await Br15Fixture.PostJson(client, "/api/parties/external", new
        {
            legalName = $"Nhà hàng thu mua {f.Next()}", partyType = "Company", phone = "0911111111", roleType = "OfftakeBuyer",
        }));
        var partyId = created.GetProperty("partyId").GetInt64();
        using var admin = f.Admin();
        var noReason = await admin.PostAsJsonAsync($"/api/admin/parties/{partyId}/reject", new { });
        Assert.Equal("party.reason_required", await Br15Fixture.ErrorCode(noReason));
        var activate = await admin.PostAsJsonAsync($"/api/admin/parties/{partyId}/roles", new { roleType = "OfftakeBuyer", status = "Active" });
        Assert.Equal("party.not_verified", await Br15Fixture.ErrorCode(activate));
        var rejected = await Br15Fixture.Body(await admin.PostAsJsonAsync($"/api/admin/parties/{partyId}/reject", new { reason = "Không có giấy phép" }));
        Assert.Equal("Rejected", rejected.GetProperty("verificationStatus").GetString());
        Assert.Contains(rejected.GetProperty("roles").EnumerateArray(), r => r.GetProperty("status").GetString() == "Revoked");
    }

    [Fact]
    public async Task Related_party_keeps_only_last_four_digits_and_rejects_duplicates()
    {
        var farmer = await f.CreateFarmerAsync();
        using var client = farmer.Client(f);
        var body = new { fullName = "Nguyễn Văn Em", relation = "Em ruột", idNumber = "079123456789" };
        var added = await Br15Fixture.Body(await client.PostAsJsonAsync("/api/me/related-parties", body));
        Assert.Equal("6789", added.GetProperty("idNumberLast4").GetString());
        var duplicate = await client.PostAsJsonAsync("/api/me/related-parties", body);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        await using var db = f.OpenDb();
        var row = await db.RelatedParties.SingleAsync(r => r.PartyId == farmer.PartyId);
        Assert.DoesNotContain("079123456789", row.IdNumberDigest);
        Assert.Equal(64, row.IdNumberDigest.Length);
    }

    [Fact]
    public async Task Farm_site_needs_coordinates_and_one_default_per_type()
    {
        var farmer = await f.CreateFarmerAsync();
        using var client = farmer.Client(f);
        var noCoords = await client.PostAsJsonAsync("/api/me/sites", new { siteType = "Farm", name = "Trại 2", addressLine = "Ngọc Hiển" });
        Assert.Equal("party.farm_coordinates", await Br15Fixture.ErrorCode(noCoords));
        var second = await Br15Fixture.Body(await client.PostAsJsonAsync("/api/me/sites", new
        {
            siteType = "Farm", name = "Trại 2", addressLine = "Ngọc Hiển", latitude = 8.65m, longitude = 105.0m, isDefault = true,
        }));
        Assert.True(second.GetProperty("isDefault").GetBoolean());
        var farms = await Br15Fixture.Body(await client.GetAsync("/api/me/sites?siteType=Farm"));
        Assert.Equal(1, farms.EnumerateArray().Count(s => s.GetProperty("isDefault").GetBoolean()));
        Assert.Equal(2, farms.GetArrayLength());
    }

    [Fact]
    public async Task Qc_pool_grant_list_and_operator_conflict()
    {
        var qc = await f.CreateUserAsync("QC", Roles.Customer);
        var farmer = await f.CreateFarmerAsync();
        using var admin = f.Admin();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync("/api/admin/qc-inspectors", new { userId = qc })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync("/api/admin/qc-inspectors", new { userId = qc })).StatusCode);
        var conflict = await admin.PostAsJsonAsync("/api/admin/qc-inspectors", new { userId = farmer.UserId });
        Assert.Equal("qc.operator_conflict", await Br15Fixture.ErrorCode(conflict));
        var list = await Br15Fixture.Body(await admin.GetAsync("/api/admin/qc-inspectors"));
        Assert.Contains(list.EnumerateArray(), q => q.GetProperty("userId").GetInt64() == qc);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/qc-inspectors/{qc}")).StatusCode);
    }

    [Fact]
    public async Task Parameters_are_append_only_with_future_effective_dates()
    {
        using var admin = f.Admin();
        var past = await admin.PostAsJsonAsync("/api/admin/parameters", new { key = "DepositRatePct", value = 25, effectiveFrom = DateTimeOffset.UtcNow.AddDays(-2) });
        Assert.Equal("parameter.past_effective", await Br15Fixture.ErrorCode(past));
        var range = await admin.PostAsJsonAsync("/api/admin/parameters", new { key = "DepositRatePct", value = 250, effectiveFrom = DateTimeOffset.UtcNow.AddDays(1) });
        Assert.Equal("parameter.out_of_range", await Br15Fixture.ErrorCode(range));
        var future = DateTimeOffset.UtcNow.AddDays(3);
        Assert.Equal(HttpStatusCode.Created,
            (await admin.PostAsJsonAsync("/api/admin/parameters", new { key = "MinOrderCrabs", value = 12, effectiveFrom = future })).StatusCode);

        var publicValues = await Br15Fixture.Body(await f.Factory.CreateClient().GetAsync("/api/parameters"));
        Assert.Equal(10m, publicValues.GetProperty("MinOrderCrabs").GetDecimal()); // giá trị mới chưa tới ngày hiệu lực

        await using var db = f.OpenDb();
        var update = () => db.Database.ExecuteSqlRawAsync("UPDATE dbo.platform_parameter SET value = 1 WHERE param_key = 'MinOrderCrabs'");
        await Assert.ThrowsAnyAsync<Exception>(update);
    }

    [Fact]
    public async Task Farm_approval_verifies_party_and_activates_farmer_role()
    {
        var userId = await f.CreateUserAsync("Người nuôi mới", Roles.Customer);
        using var client = f.Client(userId, Roles.Customer);
        var created = await client.PostAsJsonAsync("/api/operators", new
        {
            legalName = $"HTX Cua Đất Mũi {f.Next()}", taxCode = $"{Random.Shared.Next(100000000, 999999999)}",
            businessRegNo = "KD-1", farmAddress = "Đất Mũi, Cà Mau",
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync("/api/operators/me/submit", null)).StatusCode);

        await using (var db = f.OpenDb())
        {
            var partyId = await db.AppUsers.Where(u => u.UserId == userId).Select(u => u.PartyId).SingleAsync();
            var role = await db.PartnerRoles.SingleAsync(r => r.PartyId == partyId && r.RoleType == "Farmer");
            Assert.Equal("Pending", role.Status);
        }

        long operatorId;
        await using (var db = f.OpenDb())
            operatorId = await db.OperatorMembers.Where(m => m.UserId == userId).Select(m => m.OperatorId).SingleAsync();
        using var admin = f.Admin();
        var approve = await admin.PostAsJsonAsync($"/api/admin/operators/{operatorId}/approve", new { approvedSlotCapacity = 100 });
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        await using (var db = f.OpenDb())
        {
            var partyId = await db.Operators.Where(o => o.OperatorId == operatorId).Select(o => o.PartyId).SingleAsync();
            var party = await db.Parties.Include(p => p.Roles).SingleAsync(p => p.PartyId == partyId);
            Assert.Equal("Verified", party.VerificationStatus);
            Assert.Equal("Cooperative", party.PartyType);
            Assert.Contains(party.Roles, r => r.RoleType == "Farmer" && r.Status == "Active");
            Assert.True(await db.PartySites.AnyAsync(s => s.PartyId == partyId && s.SiteType == "Farm"));
        }
    }
}

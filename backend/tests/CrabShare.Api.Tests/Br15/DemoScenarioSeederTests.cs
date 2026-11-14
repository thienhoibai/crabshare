using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests.Br15;

/// <summary>
/// Kịch bản demo chờ quyết toán (Seed:DemoScenarios): trên một CSDL đã có dữ liệu như môi trường triển khai (tài khoản mẫu, hộ nuôi mẫu, 8 Lô),
/// seeder dựng ba Lô QT-DEMO-* đang chờ quyết toán bằng service thật; chạy lại không tạo gì; Admin làm trọn quyết toán qua API tới khi Lô đóng
/// và nhà đầu tư thấy sao kê.
/// </summary>
[Trait("Category", "Database")]
public sealed class DemoScenarioSeederTests(Br15Fixture f) : IClassFixture<Br15Fixture>
{
    private async Task<long> UserIdAsync(string email)
    {
        await using var db = f.OpenDb();
        return await db.AppUsers.Where(u => u.Email == email).Select(u => u.UserId).SingleAsync();
    }

    /// <summary>Như tools/demo-flows: trại của hộ nuôi mẫu cần toạ độ (điểm xuất hàng); khai qua API bằng tài khoản chủ hộ nếu còn thiếu.</summary>
    private async Task FarmHasCoordinatesAsync()
    {
        var owner = await UserIdAsync("operator@crabshare.local");
        long operatorId;
        await using (var db = f.OpenDb())
            operatorId = await db.OperatorMembers.Where(m => m.UserId == owner && m.MemberRole == "Owner").Select(m => m.OperatorId).SingleAsync();
        using var farmer = f.Client(owner, operatorId, Roles.OperatorMember);
        var farms = await Br15Fixture.Body(await farmer.GetAsync("/api/me/sites?siteType=Farm"));
        if (farms.EnumerateArray().Any(s => s.GetProperty("latitude").ValueKind == JsonValueKind.Number)) return;
        var farm = farms[0];
        await Br15Fixture.Body(await farmer.PutAsJsonAsync($"/api/me/sites/{farm.GetProperty("siteId").GetInt64()}", new
        {
            siteType = "Farm", name = farm.GetProperty("name").GetString(), addressLine = farm.GetProperty("addressLine").GetString(),
            latitude = 8.7601m, longitude = 105.0503m, isDefault = true,
        }, Br15Fixture.Json));
    }

    /// <summary>Như môi trường triển khai: đối tác của hộ nuôi mẫu đã xác minh và có vai trò người nuôi đang hoạt động (Admin bật qua API nếu thiếu).</summary>
    private async Task FarmerRoleIsActiveAsync()
    {
        long partyId;
        await using (var db = f.OpenDb())
        {
            var owner = await db.AppUsers.Where(u => u.Email == "operator@crabshare.local").Select(u => u.UserId).SingleAsync();
            partyId = await db.OperatorMembers.Where(m => m.UserId == owner && m.MemberRole == "Owner").Select(m => m.Operator.PartyId).SingleAsync()
                      ?? await db.AppUsers.Where(u => u.UserId == owner).Select(u => u.PartyId!.Value).SingleAsync();
        }
        using var admin = f.Admin();
        var party = await Br15Fixture.Body(await admin.GetAsync($"/api/admin/parties/{partyId}"));
        if (party.GetProperty("verificationStatus").GetString() != "Verified")
            await Br15Fixture.Body(await admin.PostAsync($"/api/admin/parties/{partyId}/verify", null));
        if (!party.GetProperty("roles").EnumerateArray().Any(r => r.GetProperty("roleType").GetString() == "Farmer" && r.GetProperty("status").GetString() == "Active"))
            await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/parties/{partyId}/roles", new { roleType = "Farmer", status = "Active" }));
    }

    [Fact]
    public async Task Seeds_three_batches_awaiting_settlement_on_deployed_data_once_and_admin_settles_each_to_closed()
    {
        // CSDL như môi trường đã triển khai: bổ sung demo (tài khoản mẫu, hộ nuôi mẫu, 8 Lô ở đủ giai đoạn), trại có toạ độ, vai trò người nuôi bật.
        await DevDataSeeder.SeedAsync(f.Factory.Services, topUp: true);
        await FarmerRoleIsActiveAsync();
        await FarmHasCoordinatesAsync();
        int batchesBefore;
        await using (var db = f.OpenDb()) batchesBefore = await db.Batches.CountAsync();
        Assert.True(batchesBefore >= 8);

        Assert.Equal(DemoScenarioSeeder.BatchCodes, await DemoScenarioSeeder.CreateAsync(f.Factory.Services));
        Assert.Empty(await DemoScenarioSeeder.CreateAsync(f.Factory.Services)); // chạy lại: Lô đã có mã thì bỏ qua
        await using (var db = f.OpenDb())
        {
            Assert.Equal(batchesBefore + 3, await db.Batches.CountAsync());
            var seeded = await db.Batches.Where(b => DemoScenarioSeeder.BatchCodes.Contains(b.BatchCode)).ToListAsync();
            Assert.All(seeded, b => Assert.Equal("AwaitingSettlement", b.Status));
            Assert.Equal(["A", "P", "T"], seeded.Select(b => b.BatchMode).Order().ToArray());
        }

        using var admin = f.Admin();
        foreach (var code in DemoScenarioSeeder.BatchCodes)
        {
            var ready = await Br15Fixture.Body(await admin.GetAsync($"/api/batches/{code}/settlement-readiness"));
            Assert.True(ready.GetProperty("ready").GetBoolean(), code);
        }
        var investors = new[] { await UserIdAsync("investor1@crabshare.local"), await UserIdAsync("investor2@crabshare.local"), await UserIdAsync("investor3@crabshare.local") };

        // Lô P: tính → công bố → nhà đầu tư thấy sao kê → kết thúc hạn góp ý (công cụ demo) → duyệt (số dư khớp) → gửi lệnh chi → Lô đóng.
        var p = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/batches/{DemoScenarioSeeder.PBatchCode}/settlements", new { }));
        var pId = p.GetProperty("settlementId").GetInt64();
        Assert.Equal("P", p.GetProperty("breakdown").GetProperty("mode").GetString());
        Assert.Equal(4_500_000, p.GetProperty("lockedStandardCost").GetInt64());
        Assert.True(p.GetProperty("revenuePool").GetInt64() > 0);
        Assert.Equal(3, p.GetProperty("lines").GetArrayLength());
        Assert.Equal(investors.Order(), p.GetProperty("lines").EnumerateArray().Select(l => l.GetProperty("investorId").GetInt64()).Order());
        await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/settlements/{pId}/propose", new { feedbackDays = 7 }));
        using (var investor = f.Client(investors[0], Roles.Investor))
        {
            var mine = await Br15Fixture.Body(await investor.GetAsync("/api/me/settlements"));
            Assert.Contains(mine.EnumerateArray(), s => s.GetProperty("batchCode").GetString() == DemoScenarioSeeder.PBatchCode);
            var statement = await Br15Fixture.Body(await investor.GetAsync($"/api/settlements/{pId}"));
            var line = Assert.Single(statement.GetProperty("lines").EnumerateArray(), l => l.GetProperty("isMine").GetBoolean());
            Assert.True(line.GetProperty("netPayout").GetInt64() > 2_000_000); // vốn 2.000.000 đ + phần chia
        }
        await Br15Fixture.Body(await admin.PostAsync($"/api/dev/settlements/{pId}/end-feedback-window", null));
        Assert.Equal("Approved", (await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{pId}/approve", null))).GetProperty("status").GetString());
        var pDone = await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{pId}/send-payouts", null));
        Assert.Equal("Closed", pDone.GetProperty("batchStatus").GetString());
        Assert.Equal("Closed", pDone.GetProperty("status").GetString());
        var money = await Br15Fixture.Body(await admin.GetAsync($"/api/batches/{DemoScenarioSeeder.PBatchCode}/money-summary"));
        Assert.Equal(0, money.GetProperty("batch").GetProperty("heldInAccount").GetInt64());

        // Lô T: kết quả thương vụ nội bộ, duyệt là đóng.
        var t = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/batches/{DemoScenarioSeeder.TBatchCode}/settlements", new { }));
        Assert.Equal("T", t.GetProperty("breakdown").GetProperty("mode").GetString());
        Assert.Equal(0, t.GetProperty("lines").GetArrayLength());
        var tDone = await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{t.GetProperty("settlementId").GetInt64()}/approve", null));
        Assert.Equal("Closed", tDone.GetProperty("batchStatus").GetString());

        // Lô A: hoa hồng 8 % doanh thu cho nền tảng, phần còn lại cho nhà cung cấp; duyệt rồi gửi lệnh chi.
        var a = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, $"/api/admin/batches/{DemoScenarioSeeder.ABatchCode}/settlements", new { }));
        var aBreakdown = a.GetProperty("breakdown");
        Assert.Equal("A", aBreakdown.GetProperty("mode").GetString());
        var revenue = a.GetProperty("actualRevenue").GetInt64();
        Assert.Equal(decimal.Round(revenue * 0.08m, 0, MidpointRounding.AwayFromZero), aBreakdown.GetProperty("commissionAmount").GetInt64());
        Assert.Equal(revenue - aBreakdown.GetProperty("commissionAmount").GetInt64(), aBreakdown.GetProperty("supplierPayout").GetInt64());
        var aId = a.GetProperty("settlementId").GetInt64();
        await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{aId}/approve", null));
        Assert.Equal("Closed", (await Br15Fixture.Body(await admin.PostAsync($"/api/admin/settlements/{aId}/send-payouts", null))).GetProperty("batchStatus").GetString());

        // Nhà đầu tư thấy sao kê của Lô đã đóng.
        using (var investor = f.Client(investors[1], Roles.Investor))
        {
            var mine = await Br15Fixture.Body(await investor.GetAsync("/api/me/settlements"));
            Assert.Contains(mine.EnumerateArray(), s => s.GetProperty("batchCode").GetString() == DemoScenarioSeeder.PBatchCode && s.GetProperty("status").GetString() == "Closed");
        }
    }
}

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Settlement;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

/// <summary>
/// Dùng chung cho test quyết toán TH-12/13/14: lô đã chốt vốn, có chi phí chuẩn khoá, có đơn Completed tạo doanh thu.
/// </summary>
public abstract class SettlementTestBase(FundingDatabaseFixture fixture)
{
    protected const string Password = "Test-password-123";
    protected FundingDatabaseFixture Fixture { get; } = fixture;

    protected async Task<(HttpClient Client, long UserId)> UserAsync(string fullName, string role = "Customer", string? extraRole = null, string? memberRole = null)
    {
        var email = $"st-{Guid.NewGuid():N}@test.local";
        (await Fixture.Factory.CreateClient().PostAsJsonAsync("/api/auth/register", new { email, password = Password, fullName, role })).EnsureSuccessStatusCode();
        await using (var db = Fixture.OpenDb())
        {
            var userId = await db.AppUsers.Where(u => u.Email == email).Select(u => u.UserId).SingleAsync();
            var now = DateTimeOffset.UtcNow;
            if (extraRole is not null) db.AppUserRoles.Add(new AppUserRole { UserId = userId, RoleCode = extraRole, GrantedAt = now, CreatedAt = now });
            if (memberRole is not null)
                db.OperatorMembers.Add(new OperatorMember { UserId = userId, OperatorId = Fixture.OperatorId, MemberRole = memberRole, JoinedAt = now, CreatedAt = now });
            await db.SaveChangesAsync();
        }
        var client = Fixture.Factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        login.EnsureSuccessStatusCode();
        var auth = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth.User.UserId);
    }

    protected Task<(HttpClient Client, long UserId)> AdminAsync() => UserAsync("Admin quyết toán", extraRole: Roles.PlatformAdmin);

    /// <summary>
    /// Lô Harvesting: chi phí chuẩn khoá <paramref name="cost"/> (trong đó 5% là khấu hao), vốn đã chốt của từng nhà đầu tư,
    /// và các đơn Completed cộng lại thành <paramref name="revenue"/>.
    /// </summary>
    protected async Task<(long BatchId, string Code, long AccountId)> HarvestedBatchAsync(long revenue, long cost, IReadOnlyList<(long InvestorId, long Capital)> shares)
    {
        await using var db = Fixture.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var code = $"TS-{Guid.NewGuid():N}"[..20];
        var total = shares.Sum(s => s.Capital);
        var batch = new Batch
        {
            BatchCode = code, OperatorId = Fixture.OperatorId, CrabType = "FatteningMudCrab", Title = "Lô test quyết toán",
            SeedQuantity = 2000, ExpectedOutputKg = 600, CycleDays = 90, RestockCutoffDays = 15,
            MinViableCapital = Math.Max(1, total / 2), TargetCapital = Math.Max(1, total), MaxCapital = Math.Max(1, total),
            MinContribution = 1_000, OperatorSharePct = 7, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15,
            Status = "Harvesting", FundingOpenAt = now.AddDays(-120), FundingDeadline = now.AddDays(-100), CapitalClosedAt = now.AddDays(-100),
            TotalConfirmedCapital = total, StockedAt = now.AddDays(-95), CreatedAt = now, UpdatedAt = now,
            BatchAccount = new BatchAccount { ProviderName = "Sandbox", ProviderAccountNo = "SBX" + code[3..], Status = "Open", OpenedAt = now, CreatedAt = now, UpdatedAt = now },
        };
        db.Batches.Add(batch);
        await db.SaveChangesAsync();

        var depreciation = cost / 20;
        var version = new StandardCostVersion { BatchId = batch.BatchId, VersionNo = 1, Status = "Draft", CreatedAt = now, UpdatedAt = now };
        version.StandardCostItems.Add(new StandardCostItem { Category = "Feed", Description = "Thức ăn", Quantity = 1, Unit = "gói", UnitPrice = cost - depreciation, TrancheNo = 1, CreatedAt = now });
        version.StandardCostItems.Add(new StandardCostItem { Category = "Depreciation", Description = "Khấu hao hộp", Quantity = 1, Unit = "kỳ", UnitPrice = depreciation, CreatedAt = now });
        db.StandardCostVersions.Add(version);
        foreach (var (investorId, capital) in shares)
            db.CapitalShares.Add(new CapitalShare { BatchId = batch.BatchId, InvestorId = investorId, ConfirmedAmount = capital, SnapshottedAt = now.AddDays(-100), CreatedAt = now });
        if (revenue > 0)
        {
            var (_, customerId) = await UserAsync("Khách mua cua");
            foreach (var part in new[] { revenue / 3, revenue - revenue / 3 })
                db.SalesOrders.Add(new SalesOrder
                {
                    OrderNo = "OD" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant(), CustomerId = customerId, BatchId = batch.BatchId,
                    OrderType = "Retail", Status = "Completed", TotalAmount = part, RecipientName = "Khách", RecipientPhone = "0900000000",
                    ShippingAddress = "Cà Mau", PlacedAt = now.AddDays(-10), PaidAt = now.AddDays(-10), CompletedAt = now.AddDays(-2),
                    CreatedAt = now, UpdatedAt = now,
                });
        }
        await db.SaveChangesAsync();
        await db.StandardCostVersions.Where(v => v.CostVersionId == version.CostVersionId)
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.Status, "Locked").SetProperty(v => v.LockedAt, now.AddDays(-110)));
        return (batch.BatchId, code, batch.BatchAccount.BatchAccountId);
    }

    protected static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    protected static async Task<SettlementResponse> CalculateAsync(HttpClient admin, string code, decimal taxPct = 0)
    {
        var response = await admin.PostAsJsonAsync($"/api/admin/batches/{code}/settlements", new { taxWithholdingPct = taxPct });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<SettlementResponse>())!;
    }
}

/// <summary>
/// TH-12: tính quyết toán. Hoàn thành khi: tổng dòng = phần chia đúng 1 đồng; Pool âm; lô 100 nhà đầu tư tính &lt; 10 giây.
/// </summary>
[Trait("Category", "Database")]
public class SettlementDatabaseTests(FundingDatabaseFixture fixture) : SettlementTestBase(fixture), IClassFixture<FundingDatabaseFixture>
{
    [Fact]
    public async Task Positive_pool_pays_remuneration_and_lines_match_to_the_dong()
    {
        var (_, a) = await UserAsync("Nhà đầu tư A", "Investor");
        var (_, b) = await UserAsync("Nhà đầu tư B", "Investor");
        var (batchId, code, _) = await HarvestedBatchAsync(150_000_001, 100_000_000, [(a, 60_000_000), (b, 40_000_000)]);
        var (admin, _) = await AdminAsync();

        var s = await CalculateAsync(admin, code, taxPct: 5);

        Assert.Equal("Draft", s.Status);
        Assert.Equal(1, s.RevisionNo);
        Assert.Equal(150_000_001, s.ActualRevenue);
        Assert.Equal(100_000_000, s.LockedStandardCost);
        Assert.Equal(50_000_001, s.RevenuePool);
        Assert.Equal(3_500_000, s.OperatorRemuneration); // 7% × 50.000.001 làm tròn xuống
        Assert.Equal(5_000_000, s.DepreciationAmount);
        Assert.Equal(46_500_001, s.Distributable);
        Assert.Equal(s.Distributable, s.Lines.Sum(l => l.ProfitShare));
        Assert.Equal(0, s.ReconciliationDifference);
        Assert.Equal(s.Lines.Sum(l => l.TaxWithheld), s.TaxTotal);
        Assert.All(s.Lines, l => Assert.Equal(l.CapitalReturn + l.ProfitShare - l.TaxWithheld, l.NetPayout));
        Assert.Equal(100_000_000, s.TotalCapital);

        await using var db = Fixture.OpenDb();
        Assert.Equal("Settlement", (await db.Batches.SingleAsync(x => x.BatchId == batchId)).Status);
        var reconciliation = await db.VSettlementReconciliations.SingleAsync(v => v.SettlementId == s.SettlementId);
        Assert.Equal(0, reconciliation.Difference);
        Assert.True(await db.AuditLogs.AnyAsync(x => x.EntityType == "settlement" && x.EntityId == s.SettlementId && x.ActionType == "calculate"));

        // Tính lại trước khi duyệt: tăng revision, thay dòng
        var again = await CalculateAsync(admin, code, taxPct: 0);
        Assert.Equal(2, again.RevisionNo);
        Assert.Equal(0, again.TaxTotal);
        Assert.Equal(2, again.Lines.Count);
    }

    [Fact]
    public async Task Negative_pool_has_no_remuneration_and_loss_is_capped_at_capital()
    {
        var (_, a) = await UserAsync("Nhà đầu tư lỗ A", "Investor");
        var (_, b) = await UserAsync("Nhà đầu tư lỗ B", "Investor");
        var (_, code, _) = await HarvestedBatchAsync(70_000_000, 100_000_000, [(a, 60_000_000), (b, 40_000_000)]);
        var (admin, _) = await AdminAsync();

        var s = await CalculateAsync(admin, code, taxPct: 5);
        Assert.Equal(-30_000_000, s.RevenuePool);
        Assert.Equal(0, s.OperatorRemuneration);
        Assert.Equal([-18_000_000L, -12_000_000L], s.Lines.OrderBy(l => l.InvestorId).Select(l => l.ProfitShare));
        Assert.Equal(0, s.TaxTotal);
        Assert.Equal(0, s.UncoveredLoss);

        // Doanh thu 0 và vốn nhỏ hơn chi phí: mỗi người mất đúng vốn, phần lỗ vượt không chia cho nhà đầu tư
        var (_, c) = await UserAsync("Nhà đầu tư C", "Investor");
        var (_, code2, _) = await HarvestedBatchAsync(0, 100_000_000, [(c, 80_000_000)]);
        var wiped = await CalculateAsync(admin, code2);
        Assert.Equal(0, Assert.Single(wiped.Lines).NetPayout);
        Assert.Equal(20_000_000, wiped.UncoveredLoss);
    }

    [Fact]
    public async Task Hundred_investors_settle_within_ten_seconds()
    {
        var shares = new List<(long, long)>();
        await using (var db = Fixture.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            for (var i = 0; i < 100; i++)
            {
                var user = new AppUser { Email = $"st100-{Guid.NewGuid():N}@test.local", FullName = $"Nhà đầu tư {i}", PasswordHash = "x", Status = "Active", CreatedAt = now, UpdatedAt = now };
                user.Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = now, CreatedAt = now };
                db.AppUsers.Add(user);
                await db.SaveChangesAsync();
                shares.Add((user.UserId, 1_000_000 + i * 13_579));
            }
        }
        var (_, code, _) = await HarvestedBatchAsync(333_333_333, 150_000_000, shares);
        var (admin, _) = await AdminAsync();

        var started = System.Diagnostics.Stopwatch.StartNew();
        var s = await CalculateAsync(admin, code, taxPct: 5);
        Assert.True(started.Elapsed < TimeSpan.FromSeconds(10), $"Mất {started.Elapsed.TotalSeconds:N1} giây");
        Assert.Equal(100, s.InvestorCount);
        Assert.Equal(s.Distributable, s.Lines.Sum(l => l.ProfitShare));
    }

    [Fact]
    public async Task Only_admins_calculate_and_only_harvested_batches_qualify()
    {
        var (investor, a) = await UserAsync("Nhà đầu tư thường", "Investor");
        var (_, code, _) = await HarvestedBatchAsync(10_000_000, 9_000_000, [(a, 9_000_000)]);
        Assert.Equal(HttpStatusCode.Forbidden, (await investor.PostAsJsonAsync($"/api/admin/batches/{code}/settlements", new { taxWithholdingPct = 0 })).StatusCode);

        var (admin, _) = await AdminAsync();
        await using (var db = Fixture.OpenDb())
            await db.Batches.Where(b => b.BatchCode == code).ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "InProduction"));
        var notReady = await admin.PostAsJsonAsync($"/api/admin/batches/{code}/settlements", new { taxWithholdingPct = 0 });
        Assert.Equal("settlement.batch_not_ready", await ErrorCode(notReady));
    }
}

/// <summary>
/// TH-13: công bố + sao kê + góp ý trong hạn. Hoàn thành khi: góp ý sau hạn → 422; nhà đầu tư không xem được dòng của người khác.
/// </summary>
[Trait("Category", "Database")]
public class SettlementReviewDatabaseTests(FundingDatabaseFixture fixture) : SettlementTestBase(fixture), IClassFixture<FundingDatabaseFixture>
{
    [Fact]
    public async Task Published_statement_shows_investors_only_their_line_and_feedback_follows_the_window()
    {
        var (investorA, a) = await UserAsync("Nhà đầu tư A13", "Investor");
        var (investorB, b) = await UserAsync("Nhà đầu tư B13", "Investor");
        var (_, code, _) = await HarvestedBatchAsync(120_000_000, 100_000_000, [(a, 70_000_000), (b, 30_000_000)]);
        var (admin, _) = await AdminAsync();
        var (owner, _) = await UserAsync("Chủ hộ nuôi 13", extraRole: Roles.OperatorMember, memberRole: "Owner");
        var (stranger, _) = await UserAsync("Người ngoài 13", "Investor");
        var draft = await CalculateAsync(admin, code);

        // Bản nháp chỉ admin thấy
        Assert.Equal(HttpStatusCode.NotFound, (await investorA.GetAsync($"/api/settlements/{draft.SettlementId}")).StatusCode);

        var proposed = await admin.PostAsJsonAsync($"/api/admin/settlements/{draft.SettlementId}/propose", new { feedbackDays = 7 });
        Assert.Equal(HttpStatusCode.OK, proposed.StatusCode);
        var published = (await proposed.Content.ReadFromJsonAsync<SettlementResponse>())!;
        Assert.Equal("Proposed", published.Status);
        Assert.True(published.FeedbackDeadline >= published.ProposedAt!.Value.AddDays(7));
        Assert.Equal("settlement.not_draft", await ErrorCode(await admin.PostAsJsonAsync($"/api/admin/settlements/{draft.SettlementId}/propose", new { feedbackDays = 7 })));

        // Nhà đầu tư A: tổng + đúng một dòng của mình
        var mine = (await investorA.GetFromJsonAsync<SettlementResponse>($"/api/settlements/{draft.SettlementId}"))!;
        var line = Assert.Single(mine.Lines);
        Assert.Equal(a, line.InvestorId);
        Assert.True(line.IsMine);
        Assert.Equal(published.RevenuePool, mine.RevenuePool);
        Assert.DoesNotContain(mine.Lines, l => l.InvestorId == b);
        // Người nuôi xem đủ dòng; người ngoài không thấy bảng
        Assert.Equal(2, (await owner.GetFromJsonAsync<SettlementResponse>($"/api/settlements/{draft.SettlementId}"))!.Lines.Count);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/settlements/{draft.SettlementId}")).StatusCode);
        Assert.Contains((await investorB.GetFromJsonAsync<List<SettlementSummary>>("/api/me/settlements"))!, x => x.SettlementId == draft.SettlementId && x.FeedbackOpen);

        // Góp ý trong hạn → Disputed; admin trả lời → về Proposed
        var feedback = await investorA.PostAsJsonAsync($"/api/settlements/{draft.SettlementId}/feedback", new { content = "Đơn OD-123 giao ngày 10/10 chưa thấy trong doanh thu." });
        Assert.Equal(HttpStatusCode.OK, feedback.StatusCode);
        var disputed = (await feedback.Content.ReadFromJsonAsync<SettlementResponse>())!;
        Assert.Equal("Disputed", disputed.Status);
        var feedbackId = Assert.Single(disputed.Feedback).FeedbackId;
        var bView = (await investorB.GetFromJsonAsync<SettlementResponse>($"/api/settlements/{draft.SettlementId}"))!;
        Assert.Empty(bView.Feedback); // không thấy góp ý của người khác
        var answered = (await (await admin.PostAsJsonAsync($"/api/admin/settlement-feedback/{feedbackId}/answer",
            new { response = "Đơn đó bị trả hàng nên không tính doanh thu.", unresolved = false })).Content.ReadFromJsonAsync<SettlementResponse>())!;
        Assert.Equal("Proposed", answered.Status);
        Assert.Equal("Answered", Assert.Single(answered.Feedback).Status);

        // Hết hạn góp ý → 422
        await using (var db = Fixture.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            await db.Settlements.Where(s => s.SettlementId == draft.SettlementId).ExecuteUpdateAsync(s => s
                .SetProperty(x => x.ProposedAt, now.AddDays(-8)).SetProperty(x => x.FeedbackDeadline, now.AddDays(-1)));
        }
        var late = await investorB.PostAsJsonAsync($"/api/settlements/{draft.SettlementId}/feedback", new { content = "Tôi muốn xem lại khoản chi phí thức ăn." });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, late.StatusCode);
        Assert.Equal("settlement.feedback_closed", await ErrorCode(late));

        await using var check = Fixture.OpenDb();
        foreach (var action in new[] { "propose" })
            Assert.True(await check.AuditLogs.AnyAsync(x => x.EntityType == "settlement" && x.EntityId == draft.SettlementId && x.ActionType == action));
        Assert.True(await check.AuditLogs.AnyAsync(x => x.EntityType == "settlement_feedback" && x.EntityId == feedbackId && x.ActionType == "answer"));
    }
}

/// <summary>
/// TH-14: duyệt quyết toán + phát lệnh chi trả + đóng lô. Hoàn thành khi: lô đi hết Settlement → Closed; mọi bước có audit;
/// bảng đã duyệt không sửa được (trigger trg_settlement_locked).
/// </summary>
[Trait("Category", "Database")]
public class SettlementPayoutDatabaseTests(FundingDatabaseFixture fixture) : SettlementTestBase(fixture), IClassFixture<FundingDatabaseFixture>
{
    [Fact]
    public async Task Approved_settlement_pays_tax_operator_and_investors_then_closes_the_batch()
    {
        var (investorA, a) = await UserAsync("Nhà đầu tư Chi A", "Investor");
        var (investorB, b) = await UserAsync("Nhà đầu tư Chi B", "Investor");
        (await investorA.PutAsJsonAsync("/api/me/payout-account?ownerType=Investor", new { bankCode = "VCB", accountNo = "1000" + Random.Shared.Next(100000, 999999), accountHolderName = "Nhà đầu tư Chi A" })).EnsureSuccessStatusCode();
        (await investorB.PutAsJsonAsync("/api/me/payout-account?ownerType=Investor", new { bankCode = "ACB", accountNo = "2000" + Random.Shared.Next(100000, 999999), accountHolderName = "Nhà đầu tư Chi B" })).EnsureSuccessStatusCode();
        var (owner, _) = await UserAsync("Chủ hộ nuôi Chi", extraRole: Roles.OperatorMember, memberRole: "Owner");
        var ownerAccount = await owner.PutAsJsonAsync("/api/me/payout-account?ownerType=Operator", new { bankCode = "VCB", accountNo = "0123456789", accountHolderName = "HTX Test góp vốn" });
        Assert.True(ownerAccount.IsSuccessStatusCode || ownerAccount.StatusCode == HttpStatusCode.Conflict, await ownerAccount.Content.ReadAsStringAsync());
        var (batchId, code, accountId) = await HarvestedBatchAsync(150_000_000, 100_000_000, [(a, 60_000_000), (b, 40_000_000)]);
        var (admin, _) = await AdminAsync();
        var draft = await CalculateAsync(admin, code, taxPct: 5);
        (await admin.PostAsJsonAsync($"/api/admin/settlements/{draft.SettlementId}/propose", new { feedbackDays = 7 })).EnsureSuccessStatusCode();

        // Chưa hết hạn góp ý → chưa duyệt được
        var early = await admin.PostAsync($"/api/admin/settlements/{draft.SettlementId}/approve", null);
        Assert.Equal("settlement.window_open", await ErrorCode(early));

        // Demo: kết thúc hạn góp ý (chỉ Development), rồi duyệt
        (await admin.PostAsync($"/api/dev/settlements/{draft.SettlementId}/end-feedback-window", null)).EnsureSuccessStatusCode();
        var approved = await admin.PostAsync($"/api/admin/settlements/{draft.SettlementId}/approve", null);
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        var s = (await approved.Content.ReadFromJsonAsync<SettlementResponse>())!;
        Assert.Equal("Approved", s.Status);
        Assert.NotNull(s.ApprovedAt);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/settlements", new { taxWithholdingPct = 0 })).StatusCode);

        await using (var db = Fixture.OpenDb())
        {
            var instructions = await db.PaymentInstructions.Where(i => i.BatchAccountId == accountId).OrderBy(i => i.InstructionId).ToListAsync();
            Assert.Equal(["TaxPayment", "Payout", "Payout", "Payout"], instructions.Select(i => i.InstructionType));
            Assert.Equal(s.TaxTotal, instructions[0].Amount);
            Assert.Equal(s.OperatorRemuneration + s.DepreciationAmount, instructions[1].Amount);
            Assert.Equal(s.TotalNetPayout, instructions.Where(i => i.SettlementLineId != null).Sum(i => i.Amount));
            // Trigger BR-30: số liệu bảng đã duyệt không sửa được kể cả bằng SQL trực tiếp
            await Assert.ThrowsAnyAsync<Exception>(() => db.Settlements.Where(x => x.SettlementId == s.SettlementId)
                .ExecuteUpdateAsync(u => u.SetProperty(x => x.TaxTotal, 0)));
        }

        var paid = await admin.PostAsync($"/api/admin/settlements/{draft.SettlementId}/send-payouts", null);
        Assert.Equal(HttpStatusCode.OK, paid.StatusCode);
        var closed = (await paid.Content.ReadFromJsonAsync<SettlementResponse>())!;
        Assert.Equal("Closed", closed.Status);
        Assert.Equal("Closed", closed.BatchStatus);
        Assert.All(closed.Lines, l => Assert.Equal("Succeeded", l.PayoutStatus));
        // TL-08 §6.4: mã neo nhật ký ở mốc duyệt và đóng lô
        Assert.Equal(["Duyệt quyết toán", "Đóng lô"], closed.AuditAnchors.Select(x => x.Milestone));
        Assert.All(closed.AuditAnchors, x => Assert.Equal(64, x.RowHash.Length));

        await using var check = Fixture.OpenDb();
        var batch = await check.Batches.SingleAsync(x => x.BatchId == batchId);
        Assert.Equal("Closed", batch.Status);
        Assert.NotNull(batch.ClosedAt);
        Assert.Equal(4, await check.ProviderTransactions.CountAsync(t => t.BatchAccountId == accountId && t.Direction == "Out"));
        foreach (var action in new[] { "calculate", "propose", "approve", "paid_out", "close" })
            Assert.True(await check.AuditLogs.AnyAsync(x => x.EntityType == "settlement" && x.EntityId == s.SettlementId && x.ActionType == action), action);
        Assert.True(await check.AuditLogs.AnyAsync(x => x.EntityType == "batch" && x.EntityId == batchId && x.ActionType == "close"));
        // Nhà đầu tư xem bảng đã đóng, đúng dòng của mình đã chi
        var mine = (await investorA.GetFromJsonAsync<SettlementResponse>($"/api/settlements/{s.SettlementId}"))!;
        Assert.Equal("Succeeded", Assert.Single(mine.Lines).PayoutStatus);
    }

    [Fact]
    public async Task Open_feedback_blocks_approval()
    {
        var (investor, a) = await UserAsync("Nhà đầu tư góp ý", "Investor");
        var (_, code, _) = await HarvestedBatchAsync(120_000_000, 100_000_000, [(a, 50_000_000)]);
        var (admin, _) = await AdminAsync();
        var draft = await CalculateAsync(admin, code);
        Assert.Equal("settlement.not_proposed", await ErrorCode(await admin.PostAsync($"/api/admin/settlements/{draft.SettlementId}/approve", null)));
        (await admin.PostAsJsonAsync($"/api/admin/settlements/{draft.SettlementId}/propose", new { feedbackDays = 7 })).EnsureSuccessStatusCode();
        (await investor.PostAsJsonAsync($"/api/settlements/{draft.SettlementId}/feedback", new { content = "Tôi cần xem chứng từ chi phí thức ăn tháng 9." })).EnsureSuccessStatusCode();
        (await admin.PostAsync($"/api/dev/settlements/{draft.SettlementId}/end-feedback-window", null)).EnsureSuccessStatusCode();
        Assert.Equal("settlement.open_feedback", await ErrorCode(await admin.PostAsync($"/api/admin/settlements/{draft.SettlementId}/approve", null)));
    }
}

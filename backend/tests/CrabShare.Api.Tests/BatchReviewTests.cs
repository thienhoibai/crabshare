using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database")]
public class BatchReviewTests(OperatorDatabaseFixture fixture) : IClassFixture<OperatorDatabaseFixture>
{
    private async Task<(HttpClient Client, AuthResponse Auth)> User(bool admin = false, string role = "Customer")
    {
        var client = fixture.Factory.CreateClient();
        var email = $"vi05-{Guid.NewGuid():N}@test.local";
        (await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Test-password-123", fullName = "VI05", role })).EnsureSuccessStatusCode();
        if (admin)
        {
            await using var db = fixture.OpenDb();
            var id = await db.AppUsers.Where(u => u.Email == email).Select(u => u.UserId).SingleAsync();
            db.AppUserRoles.Add(new AppUserRole { UserId = id, RoleCode = Roles.PlatformAdmin });
            await db.SaveChangesAsync();
        }
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Test-password-123" });
        login.EnsureSuccessStatusCode();
        var auth = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }
    private static object Item(string category, int? tranche, decimal quantity = 1, long price = 1000) =>
        new { category, description = category, quantity, unit = "khoản", unitPrice = price, trancheNo = tranche };
    private static object Schedule(int number, int days = 30) => new
    {
        trancheNo = number,
        plannedDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(days)),
        unlockCondition = $"Điều kiện do hộ nuôi nhập {number}"
    };
    private static object Costs(bool complete = true) => new
    {
        items = new[] {
        Item("Seed", 1, 1.5m, 1001), Item("Feed", 2, 2, 2000), Item("Other", 2, 1, 500),
        Item("MortalityReserve", 1, 1, 9000), Item("Depreciation", null, 1, 7000) },
        tranches = complete ? new[] { Schedule(1), Schedule(2, 40) } : []
    };
    private static object Approval() => new { fundingOpenAt = DateTimeOffset.UtcNow.AddHours(1), fundingDeadline = DateTimeOffset.UtcNow.AddDays(10) };
    private async Task<(HttpClient Owner, string Code)> Draft(long target = 75_000_000, bool submit = true)
    {
        var (owner, _) = await User();
        var op = await owner.PostAsJsonAsync("/api/operators", new { legalName = "HTX VI05", taxCode = Random.Shared.NextInt64(1000000000, 9999999999).ToString(), businessRegNo = "VI05", farmAddress = "Cà Mau" });
        op.EnsureSuccessStatusCode();
        var opId = (await op.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operatorId").GetInt64();
        await using var db = fixture.OpenDb();
        await db.Operators.Where(o => o.OperatorId == opId).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "Approved"));
        var created = await owner.PostAsJsonAsync("/api/batches", new
        {
            title = "Lô VI05",
            crabType = "SoftShellCrab",
            seedQuantity = 1500,
            expectedOutputKg = 300,
            cycleDays = 45,
            restockCutoffDays = 10,
            minViableCapital = target,
            targetCapital = target,
            maxCapital = target,
            minContribution = 1_000_000,
            operatorSharePct = 7
        });
        created.EnsureSuccessStatusCode();
        var code = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("batchCode").GetString()!;
        (await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        if (submit) (await owner.PostAsync($"/api/batches/{code}/submit", null)).EnsureSuccessStatusCode();
        return (owner, code);
    }
    [Fact]
    public async Task Approval_locks_submitted_version_and_uses_user_schedule_excluding_reserve_and_depreciation()
    {
        var (owner, code) = await Draft(); var (admin, auth) = await User(true);
        var queue = await admin.GetFromJsonAsync<JsonElement>("/api/admin/batches?status=PendingApproval&pageSize=1");
        Assert.True(queue.GetProperty("total").GetInt32() > 0);
        var before = await admin.GetFromJsonAsync<JsonElement>($"/api/admin/batches/{code}");
        Assert.Equal("HTX VI05", before.GetProperty("operator").GetProperty("legalName").GetString());
        var request = new { fundingOpenAt = DateTimeOffset.UtcNow.AddHours(1), fundingDeadline = DateTimeOffset.UtcNow.AddDays(10) };
        var response = await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Funding", detail.GetProperty("batch").GetProperty("status").GetString());
        Assert.Equal("Locked", detail.GetProperty("batch").GetProperty("standardCost").GetProperty("status").GetString());
        await using var db = fixture.OpenDb();
        var batch = await db.Batches.SingleAsync(b => b.BatchCode == code);
        Assert.Equal(request.fundingOpenAt.ToUnixTimeSeconds(), batch.FundingOpenAt!.Value.ToUnixTimeSeconds());
        Assert.Equal(request.fundingDeadline.ToUnixTimeSeconds(), batch.FundingDeadline!.Value.ToUnixTimeSeconds());
        Assert.Equal(1_000_000, batch.PlatformFeeAmount);
        Assert.Equal("Open", (await db.BatchAccounts.SingleAsync(a => a.BatchId == batch.BatchId)).Status);
        var accountId=await db.BatchAccounts.Where(a=>a.BatchId==batch.BatchId).Select(a=>a.BatchAccountId).SingleAsync();
        Assert.Single(await db.AuditLogs.Where(a=>a.EntityType=="batch_account" && a.EntityId==accountId && a.ActionType=="create").ToListAsync());
        var cost = await db.StandardCostVersions.SingleAsync(v => v.BatchId == batch.BatchId);
        Assert.Equal(auth.User.UserId, cost.ApprovedBy); Assert.NotNull(cost.LockedAt); Assert.Equal(cost.LockedAt, cost.ApprovedAt);
        var tranches = await db.DisbursementTranches.Where(t => t.BatchId == batch.BatchId).OrderBy(t => t.TrancheNo).ToListAsync();
        Assert.Equal(new decimal[] { 1502, 4500 }, tranches.Select(t => t.PlannedAmount));
        Assert.All(tranches, t => { Assert.Equal("Planned", t.Status); Assert.Contains("hộ nuôi nhập", t.UnlockCondition); });
        Assert.Equal(DateOnly.FromDateTime(DateTime.UtcNow.AddDays(40)), tranches[1].PlannedDate);
        Assert.Single(await db.AuditLogs.Where(a => a.EntityType == "batch" && a.EntityId == batch.BatchId && a.ActionType == "approve").ToListAsync());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).StatusCode);
    }
    [Theory]
    [InlineData(49999999, 500000)]
    [InlineData(50000000, 1000000)]
    [InlineData(199999999, 1000000)]
    [InlineData(200000000, 1000000)]
    [InlineData(200000001, 2000000)]
    public async Task Fee_boundaries_follow_configured_inclusivity(long target, long expected)
    {
        var (_, code) = await Draft(target); var (admin, _) = await User(true);
        (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).EnsureSuccessStatusCode();
        await using var db = fixture.OpenDb();
        Assert.Equal(expected, await db.Batches.Where(b => b.BatchCode == code).Select(b => b.PlatformFeeAmount).SingleAsync());
    }
    [Fact]
    public async Task Reject_records_reason_and_audit_without_locking_or_generating_tranches()
    {
        var (owner, code) = await Draft(); var (admin, _) = await User(true);
        foreach (var reason in new[] { "", "   ", new string('x', 301) })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/reject", new { reason })).StatusCode);
        (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/reject", new { reason = "  Cần sửa lịch  " })).EnsureSuccessStatusCode();
        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/admin/batches/{code}");
        Assert.Equal("Cần sửa lịch", detail.GetProperty("rejectionReason").GetString());
        Assert.Equal("Cần sửa lịch",(await owner.GetFromJsonAsync<JsonElement>($"/api/batches/{code}")).GetProperty("rejectionReason").GetString());
        await using var db = fixture.OpenDb(); var batch = await db.Batches.SingleAsync(b => b.BatchCode == code);
        Assert.Equal("Rejected", batch.Status); Assert.Null(batch.FeeTierId); Assert.Null(batch.PlatformFeeAmount);
        Assert.False(await db.DisbursementTranches.AnyAsync(t => t.BatchId == batch.BatchId));
        Assert.Null((await db.StandardCostVersions.SingleAsync(v => v.BatchId == batch.BatchId)).LockedAt);
        var audit = await db.AuditLogs.SingleAsync(a => a.EntityType == "batch" && a.EntityId == batch.BatchId && a.ActionType == "reject");
        Assert.Equal("Cần sửa lịch", JsonDocument.Parse(audit.NewValue!).RootElement.GetProperty("rejectionReason").GetString());
        (await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        Assert.Equal(2, await db.StandardCostVersions.CountAsync(v => v.BatchId == batch.BatchId));
    }
    [Fact]
    public async Task Invalid_time_state_reserve_and_missing_schedule_never_partially_approve()
    {
        var (_, code) = await Draft(); var (admin, _) = await User(true);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", new { fundingOpenAt = DateTimeOffset.UtcNow.AddDays(2), fundingDeadline = DateTimeOffset.UtcNow.AddDays(1) })).StatusCode);
        await using var db = fixture.OpenDb();
        await db.StandardCostItems.Where(i => i.CostVersion.Batch.BatchCode == code && i.Category == "MortalityReserve").ExecuteUpdateAsync(s => s.SetProperty(i => i.Category, "Other"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).StatusCode);
        Assert.Equal("PendingApproval", await db.Batches.Where(b => b.BatchCode == code).Select(b => b.Status).SingleAsync());
        var (owner, draft) = await Draft(submit: false);
        (await owner.PutAsJsonAsync($"/api/batches/{draft}/standard-cost", Costs(false))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await owner.PostAsync($"/api/batches/{draft}/submit", null)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await admin.PostAsJsonAsync($"/api/admin/batches/{draft}/approve", Approval())).StatusCode);
    }
    [Fact]
    public async Task Unauthorized_and_revoked_admin_cannot_review()
    {
        var (owner, code) = await Draft();
        foreach (var path in new[] { "/api/admin/batches", $"/api/admin/batches/{code}" })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.Factory.CreateClient().GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync(path)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.PostAsJsonAsync($"/api/admin/batches/{code}/reject", new { reason = "No" })).StatusCode);
        var (admin, auth) = await User(true); await using var db = fixture.OpenDb();
        await db.AppUserRoles.Where(r => r.UserId == auth.User.UserId && r.RoleCode == Roles.PlatformAdmin).ExecuteDeleteAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).StatusCode);
    }
    [Fact]
    public async Task Concurrent_approval_succeeds_once_and_failure_after_save_rolls_everything_back()
    {
        var (_, code) = await Draft(); var (admin, auth) = await User(true);
        foreach (var interceptor in new SaveChangesInterceptor[] { new FailAfterSave(), new FailAfterAccountAudit() })
        await using (var failing = fixture.Factory.WithWebHostBuilder(b => b.ConfigureServices(s =>
            s.AddDbContext<AppDbContext>(o => o.AddInterceptors(interceptor)))))
        {
            using var client = failing.CreateClient(); client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
            Assert.Equal(HttpStatusCode.InternalServerError, (await client.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).StatusCode);
        }
        await using var db = fixture.OpenDb(); var id = await db.Batches.Where(b => b.BatchCode == code).Select(b => b.BatchId).SingleAsync();
        Assert.Equal("PendingApproval", await db.Batches.Where(b => b.BatchId == id).Select(b => b.Status).SingleAsync());
        Assert.Null(await db.Batches.Where(b => b.BatchId == id).Select(b => b.PlatformFeeAmount).SingleAsync());
        Assert.Equal("Submitted", await db.StandardCostVersions.Where(v => v.BatchId == id).Select(v => v.Status).SingleAsync());
        Assert.False(await db.DisbursementTranches.AnyAsync(t => t.BatchId == id));
        Assert.False(await db.BatchAccounts.AnyAsync(a => a.BatchId == id));
        Assert.False(await db.AuditLogs.AnyAsync(a => a.EntityId == id && a.EntityType == "batch" && a.ActionType == "approve"));
        var responses = await Task.WhenAll(admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval()), admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval()));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK); Assert.Single(responses, r => r.StatusCode == HttpStatusCode.UnprocessableEntity);
        Assert.Equal(2, await db.DisbursementTranches.CountAsync(t => t.BatchId == id));
        Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.EntityId == id && a.EntityType == "batch" && a.ActionType == "approve"));
    }
    private sealed class FailAfterSave : SaveChangesInterceptor
    {
        public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData e, int result, CancellationToken ct = default)
            => throw new InvalidOperationException("VI05 failure after SQL save");
    }
    private sealed class FailAfterAccountAudit : SaveChangesInterceptor
    {
        public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData e,int result,CancellationToken ct=default)
        {
            if (e.Context!.ChangeTracker.Entries<AuditLog>().Any(a=>a.Entity.EntityType=="batch_account"))
                throw new InvalidOperationException("VI05 failure after account and approval audits were saved");
            return ValueTask.FromResult(result);
        }
    }
    [Fact]
    public async Task Newly_approved_batch_accepts_reservation_and_sandbox_payment_request()
    {
        var (_, code) = await Draft(); var (admin, _) = await User(true);
        (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", new { fundingOpenAt = DateTimeOffset.UtcNow.AddMinutes(-1), fundingDeadline = DateTimeOffset.UtcNow.AddDays(10) })).EnsureSuccessStatusCode();
        var (investor, auth) = await User(role: "Investor");
        await using var db = fixture.OpenDb();
        await db.Investors.Where(i => i.UserId == auth.User.UserId).ExecuteUpdateAsync(s => s.SetProperty(i => i.VerificationStatus, "Verified"));
        var risk = await investor.GetFromJsonAsync<JsonElement>("/api/risk-disclosures/active");
        (await investor.PostAsJsonAsync("/api/risk-acknowledgements", new { riskDisclosureId = risk.GetProperty("riskDisclosureId").GetInt64(), scrolledToEnd = true })).EnsureSuccessStatusCode();
        var reservation = await investor.PostAsJsonAsync($"/api/batches/{code}/contributions", new { amount = 1000000 }); reservation.EnsureSuccessStatusCode();
        var id = (await reservation.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("contributionId").GetInt64();
        var payment = await investor.PostAsync($"/api/contributions/{id}/payment-requests", null);
        Assert.Equal(HttpStatusCode.Created, payment.StatusCode);
        var json = await payment.Content.ReadFromJsonAsync<JsonElement>(); Assert.Contains("SANDBOX", json.GetProperty("qrContent").GetString());
        Assert.Equal(1, await db.BatchAccounts.CountAsync(a => a.Batch.BatchCode == code && a.Status == "Open"));
    }
    [Fact]
    public async Task Zero_total_can_be_saved_but_cannot_be_submitted()
    {
        var (owner, code) = await Draft(submit: false);
        (await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", new { items = new[] { Item("MortalityReserve", 1, 1, 0) } })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await owner.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
    }
    [Fact]
    public async Task Total_cost_must_fit_settlement_decimal18_even_when_each_tranche_fits()
    {
        var (owner, code) = await Draft(submit: false);
        var res = await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", new
        {
            items = new[] {
            Item("Seed",1,1,500000000000000000),Item("Feed",2,1,500000000000000000),Item("MortalityReserve",1) },
            tranches = new[] { Schedule(1), Schedule(2) }
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("batch.cost_overflow", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }
    [Fact]
    public async Task Admin_can_configure_fee_amount_but_not_overlapping_ranges_and_existing_snapshot_does_not_change()
    {
        var (admin, _) = await User(true); var (_, code) = await Draft();
        var list = await admin.GetFromJsonAsync<JsonElement>("/api/admin/fee-tiers");
        var original = list.EnumerateArray().Single(t => t.GetProperty("tierCode").GetString() == "T2");
        var id = original.GetProperty("feeTierId").GetInt64();
        object Request(long amount, long max = 200000000) => new { tierCode = "T2", minCapital = 50000000, maxCapital = max, feeAmount = amount, minInclusive = true, maxInclusive = true, effectiveFrom = "2026-09-01", effectiveTo = (string?)null };
        try
        {
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await admin.PutAsJsonAsync($"/api/admin/fee-tiers/{id}", Request(777777, 300000000))).StatusCode);
            (await admin.PutAsJsonAsync($"/api/admin/fee-tiers/{id}", Request(777777))).EnsureSuccessStatusCode();
            (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).EnsureSuccessStatusCode();
            (await admin.PutAsJsonAsync($"/api/admin/fee-tiers/{id}", Request(888888))).EnsureSuccessStatusCode();
            await using var db = fixture.OpenDb();
            Assert.Equal(777777, await db.Batches.Where(b => b.BatchCode == code).Select(b => b.PlatformFeeAmount).SingleAsync());
            Assert.True(await db.AuditLogs.AnyAsync(a => a.EntityType == "fee_tier" && a.EntityId == id));
        }
        finally { (await admin.PutAsJsonAsync($"/api/admin/fee-tiers/{id}", Request(original.GetProperty("feeAmount").GetInt64()))).EnsureSuccessStatusCode(); }
    }
    [Fact]
    public async Task Missing_expired_or_overlapping_tier_is_an_atomic_business_error_and_configured_amount_is_used()
    {
        var (_, code) = await Draft(); var (admin, _) = await User(true);
        await using var db = fixture.OpenDb(); var tier = await db.FeeTiers.SingleAsync(t => t.TierCode == "T2");
        var oldFrom = tier.EffectiveFrom; var oldFee = tier.FeeAmount;
        try
        {
            tier.EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)); await db.SaveChangesAsync();
            var missing = await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval());
            Assert.Equal(HttpStatusCode.UnprocessableEntity, missing.StatusCode);
            Assert.Equal("batch.invalid_fee_tier", (await missing.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
            tier.EffectiveFrom = oldFrom; tier.FeeAmount = 123456; await db.SaveChangesAsync();
            var duplicate = new FeeTier { TierCode = "TEST-" + Guid.NewGuid().ToString("N")[..8], MinCapital = tier.MinCapital, MaxCapital = tier.MaxCapital, FeeAmount = 42, EffectiveFrom = oldFrom };
            db.FeeTiers.Add(duplicate); await db.SaveChangesAsync();
            try { Assert.Equal(HttpStatusCode.UnprocessableEntity, (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).StatusCode); }
            finally { db.FeeTiers.Remove(duplicate); await db.SaveChangesAsync(); }
            Assert.Equal("PendingApproval", await db.Batches.Where(b => b.BatchCode == code).Select(b => b.Status).SingleAsync());
            (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).EnsureSuccessStatusCode();
            Assert.Equal(123456, await db.Batches.Where(b => b.BatchCode == code).Select(b => b.PlatformFeeAmount).SingleAsync());
        }
        finally { tier.EffectiveFrom = oldFrom; tier.FeeAmount = oldFee; await db.SaveChangesAsync(); }
    }
    [Fact]
    public async Task Operator_schedule_is_persisted_replaced_and_checked_for_missing_duplicate_and_zero_tranches()
    {
        var (owner, code) = await Draft(submit: false);
        var read = await owner.GetFromJsonAsync<JsonElement>($"/api/batches/{code}");
        Assert.Equal(2, read.GetProperty("standardCost").GetProperty("tranches").GetArrayLength());
        (await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        var duplicate = await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", new { items = new[] { Item("Seed", 1), Item("MortalityReserve", 1) }, tranches = new[] { Schedule(1), Schedule(1) } });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, duplicate.StatusCode);
        (await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", new { items = new[] { Item("Seed", 0), Item("MortalityReserve", 1) }, tranches = Array.Empty<object>() })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await owner.PostAsync($"/api/batches/{code}/submit", null)).StatusCode);
        (await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost", Costs())).EnsureSuccessStatusCode();
        (await owner.PostAsync($"/api/batches/{code}/submit", null)).EnsureSuccessStatusCode();
    }
    [Fact]
    public async Task Sql_triggers_block_all_locked_writes_and_mixed_multirow_statements_but_allow_drafts()
    {
        var (owner, code) = await Draft(); var (_, other) = await Draft(submit: false); var (admin, _) = await User(true);
        (await admin.PostAsJsonAsync($"/api/admin/batches/{code}/approve", Approval())).EnsureSuccessStatusCode();
        await using var db = fixture.OpenDb();
        var locked = await db.StandardCostVersions.Where(v => v.Batch.BatchCode == code).Select(v => v.CostVersionId).SingleAsync();
        var draft = await db.StandardCostVersions.Where(v => v.Batch.BatchCode == other).Select(v => v.CostVersionId).SingleAsync();
        var batch = await db.Batches.Where(b => b.BatchCode == code).Select(b => b.BatchId).SingleAsync();
        await using var connection = new SqlConnection(fixture.ConnectionString); await connection.OpenAsync();
        var commands = new[] {
            $"INSERT dbo.standard_cost_item(cost_version_id,category,description,quantity,unit,unit_price,tranche_no) VALUES({locked},'Feed',N'x',1,N'x',1,1)",
            $"UPDATE dbo.standard_cost_item SET unit_price=2 WHERE cost_version_id={locked}",
            $"DELETE dbo.standard_cost_item WHERE cost_version_id={locked}",
            $"UPDATE dbo.standard_cost_item SET cost_version_id={draft} WHERE cost_version_id={locked}",
            $"UPDATE dbo.standard_cost_item SET cost_version_id={locked} WHERE cost_version_id={draft}",
            $"UPDATE dbo.standard_cost_version SET status='Draft',locked_at=NULL WHERE cost_version_id={locked}",
            $"UPDATE dbo.standard_cost_version SET version_no=2 WHERE cost_version_id={locked}",
            $"DELETE dbo.standard_cost_version WHERE cost_version_id={locked}",
            $"INSERT dbo.standard_cost_version(batch_id,version_no,status) VALUES({batch},2,'Draft')",
            $"UPDATE dbo.standard_cost_item SET description=N'mixed' WHERE cost_version_id IN ({draft},{locked})",
            $"INSERT dbo.standard_cost_item(cost_version_id,category,description,quantity,unit,unit_price,tranche_no) VALUES({draft},'Feed',N'multi',1,N'x',1,1),({locked},'Feed',N'multi',1,N'x',1,1)",
            $"DELETE dbo.standard_cost_item WHERE cost_version_id IN ({draft},{locked})",
            $"UPDATE dbo.standard_cost_version SET updated_at=SYSDATETIMEOFFSET() WHERE cost_version_id IN ({draft},{locked})",
            $"UPDATE dbo.standard_cost_version SET batch_id={batch},version_no=99 WHERE cost_version_id={draft}",
            $"UPDATE dbo.standard_cost_tranche_plan SET unlock_condition=N'changed' WHERE cost_version_id={locked}",
            $"DELETE dbo.standard_cost_tranche_plan WHERE cost_version_id={locked}",
            $"UPDATE dbo.standard_cost_tranche_plan SET unlock_condition=N'mixed' WHERE cost_version_id IN ({draft},{locked})",
            $"DELETE dbo.standard_cost_tranche_plan WHERE cost_version_id IN ({draft},{locked})",
            $"INSERT dbo.standard_cost_tranche_plan(cost_version_id,tranche_no,planned_date,unlock_condition) VALUES({locked},3,'2099-01-01',N'x')",
            $"UPDATE dbo.standard_cost_tranche_plan SET cost_version_id={locked},tranche_no=3 WHERE cost_version_id={draft} AND tranche_no=1",
            $"UPDATE dbo.standard_cost_tranche_plan SET cost_version_id={draft},tranche_no=3 WHERE cost_version_id={locked} AND tranche_no=1",
        };
        foreach (var sql in commands)
        {
            var error = await Assert.ThrowsAsync<SqlException>(() => new SqlCommand(sql, connection).ExecuteNonQueryAsync());
            Assert.Contains(error.Number, new[] { 51008, 547 }); // FK also prevents deleting a referenced locked version.
        }
        Assert.DoesNotContain(await db.StandardCostItems.Where(i => i.CostVersionId == draft).Select(i => i.Description).ToListAsync(), s => s == "mixed");
        Assert.Equal(5, await db.StandardCostItems.CountAsync(i => i.CostVersionId == locked));
        Assert.True(await new SqlCommand($"UPDATE dbo.standard_cost_item SET description=N'draft editable' WHERE cost_version_id={draft}", connection).ExecuteNonQueryAsync() > 0);
        await new SqlCommand($"UPDATE dbo.batch SET status='Draft' WHERE batch_id={batch}",connection).ExecuteNonQueryAsync();
        var bypass=await owner.PutAsJsonAsync($"/api/batches/{code}/standard-cost",Costs());
        Assert.Equal(HttpStatusCode.UnprocessableEntity,bypass.StatusCode);
        Assert.Equal("batch.cost_locked",(await bypass.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }
}

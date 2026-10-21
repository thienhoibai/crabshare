using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>
/// TH-07: job hết hạn giữ chỗ, chốt vốn hoặc huỷ lô + hoàn tiền. Gọi <see cref="FundingCloseService"/> trực tiếp (lịch nền tắt trong
/// TestBackgroundJobs); mỗi test tự tạo lô riêng. Hoàn thành khi: lô quá hạn gọi vốn chạy đúng cả hai nhánh đủ vốn / thiếu vốn.
/// </summary>
[Trait("Category", "Database")]
public class FundingCloseDatabaseTests(FundingDatabaseFixture fixture) : IClassFixture<FundingDatabaseFixture>
{
    private async Task<(HttpClient Client, long UserId)> UserAsync(string role = "Investor", bool admin = false)
    {
        var client = fixture.Factory.CreateClient();
        var email = $"th07-{Guid.NewGuid():N}@test.local";
        (await client.PostAsJsonAsync("/api/auth/register", new { email, password = "Test-password-123", fullName = "Nhà đầu tư TH-07", role }))
            .EnsureSuccessStatusCode();
        await using (var db = fixture.OpenDb())
        {
            var id = await db.AppUsers.Where(u => u.Email == email).Select(u => u.UserId).SingleAsync();
            if (admin)
            {
                db.AppUserRoles.Add(new AppUserRole { UserId = id, RoleCode = Roles.PlatformAdmin });
                await db.SaveChangesAsync();
            }
        }
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "Test-password-123" });
        login.EnsureSuccessStatusCode();
        var auth = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth.User.UserId);
    }

    /// <summary>Lô Funding có tài khoản lô; <paramref name="deadlineIn"/> âm = đã quá hạn gọi vốn.</summary>
    private async Task<(long BatchId, string Code, long AccountId)> BatchAsync(TimeSpan deadlineIn, long minViable = 5_000_000, long max = 10_000_000)
    {
        await using var db = fixture.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var code = $"TC-{Guid.NewGuid():N}"[..20];
        var batch = new Batch
        {
            BatchCode = code, OperatorId = fixture.OperatorId, CrabType = "FatteningMudCrab", Title = "Lô test chốt vốn",
            SeedQuantity = 100, ExpectedOutputKg = 40, CycleDays = 90, RestockCutoffDays = 15,
            MinViableCapital = minViable, TargetCapital = max, MaxCapital = max, MinContribution = 1_000_000,
            OperatorSharePct = 7, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15,
            Status = "Funding", FundingOpenAt = now.AddDays(-10), FundingDeadline = now + deadlineIn, CreatedAt = now, UpdatedAt = now,
            BatchAccount = new BatchAccount
            {
                ProviderName = "Sandbox", ProviderAccountNo = "SBX" + code[3..], Status = "Open", OpenedAt = now, CreatedAt = now, UpdatedAt = now,
            },
        };
        db.Batches.Add(batch);
        await db.SaveChangesAsync();
        return (batch.BatchId, code, batch.BatchAccount.BatchAccountId);
    }

    private async Task<long> ContributionAsync(long batchId, long investorId, long amount, string status, DateTimeOffset? expiresAt = null)
    {
        await using var db = fixture.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var contribution = new Contribution
        {
            BatchId = batchId, InvestorId = investorId, Amount = amount, Status = status,
            ReservedAt = now.AddHours(-2), ExpiresAt = expiresAt ?? now.AddHours(-1),
            ConfirmedAt = status == "Confirmed" ? now.AddHours(-1) : null, CreatedAt = now, UpdatedAt = now,
        };
        db.Contributions.Add(contribution);
        await db.SaveChangesAsync();
        return contribution.ContributionId;
    }

    private async Task<FundingCloseResult> RunJobAsync()
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<FundingCloseService>().RunAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Expired_reservation_and_its_pending_qr_become_expired()
    {
        var (batchId, _, accountId) = await BatchAsync(TimeSpan.FromDays(5));
        var (_, investor) = await UserAsync();
        var expired = await ContributionAsync(batchId, investor, 2_000_000, "Reserved", DateTimeOffset.UtcNow.AddMinutes(-1));
        var (_, other) = await UserAsync();
        var active = await ContributionAsync(batchId, other, 2_000_000, "Reserved", DateTimeOffset.UtcNow.AddMinutes(20));
        await using (var db = fixture.OpenDb())
        {
            db.PaymentRequests.Add(new PaymentRequest
            {
                ReferenceCode = "GV" + Guid.NewGuid().ToString("N")[..11].ToUpperInvariant(), BatchAccountId = accountId,
                Purpose = PaymentPurposes.Contribution, Amount = 2_000_000, ContributionId = expired,
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1), Status = "Pending", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var result = await RunJobAsync();

        Assert.True(result.ExpiredReservations >= 1);
        await using var check = fixture.OpenDb();
        Assert.Equal("Expired", (await check.Contributions.SingleAsync(c => c.ContributionId == expired)).Status);
        Assert.Equal("Reserved", (await check.Contributions.SingleAsync(c => c.ContributionId == active)).Status);
        Assert.Equal("Expired", (await check.PaymentRequests.SingleAsync(r => r.ContributionId == expired)).Status);
        Assert.True(await check.AuditLogs.AnyAsync(a => a.EntityType == "contribution" && a.EntityId == expired && a.ActionType == "expire"));
        // Lô chưa tới hạn, chưa đủ trần → không chốt
        Assert.Null((await check.Batches.SingleAsync(b => b.BatchId == batchId)).CapitalClosedAt);
    }

    [Fact]
    public async Task Deadline_with_enough_capital_snapshots_capital_shares()
    {
        var (batchId, code, _) = await BatchAsync(TimeSpan.FromMinutes(-5), minViable: 5_000_000);
        var (_, a) = await UserAsync();
        var (_, b) = await UserAsync();
        var (_, c) = await UserAsync();
        await ContributionAsync(batchId, a, 3_000_000, "Confirmed");
        await ContributionAsync(batchId, a, 1_000_000, "Confirmed"); // cùng người góp hai lần → gộp một dòng capital_share
        await ContributionAsync(batchId, b, 2_000_000, "Confirmed");
        var lateReservation = await ContributionAsync(batchId, c, 1_000_000, "Reserved", DateTimeOffset.UtcNow.AddMinutes(10));

        var result = await RunJobAsync();

        var outcome = Assert.Single(result.Batches, o => o.BatchCode == code);
        Assert.Equal(FundingCloseService.OutcomeCapitalClosed, outcome.Outcome);
        Assert.Equal(6_000_000, outcome.ConfirmedCapital);
        Assert.Equal(2, outcome.InvestorCount);
        await using var db = fixture.OpenDb();
        var batch = await db.Batches.SingleAsync(x => x.BatchId == batchId);
        Assert.Equal("Funding", batch.Status);
        Assert.NotNull(batch.CapitalClosedAt);
        Assert.Equal(6_000_000, batch.TotalConfirmedCapital);
        var shares = await db.CapitalShares.Where(s => s.BatchId == batchId).OrderBy(s => s.InvestorId).ToListAsync();
        Assert.Equal(2, shares.Count);
        Assert.Equal(4_000_000, shares.Single(s => s.InvestorId == a).ConfirmedAmount);
        Assert.Equal(2_000_000, shares.Single(s => s.InvestorId == b).ConfirmedAmount);
        Assert.Equal(batch.TotalConfirmedCapital, shares.Sum(s => s.ConfirmedAmount));
        // Giữ chỗ còn lại lúc chốt bị ép hết hạn
        Assert.Equal("Expired", (await db.Contributions.SingleAsync(x => x.ContributionId == lateReservation)).Status);
        Assert.True(await db.AuditLogs.AnyAsync(x => x.EntityType == "batch" && x.EntityId == batchId && x.ActionType == "close_capital"));
        Assert.False(await db.PaymentInstructions.AnyAsync(i => i.BatchAccount.BatchId == batchId));

        // Chạy lại không chụp thêm lần nữa (capital_share bất biến, BR-09)
        var again = await RunJobAsync();
        Assert.DoesNotContain(again.Batches, o => o.BatchCode == code);
    }

    [Fact]
    public async Task Deadline_below_min_viable_cancels_batch_and_refunds_every_confirmed_contribution()
    {
        var (batchId, code, accountId) = await BatchAsync(TimeSpan.FromMinutes(-5), minViable: 5_000_000);
        var (_, a) = await UserAsync();
        var (_, b) = await UserAsync();
        var first = await ContributionAsync(batchId, a, 2_000_000, "Confirmed");
        var second = await ContributionAsync(batchId, b, 1_500_000, "Confirmed");
        await using (var db = fixture.OpenDb())
        {
            db.PaymentRequests.Add(new PaymentRequest
            {
                ReferenceCode = "GV" + Guid.NewGuid().ToString("N")[..11].ToUpperInvariant(), BatchAccountId = accountId,
                Purpose = PaymentPurposes.Contribution, Amount = 1_000_000, ContributionId = second,
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30), Status = "Pending", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var result = await RunJobAsync();

        var outcome = Assert.Single(result.Batches, o => o.BatchCode == code);
        Assert.Equal(FundingCloseService.OutcomeCancelled, outcome.Outcome);
        Assert.Equal(2, outcome.RefundCount);
        await using var check = fixture.OpenDb();
        var batch = await check.Batches.SingleAsync(x => x.BatchId == batchId);
        Assert.Equal("Cancelled", batch.Status);
        Assert.Null(batch.CapitalClosedAt);
        Assert.False(await check.CapitalShares.AnyAsync(s => s.BatchId == batchId));
        var refunds = await check.PaymentInstructions.Where(i => i.BatchAccountId == accountId).OrderBy(i => i.ContributionId).ToListAsync();
        Assert.Equal(2, refunds.Count);
        Assert.All(refunds, r => { Assert.Equal("Refund", r.InstructionType); Assert.Equal("Created", r.Status); });
        Assert.Equal(2_000_000, refunds.Single(r => r.ContributionId == first).Amount);
        Assert.Equal(1_500_000, refunds.Single(r => r.ContributionId == second).Amount);
        Assert.Equal("Cancelled", (await check.PaymentRequests.SingleAsync(r => r.ContributionId == second)).Status);
        Assert.True(await check.AuditLogs.AnyAsync(x => x.EntityType == "batch" && x.EntityId == batchId && x.ActionType == "cancel_underfunded"));

        // Chạy lại không lập lệnh hoàn trùng
        await RunJobAsync();
        await using var again = fixture.OpenDb();
        Assert.Equal(2, await again.PaymentInstructions.CountAsync(i => i.BatchAccountId == accountId));
    }

    [Fact]
    public async Task Reaching_max_capital_closes_funding_early_and_stops_new_reservations()
    {
        var (batchId, code, _) = await BatchAsync(TimeSpan.FromDays(3), minViable: 2_000_000, max: 4_000_000);
        var (_, a) = await UserAsync();
        await ContributionAsync(batchId, a, 4_000_000, "Confirmed");

        var result = await RunJobAsync();

        Assert.Equal(FundingCloseService.OutcomeCapitalClosed, Assert.Single(result.Batches, o => o.BatchCode == code).Outcome);
        var (client, investor) = await UserAsync();
        await using (var db = fixture.OpenDb())
        {
            Assert.NotNull((await db.Batches.SingleAsync(b => b.BatchId == batchId)).CapitalClosedAt);
            await db.Investors.Where(i => i.UserId == investor).ExecuteUpdateAsync(s => s
                .SetProperty(i => i.VerificationStatus, "Verified").SetProperty(i => i.VerifiedAt, DateTimeOffset.UtcNow));
        }
        var rd = (await client.GetFromJsonAsync<RiskDisclosureResponse>("/api/risk-disclosures/active"))!;
        (await client.PostAsJsonAsync("/api/risk-acknowledgements", new { rd.RiskDisclosureId, scrolledToEnd = true })).EnsureSuccessStatusCode();
        var reserve = await client.PostAsJsonAsync($"/api/batches/{code}/contributions", new { amount = 1_000_000 });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, reserve.StatusCode);
    }

    [Fact]
    public async Task Admin_sees_funding_table_and_refund_instructions()
    {
        var (batchId, code, _) = await BatchAsync(TimeSpan.FromMinutes(-5), minViable: 5_000_000);
        var (_, a) = await UserAsync();
        await ContributionAsync(batchId, a, 1_000_000, "Confirmed");
        var (admin, _) = await UserAsync("Customer", admin: true);

        var closed = await admin.PostAsync("/api/admin/funding/close-due", null);
        Assert.Equal(HttpStatusCode.OK, closed.StatusCode);

        var batches = (await admin.GetFromJsonAsync<List<AdminFundingBatch>>("/api/admin/funding/batches"))!;
        var row = Assert.Single(batches, b => b.BatchCode == code);
        Assert.Equal("Cancelled", row.Stage);
        Assert.Equal(1, row.RefundCount);
        Assert.Equal(1, row.RefundOpenCount);

        var refunds = (await admin.GetFromJsonAsync<List<PaymentInstructionResponse>>($"/api/admin/payment-instructions?type=Refund&batchCode={code}"))!;
        var refund = Assert.Single(refunds);
        Assert.Equal(1_000_000, refund.Amount);
        Assert.Equal("Nhà đầu tư TH-07", refund.Beneficiary);

        var (investor, _) = await UserAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await investor.GetAsync("/api/admin/funding/batches")).StatusCode);
    }
}

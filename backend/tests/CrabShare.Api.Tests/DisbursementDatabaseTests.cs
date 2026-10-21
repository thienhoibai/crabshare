using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

/// <summary>
/// TH-10: giải ngân theo mốc (TL-03) + gửi lệnh chi + đối soát. Hoàn thành khi: xin → duyệt → gửi lệnh → Succeeded;
/// giao dịch không khớp hiện trong danh sách đối soát.
/// </summary>
[Trait("Category", "Database")]
public class DisbursementDatabaseTests(FundingDatabaseFixture fixture) : IClassFixture<FundingDatabaseFixture>
{
    private const string Password = "Test-password-123";

    private async Task<(HttpClient Client, long UserId)> UserAsync(string fullName, string? extraRole = null, string? memberRole = null)
    {
        var email = $"th10-{Guid.NewGuid():N}@test.local";
        var anon = fixture.Factory.CreateClient();
        (await anon.PostAsJsonAsync("/api/auth/register", new { email, password = Password, fullName, role = "Customer" })).EnsureSuccessStatusCode();
        await using (var db = fixture.OpenDb())
        {
            var userId = await db.AppUsers.Where(u => u.Email == email).Select(u => u.UserId).SingleAsync();
            var now = DateTimeOffset.UtcNow;
            if (extraRole is not null) db.AppUserRoles.Add(new AppUserRole { UserId = userId, RoleCode = extraRole, GrantedAt = now, CreatedAt = now });
            if (memberRole is not null)
                db.OperatorMembers.Add(new OperatorMember { UserId = userId, OperatorId = fixture.OperatorId, MemberRole = memberRole, JoinedAt = now, CreatedAt = now });
            await db.SaveChangesAsync();
        }
        var client = fixture.Factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        login.EnsureSuccessStatusCode();
        var auth = (await login.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth.User.UserId);
    }

    private Task<(HttpClient Client, long UserId)> OwnerAsync() => UserAsync("Chủ hộ nuôi TH-10", Roles.OperatorMember, "Owner");

    /// <summary>
    /// Lô đã chốt đủ vốn, mọi hợp đồng đủ chữ ký, ba đợt giải ngân đã tới ngày; <paramref name="stocked"/> = đã thả giống.
    /// </summary>
    private async Task<(long BatchId, string Code, long AccountId)> ReadyBatchAsync(bool stocked = false)
    {
        var (_, investorId) = await UserAsync("Nhà đầu tư TH-10", Roles.Investor);
        await using var db = fixture.OpenDb();
        if (!await db.Investors.AnyAsync(i => i.UserId == investorId))
        {
            db.Investors.Add(new Investor { UserId = investorId, InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = DateTimeOffset.UtcNow, CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        var now = DateTimeOffset.UtcNow;
        var code = $"TD-{Guid.NewGuid():N}"[..20];
        var template = await db.ContractTemplates.FirstAsync(t => t.Status == "Active");
        var batch = new Batch
        {
            BatchCode = code, OperatorId = fixture.OperatorId, CrabType = "FatteningMudCrab", Title = "Lô test giải ngân",
            SeedQuantity = 100, ExpectedOutputKg = 40, CycleDays = 90, RestockCutoffDays = 15,
            MinViableCapital = 5_000_000, TargetCapital = 10_000_000, MaxCapital = 10_000_000, MinContribution = 1_000_000,
            OperatorSharePct = 7, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15,
            Status = stocked ? "InProduction" : "Funding", FundingOpenAt = now.AddDays(-20), FundingDeadline = now.AddDays(-10),
            CapitalClosedAt = now.AddDays(-10), TotalConfirmedCapital = 6_000_000, StockedAt = stocked ? now.AddDays(-5) : null,
            CreatedAt = now, UpdatedAt = now,
            BatchAccount = new BatchAccount { ProviderName = "Sandbox", ProviderAccountNo = "SBX" + code[3..], Status = "Open", OpenedAt = now, CreatedAt = now, UpdatedAt = now },
        };
        var contribution = new Contribution
        {
            InvestorId = investorId, Amount = 6_000_000, Status = "Confirmed", ReservedAt = now.AddDays(-15), ExpiresAt = now.AddDays(-15).AddMinutes(30),
            ConfirmedAt = now.AddDays(-15), CreatedAt = now, UpdatedAt = now,
            InvestmentContract = new InvestmentContract
            {
                ContractNo = "HD-T-" + Guid.NewGuid().ToString("N")[..12], TemplateId = template.TemplateId, Status = "FullySigned",
                SigningMethod = "DigitalSignature", DraftHash = new string('a', 64), FinalHash = new string('b', 64), FullySignedAt = now.AddDays(-9),
                CreatedAt = now, UpdatedAt = now,
            },
        };
        batch.Contributions.Add(contribution);
        var yesterday = DateOnly.FromDateTime(now.AddDays(-1).UtcDateTime);
        foreach (var (no, amount) in new[] { ((byte)1, 3_000_000m), ((byte)2, 2_000_000m), ((byte)3, 1_000_000m) })
            batch.DisbursementTranches.Add(new DisbursementTranche
            {
                TrancheNo = no, PlannedAmount = amount, PlannedDate = yesterday, UnlockCondition = $"Điều kiện đợt {no}",
                Status = "Planned", CreatedAt = now, UpdatedAt = now,
            });
        db.Batches.Add(batch);
        await db.SaveChangesAsync();
        return (batch.BatchId, code, batch.BatchAccount.BatchAccountId);
    }

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private static async Task<TrancheResponse> TrancheOf(HttpClient owner, string code, int no)
        => (await owner.GetFromJsonAsync<List<TrancheResponse>>("/api/operator/tranches"))!.Single(t => t.BatchCode == code && t.TrancheNo == no);

    [Fact]
    public async Task Tranche_request_release_and_send_reaches_succeeded_with_an_outgoing_transaction()
    {
        var (batchId, code, accountId) = await ReadyBatchAsync();
        var (owner, _) = await OwnerAsync();
        (await owner.PutAsJsonAsync("/api/me/payout-account?ownerType=Operator",
            new { bankCode = "VCB", accountNo = "0123456789", accountHolderName = "HTX Test góp vốn" })).EnsureSuccessStatusCode();
        var (admin, _) = await UserAsync("Admin TH-10", Roles.PlatformAdmin);
        var (staff, _) = await UserAsync("Nhân viên TH-10", Roles.OperatorMember, "Staff");

        var first = await TrancheOf(owner, code, 1);
        Assert.True(first.CanRequest);
        Assert.Equal("Đợt 1 chưa được giải ngân.", (await TrancheOf(owner, code, 2)).BlockedReason);

        var staffRequest = await staff.PostAsync($"/api/batches/{code}/tranches/1/request", null);
        Assert.Equal(HttpStatusCode.Forbidden, staffRequest.StatusCode);
        Assert.Equal("tranche.owner_only", await ErrorCode(staffRequest));

        var requested = (await (await owner.PostAsync($"/api/batches/{code}/tranches/1/request", null)).Content.ReadFromJsonAsync<TrancheResponse>())!;
        Assert.Equal("Requested", requested.Status);
        Assert.Contains((await admin.GetFromJsonAsync<List<TrancheResponse>>("/api/admin/tranches"))!, t => t.TrancheId == requested.TrancheId);

        var released = await admin.PostAsync($"/api/admin/tranches/{requested.TrancheId}/release", null);
        Assert.Equal(HttpStatusCode.OK, released.StatusCode);
        var afterRelease = (await released.Content.ReadFromJsonAsync<TrancheResponse>())!;
        Assert.Equal("Released", afterRelease.Status);
        Assert.Equal("Created", afterRelease.InstructionStatus);

        var sent = await admin.PostAsync($"/api/admin/payment-instructions/{afterRelease.InstructionId}/send", null);
        Assert.Equal(HttpStatusCode.OK, sent.StatusCode);
        var instruction = (await sent.Content.ReadFromJsonAsync<PaymentInstructionResponse>())!;
        Assert.Equal("Succeeded", instruction.Status);
        Assert.Equal("Disbursement", instruction.Type);
        Assert.Equal(3_000_000, instruction.Amount);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"/api/admin/payment-instructions/{afterRelease.InstructionId}/send", null)).StatusCode);

        await using var db = fixture.OpenDb();
        var outgoing = await db.ProviderTransactions.SingleAsync(t => t.InstructionId == afterRelease.InstructionId);
        Assert.Equal("Out", outgoing.Direction);
        Assert.Equal(accountId, outgoing.BatchAccountId);
        foreach (var action in new[] { "request", "release" })
            Assert.True(await db.AuditLogs.AnyAsync(a => a.EntityType == "disbursement_tranche" && a.EntityId == requested.TrancheId && a.ActionType == action));
        Assert.True(await db.AuditLogs.AnyAsync(a => a.EntityType == "payment_instruction" && a.EntityId == afterRelease.InstructionId && a.ActionType == "send"));

        // Đợt 2 cần bằng chứng thả giống: lô chưa thả giống → 422
        var second = await owner.PostAsync($"/api/batches/{code}/tranches/2/request", null);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, second.StatusCode);
        Assert.Equal("tranche.not_eligible", await ErrorCode(second));
        Assert.True(batchId > 0);
    }

    [Fact]
    public async Task Later_tranches_need_evidence_and_admin_can_ask_for_explanation_or_block()
    {
        var (batchId, code, _) = await ReadyBatchAsync(stocked: true);
        var (owner, _) = await OwnerAsync();
        var (admin, _) = await UserAsync("Admin TH-10", Roles.PlatformAdmin);
        await using (var db = fixture.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            await db.DisbursementTranches.Where(t => t.BatchId == batchId && t.TrancheNo == 1)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.Status, "Released").SetProperty(t => t.ReleasedAt, now.AddDays(-4)));
        }
        Assert.Equal("Chưa có bằng chứng nuôi đạt yêu cầu kể từ đợt trước.", (await TrancheOf(owner, code, 2)).BlockedReason);

        await using (var db = fixture.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            db.Evidences.Add(new Evidence
            {
                BatchId = batchId, MediaType = "Photo", FileUri = "test/ev.jpg", Sha256 = new string('c', 64), CapturedAt = now.AddDays(-1),
                ReceivedAt = now.AddDays(-1), Source = "InAppCapture", ReviewStatus = "Accepted", CreatedAt = now,
            });
            await db.SaveChangesAsync();
        }
        var second = await TrancheOf(owner, code, 2);
        Assert.True(second.CanRequest, second.BlockedReason);
        Assert.Equal("Đợt 2 chưa được giải ngân.", (await TrancheOf(owner, code, 3)).BlockedReason);

        (await owner.PostAsync($"/api/batches/{code}/tranches/2/request", null)).EnsureSuccessStatusCode();
        var explain = await admin.PostAsJsonAsync($"/api/admin/tranches/{second.TrancheId}/need-explanation", new { reason = "Bổ sung ảnh hộp nuôi tuần này" });
        var needs = (await explain.Content.ReadFromJsonAsync<TrancheResponse>())!;
        Assert.Equal("NeedsExplanation", needs.Status);
        Assert.NotNull(needs.ExplanationDeadline);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/admin/tranches/{second.TrancheId}/block", new { reason = "" })).StatusCode);

        // Người nuôi bổ sung rồi xin lại; admin dừng chi
        (await owner.PostAsync($"/api/batches/{code}/tranches/2/request", null)).EnsureSuccessStatusCode();
        var blocked = (await (await admin.PostAsJsonAsync($"/api/admin/tranches/{second.TrancheId}/block", new { reason = "Không giải trình được" }))
            .Content.ReadFromJsonAsync<TrancheResponse>())!;
        Assert.Equal("Blocked", blocked.Status);
        var again = await owner.PostAsync($"/api/batches/{code}/tranches/2/request", null);
        Assert.Equal("tranche.not_eligible", await ErrorCode(again));
    }

    [Fact]
    public async Task Unmatched_transactions_are_listed_and_cancelled_batch_refund_marks_contribution_refunded()
    {
        var (batchId, code, accountId) = await ReadyBatchAsync();
        var (admin, _) = await UserAsync("Admin TH-10", Roles.PlatformAdmin);
        long refundId, contributionId;
        await using (var db = fixture.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            db.ProviderTransactions.Add(new ProviderTransaction
            {
                ProviderTxnId = "BANK-" + Guid.NewGuid().ToString("N")[..12], BatchAccountId = accountId, Direction = "In", Amount = 123_000,
                ReferenceCode = "chuyen tien khong ghi ma", MatchStatus = "Unmatched", OccurredAt = now, ReceivedAt = now,
            });
            // Lô huỷ vì thiếu vốn (TH-07) đã lập lệnh hoàn cho khoản góp
            await db.Batches.Where(b => b.BatchId == batchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "Cancelled"));
            contributionId = await db.Contributions.Where(c => c.BatchId == batchId).Select(c => c.ContributionId).SingleAsync();
            var refund = new PaymentInstruction
            {
                BatchAccountId = accountId, InstructionType = "Refund", Amount = 6_000_000, ContributionId = contributionId,
                Status = "Created", BeneficiaryNote = "Hoàn 100% vốn góp", CreatedAt = now, UpdatedAt = now,
            };
            db.PaymentInstructions.Add(refund);
            await db.SaveChangesAsync();
            refundId = refund.InstructionId;
        }

        var unmatched = (await admin.GetFromJsonAsync<List<UnmatchedTransactionResponse>>("/api/admin/payments/unmatched"))!;
        Assert.Contains(unmatched, t => t.BatchCode == code && t.Amount == 123_000 && t.MatchStatus == "Unmatched");

        var sent = (await (await admin.PostAsync($"/api/admin/payment-instructions/{refundId}/send", null)).Content.ReadFromJsonAsync<PaymentInstructionResponse>())!;
        Assert.Equal("Succeeded", sent.Status);
        await using var check = fixture.OpenDb();
        var contribution = await check.Contributions.SingleAsync(c => c.ContributionId == contributionId);
        Assert.Equal("Refunded", contribution.Status);
        Assert.NotNull(contribution.RefundedAt);
    }
}

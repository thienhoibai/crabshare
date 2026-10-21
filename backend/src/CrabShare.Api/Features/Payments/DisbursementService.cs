using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// UC18 giải ngân theo mốc (TH-10, TL-03 §6.2): chủ hộ nuôi xin đợt <c>no</c> khi điều kiện mốc đạt; admin duyệt → lệnh chi
/// <c>Disbursement</c> tới tài khoản nhận tiền của hộ nuôi, hoặc yêu cầu giải trình (72 giờ), hoặc dừng chi.
/// Điều kiện mốc:
/// - đợt 1: lô đã chốt đủ vốn và mọi hợp đồng đủ chữ ký (<c>Batches/FundingReadiness</c>), không cần bằng chứng nuôi;
/// - đợt 2 trở đi: đợt trước đã giải ngân, lô đã thả giống, có bằng chứng nuôi đạt (Accepted/Watch) kể từ đợt trước và không còn
///   bằng chứng bị gắn cờ chờ thẩm định;
/// - đợt 3 trở đi: thêm kế hoạch thu hoạch đã khai (expected_harvest_date);
/// - mọi đợt: đã tới ngày dự kiến của đợt.
/// </summary>
public sealed class DisbursementService(AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock)
{
    public const int ExplanationHours = 72;
    private static readonly TimeSpan Vietnam = TimeSpan.FromHours(7);
    private static readonly string[] DisbursableBatchStatuses = ["Funding", "Stocked", "InProduction", "Harvesting"];

    // ---------- Người nuôi ----------

    /// <summary>Các đợt giải ngân của lô thuộc hộ nuôi của tôi, kèm lý do chưa xin được.</summary>
    public async Task<IReadOnlyList<TrancheResponse>> ListForOperatorAsync(CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var batches = await LoadAsync(db.Batches.Where(b => b.OperatorId == operatorId), ct);
        return await DescribeAsync(batches, null, ct);
    }

    /// <summary>Chủ hộ nuôi xin giải ngân đợt <paramref name="trancheNo"/>; điều kiện chưa đạt → 422 tranche.not_eligible kèm lý do.</summary>
    public Task<TrancheResponse> RequestAsync(string batchCode, byte trancheNo, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var operatorId = me.RequireOperatorId();
        if (!await db.OperatorMembers.AnyAsync(m => m.UserId == me.UserId && m.OperatorId == operatorId && m.MemberRole == "Owner", ct))
            throw new ForbiddenException("tranche.owner_only", "Chỉ chủ hộ nuôi mới xin giải ngân được.");
        var batch = (await LoadAsync(db.Batches.Where(b => b.BatchCode == batchCode && b.OperatorId == operatorId), ct)).SingleOrDefault()
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô của hộ nuôi bạn.");
        var tranche = batch.DisbursementTranches.SingleOrDefault(t => t.TrancheNo == trancheNo)
                      ?? throw new NotFoundException("tranche.not_found", $"Lô {batchCode} không có đợt giải ngân {trancheNo}.");
        var now = Now();
        if (await GateAsync(batch, tranche, now, ct) is { } reason)
            throw new BusinessRuleException("tranche.not_eligible", reason);

        var before = new { tranche.Status };
        tranche.Status = "Requested";
        tranche.RequestedAt = now;
        tranche.ExplanationDeadline = null;
        tranche.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("disbursement_tranche", tranche.TrancheId, "request", before,
            new { tranche.Status, batch.BatchCode, tranche.TrancheNo, plannedAmount = (long)tranche.PlannedAmount, requestedAt = now }, now, ct);
        return (await DescribeAsync([batch], null, ct)).Single(t => t.TrancheId == tranche.TrancheId);
    }, ct);

    // ---------- Admin ----------

    /// <summary>Đợt giải ngân cho admin, mặc định các đợt đang chờ xử lý (Requested, NeedsExplanation).</summary>
    public async Task<IReadOnlyList<TrancheResponse>> ListForAdminAsync(string? status, CancellationToken ct)
    {
        string[] statuses = string.IsNullOrWhiteSpace(status) ? ["Requested", "NeedsExplanation"] : [status];
        var batches = await LoadAsync(db.Batches.Where(b => b.DisbursementTranches.Any(t => statuses.Contains(t.Status))), ct);
        return await DescribeAsync(batches, statuses, ct);
    }

    /// <summary>Duyệt chi: đợt Requested → Released, lập lệnh chi Disbursement (Created) tới tài khoản nhận tiền đang dùng của hộ nuôi.</summary>
    public Task<TrancheResponse> ReleaseAsync(long trancheId, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct);
        var (batch, tranche) = await LoadTrancheAsync(trancheId, ct);
        if (tranche.Status != "Requested")
            throw new BusinessRuleException("tranche.not_requested", "Chỉ duyệt được đợt người nuôi đang xin giải ngân.");
        var now = Now();
        // Điều kiện mốc có thể đã đổi từ lúc xin (ví dụ bằng chứng mới bị gắn cờ): kiểm tra lại, bỏ qua bước "đang Requested"
        if (await GateAsync(batch, tranche, now, ct, ignoreStatus: true) is { } reason)
            throw new BusinessRuleException("tranche.not_eligible", reason);
        if (batch.BatchAccount is not { Status: "Open" } account)
            throw new BusinessRuleException("payment.batch_account_unavailable", $"Tài khoản chuyên dùng của lô {batch.BatchCode} không ở trạng thái mở.");
        var payout = await db.PayoutAccounts.AsNoTracking()
            .Where(p => p.OwnerOperatorId == batch.OperatorId && p.Status == "Active")
            .OrderByDescending(p => p.PayoutAccountId)
            .FirstOrDefaultAsync(ct)
            ?? throw new BusinessRuleException("payment.no_payout_account", "Hộ nuôi chưa có tài khoản nhận tiền đang dùng.");

        var instruction = new PaymentInstruction
        {
            BatchAccountId = account.BatchAccountId, InstructionType = "Disbursement", Amount = tranche.PlannedAmount,
            PayoutAccountId = payout.PayoutAccountId, TrancheId = tranche.TrancheId, Status = "Created",
            BeneficiaryNote = $"Giải ngân đợt {tranche.TrancheNo} lô {batch.BatchCode}", CreatedAt = now, UpdatedAt = now,
        };
        db.PaymentInstructions.Add(instruction);
        tranche.Status = "Released";
        tranche.ReleasedAt = now;
        tranche.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("disbursement_tranche", tranche.TrancheId, "release", new { status = "Requested" },
            new { tranche.Status, batch.BatchCode, tranche.TrancheNo, releasedAt = now, instruction.InstructionId }, now, ct);
        await audit.WriteAsync("payment_instruction", instruction.InstructionId, "create", null,
            new { type = "Disbursement", amount = (long)instruction.Amount, tranche.TrancheId, payout.PayoutAccountId }, now, ct);
        return (await DescribeAsync([batch], null, ct)).Single(t => t.TrancheId == tranche.TrancheId);
    }, ct);

    /// <summary>Yêu cầu giải trình (TL-03 §6.4): Requested → NeedsExplanation, hạn 72 giờ. Người nuôi xin lại sau khi bổ sung.</summary>
    public Task<TrancheResponse> RequestExplanationAsync(long trancheId, string reason, CancellationToken ct)
        => DecideAsync(trancheId, ["Requested"], "NeedsExplanation", "need_explanation", reason, ct);

    /// <summary>Dừng chi đợt này (TL-03 §6.4, không giải trình được).</summary>
    public Task<TrancheResponse> BlockAsync(long trancheId, string reason, CancellationToken ct)
        => DecideAsync(trancheId, ["Requested", "NeedsExplanation"], "Blocked", "block", reason, ct);

    private Task<TrancheResponse> DecideAsync(long trancheId, string[] from, string to, string action, string reason, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (batch, tranche) = await LoadTrancheAsync(trancheId, ct);
            if (!from.Contains(tranche.Status))
                throw new BusinessRuleException("tranche.invalid_transition", $"Đợt đang ở trạng thái {tranche.Status}, không chuyển sang {to} được.");
            var now = Now();
            var before = new { tranche.Status };
            tranche.Status = to;
            tranche.ExplanationDeadline = to == "NeedsExplanation" ? now.AddHours(ExplanationHours) : tranche.ExplanationDeadline;
            tranche.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("disbursement_tranche", tranche.TrancheId, action, before,
                new { tranche.Status, batch.BatchCode, tranche.TrancheNo, reason = reason.Trim(), tranche.ExplanationDeadline }, now, ct);
            return (await DescribeAsync([batch], null, ct)).Single(t => t.TrancheId == tranche.TrancheId);
        }, ct);

    // ---------- Điều kiện mốc ----------

    /// <summary>Lý do đợt chưa xin / chưa duyệt được; null khi đạt.</summary>
    private async Task<string?> GateAsync(Batch batch, DisbursementTranche tranche, DateTimeOffset now, CancellationToken ct, bool ignoreStatus = false)
    {
        if (!ignoreStatus && tranche.Status is not ("Planned" or "NeedsExplanation"))
            return tranche.Status switch
            {
                "Requested" => "Đợt này đang chờ quản trị viên duyệt.",
                "Released" => "Đợt này đã được giải ngân.",
                "Blocked" => "Đợt này đã bị dừng chi.",
                _ => $"Đợt đang ở trạng thái {tranche.Status}.",
            };
        if (!DisbursableBatchStatuses.Contains(batch.Status))
            return "Lô không còn ở giai đoạn giải ngân.";
        var previous = batch.DisbursementTranches.SingleOrDefault(t => t.TrancheNo == tranche.TrancheNo - 1);
        if (previous is not null && previous.Status != "Released")
            return $"Đợt {previous.TrancheNo} chưa được giải ngân.";
        if (tranche.PlannedDate is not { } planned)
            return "Chưa xác định ngày giải ngân (chờ mốc thực tế của lô).";
        if (planned > DateOnly.FromDateTime(now.ToOffset(Vietnam).DateTime))
            return $"Chưa tới ngày dự kiến {planned:dd/MM/yyyy}.";
        if (tranche.TrancheNo == 1)
            return FundingReadiness.ReadyAt(batch) is { } ready && ready <= now
                ? null
                : "Lô chưa chốt đủ vốn hoặc còn hợp đồng chưa đủ hai chữ ký.";

        if (batch.StockedAt is null)
            return "Chưa có bằng chứng thả giống (lô chưa ghi nhận thả giống).";
        var since = previous?.ReleasedAt ?? batch.StockedAt;
        var evidence = await db.Evidences.AsNoTracking().Where(e => e.BatchId == batch.BatchId)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Passed = g.Count(e => (e.ReviewStatus == "Accepted" || e.ReviewStatus == "Watch") && e.CapturedAt >= since),
                Flagged = g.Count(e => e.ReviewStatus == "Flagged"),
            })
            .SingleOrDefaultAsync(ct);
        if (evidence is null || evidence.Passed == 0)
            return "Chưa có bằng chứng nuôi đạt yêu cầu kể từ đợt trước.";
        if (evidence.Flagged > 0)
            return $"Còn {evidence.Flagged} bằng chứng bị gắn cờ, chờ kiểm định viên thẩm định.";
        if (tranche.TrancheNo >= 3 && batch.ExpectedHarvestDate is null)
            return "Chưa khai báo kế hoạch thu hoạch (ngày dự kiến).";
        return null;
    }

    // ---------- Dùng chung ----------

    private static Task<List<Batch>> LoadAsync(IQueryable<Batch> batches, CancellationToken ct) => batches
        .Include(b => b.Operator)
        .Include(b => b.BatchAccount)
        .Include(b => b.DisbursementTranches)
        .Include(b => b.Contributions).ThenInclude(c => c.InvestmentContract)
        .Where(b => b.DisbursementTranches.Any())
        .AsSplitQuery()
        .OrderBy(b => b.BatchCode)
        .ToListAsync(ct);

    private async Task<(Batch Batch, DisbursementTranche Tranche)> LoadTrancheAsync(long trancheId, CancellationToken ct)
    {
        var batch = (await LoadAsync(db.Batches.Where(b => b.DisbursementTranches.Any(t => t.TrancheId == trancheId)), ct)).SingleOrDefault()
                    ?? throw new NotFoundException("tranche.not_found", "Không tìm thấy đợt giải ngân.");
        return (batch, batch.DisbursementTranches.Single(t => t.TrancheId == trancheId));
    }

    private async Task<IReadOnlyList<TrancheResponse>> DescribeAsync(IEnumerable<Batch> batches, string[]? onlyStatuses, CancellationToken ct)
    {
        var list = batches.ToList();
        var trancheIds = list.SelectMany(b => b.DisbursementTranches).Select(t => t.TrancheId).ToList();
        var instructions = await db.PaymentInstructions.AsNoTracking()
            .Where(i => i.TrancheId != null && trancheIds.Contains(i.TrancheId.Value))
            .Select(i => new { i.TrancheId, i.InstructionId, i.Status })
            .ToListAsync(ct);
        var now = clock.GetUtcNow();
        var rows = new List<TrancheResponse>();
        foreach (var batch in list)
        foreach (var t in batch.DisbursementTranches.OrderBy(t => t.TrancheNo))
        {
            if (onlyStatuses is not null && !onlyStatuses.Contains(t.Status)) continue;
            var reason = await GateAsync(batch, t, now, ct);
            var instruction = instructions.Where(i => i.TrancheId == t.TrancheId).MaxBy(i => i.InstructionId);
            rows.Add(new TrancheResponse(
                t.TrancheId, batch.BatchCode, batch.Title, batch.Operator.LegalName, t.TrancheNo, (long)t.PlannedAmount, t.PlannedDate,
                t.UnlockCondition, t.Status, t.RequestedAt, t.ExplanationDeadline, t.ReleasedAt,
                reason is null, reason, instruction?.InstructionId, instruction?.Status));
        }
        return rows;
    }

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
}

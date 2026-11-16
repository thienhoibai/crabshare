using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Settlement;

public sealed class ProposeDecisionRequest
{
    [Required, RegularExpression("^(EarlyLiquidation|SurplusSale)$")] public string Kind { get; set; } = "";
    [Required, StringLength(1000, MinimumLength = 10)] public string Proposal { get; set; } = "";
    [Range(1, 336)] public int VotingHours { get; set; } = 72;
}

public sealed class CastVoteRequest
{
    [Required, RegularExpression("^(Yes|No)$")] public string Choice { get; set; } = "";
}

public sealed record DecisionResponse(string DecisionNo, string BatchCode, string Kind, string Proposal, string Status, DateTimeOffset OpenedAt,
    DateTimeOffset ClosesAt, long EligibleCapital, long YesCapital, long NoCapital, decimal YesPct, decimal NoPct, string? MyChoice, bool CanVote,
    DateTimeOffset? DecidedAt);

/// <summary>
/// Quyết định tập thể của nhà đầu tư (BR-211): mỗi phiếu có trọng số bằng vốn đã chốt; vốn của người nuôi và bên liên quan không biểu quyết
/// (xung đột lợi ích). Quá nửa vốn đủ quyền đồng ý thì thông qua ngay; hết hạn thì thông qua nếu vốn đồng ý nhiều hơn vốn phản đối.
/// Thanh lý sớm thông qua (BR-210): Lô chuyển Liquidating, các mốc chưa giải ngân dừng, cua còn lại bán qua đơn có hoá đơn.
/// Bán phần dư thông qua (BR-182): mở bán Surplus khi bên cam kết không mua.
/// </summary>
public sealed class CollectiveDecisionService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access, PartyDirectory parties)
{
    public async Task<DecisionResponse> ProposeAsync(string batchCode, ProposeDecisionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var no = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await access.OperateAsync(batchCode, ct, lockRow: true);
            if (batch.BatchMode != "P")
                throw new BusinessRuleException("decision.not_p_batch", "Quyết định tập thể chỉ có ở lô P có nhà đầu tư (BR-211).");
            if (req.Kind == "EarlyLiquidation" && batch.Status is not ("Sourcing" or "InProduction" or "Harvesting" or "Selling"))
                throw new BusinessRuleException("decision.liquidation_not_allowed", "Chỉ thanh lý sớm Lô đang vận hành.");
            if (req.Kind == "SurplusSale" && !await db.SalesOrders.AnyAsync(o => o.BatchId == batch.BatchId && o.OrderType == "FinalOrder" && o.Status == "Cancelled", ct))
                throw new BusinessRuleException("decision.surplus_not_needed", "Chỉ biểu quyết bán phần dư khi bên cam kết không mua đơn hàng cuối (BR-182).");
            if (await db.CollectiveDecisions.AnyAsync(d => d.BatchId == batch.BatchId && d.DecisionKind == req.Kind && d.Status == "Open", ct))
                throw new ConflictException("decision.open_exists", "Đang có cuộc biểu quyết cùng loại.");
            var eligible = await EligibleSharesAsync(batch, ct);
            if (eligible.Count == 0)
                throw new BusinessRuleException("decision.no_voters", "Lô không có nhà đầu tư nào đủ quyền biểu quyết.");
            var now = clock.GetUtcNow();
            var decision = new CollectiveDecision
            {
                DecisionNo = Codes.New("QD", 10), BatchId = batch.BatchId, DecisionKind = req.Kind, Proposal = req.Proposal.Trim(), ProposedBy = me.UserId,
                OpenedAt = now, ClosesAt = now.AddHours(req.VotingHours), Status = "Open", EligibleCapital = eligible.Values.Sum(),
            };
            db.CollectiveDecisions.Add(decision);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("collective_decision", decision.DecisionId, "propose", null,
                new { decision.DecisionNo, batch.BatchCode, decision.DecisionKind, eligible = (long)decision.EligibleCapital, decision.ClosesAt }, ct);
            return decision.DecisionNo;
        }, ct);
        return await GetAsync(no, ct);
    }

    public async Task<DecisionResponse> VoteAsync(string decisionNo, CastVoteRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var decision = await db.CollectiveDecisions.FromSqlInterpolated(
                    $"SELECT * FROM dbo.collective_decision WITH (UPDLOCK, HOLDLOCK) WHERE decision_no = {decisionNo}").SingleOrDefaultAsync(ct)
                           ?? throw new NotFoundException("decision.not_found", "Không tìm thấy quyết định.");
            var now = clock.GetUtcNow();
            if (decision.Status != "Open" || now >= decision.ClosesAt)
                throw new BusinessRuleException("decision.closed", "Cuộc biểu quyết đã kết thúc.");
            var batch = await db.Batches.SingleAsync(b => b.BatchId == decision.BatchId, ct);
            var eligible = await EligibleSharesAsync(batch, ct);
            if (!eligible.TryGetValue(me.UserId, out var capital))
                throw new ForbiddenException("decision.not_eligible", "Bạn không có quyền biểu quyết ở Lô này (BR-211).");
            if (await db.Votes.AnyAsync(v => v.DecisionId == decision.DecisionId && v.InvestorId == me.UserId, ct))
                throw new ConflictException("decision.already_voted", "Bạn đã biểu quyết.");
            db.Votes.Add(new Vote { DecisionId = decision.DecisionId, InvestorId = me.UserId, Capital = capital, Choice = req.Choice, VotedAt = now });
            if (req.Choice == "Yes") decision.YesCapital += capital; else decision.NoCapital += capital;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("collective_decision", decision.DecisionId, "vote", null, new { voter = me.UserId, req.Choice, capital = (long)capital }, ct);
            if (decision.YesCapital * 2 > decision.EligibleCapital) await CloseAsync(decision, batch, "Passed", now, ct);
            else if (decision.NoCapital * 2 >= decision.EligibleCapital) await CloseAsync(decision, batch, "Rejected", now, ct);
        }, ct);
        return await GetAsync(decisionNo, ct);
    }

    /// <summary>Hết hạn biểu quyết: thông qua khi vốn đồng ý nhiều hơn vốn phản đối.</summary>
    public async Task<int> CloseExpiredAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var due = await db.CollectiveDecisions.Where(d => d.Status == "Open" && d.ClosesAt <= now).Select(d => d.DecisionId).ToListAsync(ct);
        foreach (var id in due)
            await db.InTransactionAsync(async () =>
            {
                await audit.LockAsync(ct);
                var d = await db.CollectiveDecisions.SingleAsync(x => x.DecisionId == id, ct);
                if (d.Status != "Open") return;
                var batch = await db.Batches.SingleAsync(b => b.BatchId == d.BatchId, ct);
                await CloseAsync(d, batch, d.YesCapital > d.NoCapital ? "Passed" : "Rejected", clock.GetUtcNow(), ct);
            }, ct);
        return due.Count;
    }

    private async Task CloseAsync(CollectiveDecision decision, Batch batch, string status, DateTimeOffset now, CancellationToken ct)
    {
        decision.Status = status;
        decision.DecidedAt = now;
        if (status == "Passed" && decision.DecisionKind == "EarlyLiquidation")
        {
            var before = batch.Status;
            batch.Status = "Liquidating";
            batch.LiquidationStartedAt = batch.UpdatedAt = now;
            var stopped = await db.DisbursementTranches.Where(t => t.BatchId == batch.BatchId && (t.Status == "Planned" || t.Status == "Requested" || t.Status == "NeedsExplanation"))
                .ToListAsync(ct);
            foreach (var t in stopped) { t.Status = "Stopped"; t.UpdatedAt = now; }
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("batch", batch.BatchId, "start_liquidation", new { status = before },
                new { batch.Status, decision.DecisionNo, stoppedMilestones = stopped.Select(t => t.TrancheNo) }, now, ct);
        }
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("collective_decision", decision.DecisionId, "close", new { status = "Open" },
            new { decision.Status, yes = (long)decision.YesCapital, no = (long)decision.NoCapital, eligible = (long)decision.EligibleCapital }, now, ct);
    }

    public async Task<DecisionResponse> GetAsync(string decisionNo, CancellationToken ct)
    {
        var d = await db.CollectiveDecisions.AsNoTracking().SingleOrDefaultAsync(x => x.DecisionNo == decisionNo, ct)
                ?? throw new NotFoundException("decision.not_found", "Không tìm thấy quyết định.");
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == d.BatchId, ct);
        await RequireViewerAsync(batch, ct);
        return await ResponseAsync(d, batch, ct);
    }

    public async Task<IReadOnlyList<DecisionResponse>> ListAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await RequireViewerAsync(batch, ct);
        var list = new List<DecisionResponse>();
        foreach (var d in await db.CollectiveDecisions.AsNoTracking().Where(x => x.BatchId == batch.BatchId).OrderBy(x => x.OpenedAt).ToListAsync(ct))
            list.Add(await ResponseAsync(d, batch, ct));
        return list;
    }

    /// <summary>Đã có quyết định thông qua cho việc này (dùng cho bán phần dư của lô P).</summary>
    public static Task<bool> PassedAsync(AppDbContext db, long batchId, string kind, CancellationToken ct)
        => db.CollectiveDecisions.AnyAsync(d => d.BatchId == batchId && d.DecisionKind == kind && d.Status == "Passed", ct);

    private async Task<DecisionResponse> ResponseAsync(CollectiveDecision d, Batch batch, CancellationToken ct)
    {
        var mine = me.IsAuthenticated
            ? await db.Votes.Where(v => v.DecisionId == d.DecisionId && v.InvestorId == me.UserId).Select(v => v.Choice).SingleOrDefaultAsync(ct) : null;
        var canVote = me.IsAuthenticated && mine is null && d.Status == "Open" && (await EligibleSharesAsync(batch, ct)).ContainsKey(me.UserId);
        decimal Pct(decimal part) => d.EligibleCapital == 0 ? 0 : decimal.Round(part * 100 / d.EligibleCapital, 2);
        return new DecisionResponse(d.DecisionNo, batch.BatchCode, d.DecisionKind, d.Proposal, d.Status, d.OpenedAt, d.ClosesAt, (long)d.EligibleCapital,
            (long)d.YesCapital, (long)d.NoCapital, Pct(d.YesCapital), Pct(d.NoCapital), mine, canVote, d.DecidedAt);
    }

    /// <summary>Vốn đã chốt của nhà đầu tư có quyền biểu quyết: loại người nuôi của Lô và bên liên quan của đơn vị thực hiện (BR-211).</summary>
    private async Task<Dictionary<long, decimal>> EligibleSharesAsync(Batch batch, CancellationToken ct)
    {
        var shares = await db.CapitalShares.AsNoTracking().Where(s => s.BatchId == batch.BatchId).Select(s => new { s.InvestorId, s.ConfirmedAmount }).ToListAsync(ct);
        var members = await db.OperatorMembers.Where(m => m.OperatorId == batch.OperatorId).Select(m => m.UserId).ToListAsync(ct);
        var executor = batch.ExecutorPartyId ?? await parties.PartyIdOfOperatorAsync(batch.OperatorId, ct);
        var related = await db.RelatedParties.Where(r => r.PartyId == executor && r.LinkedPartyId != null).Select(r => r.LinkedPartyId!.Value).ToListAsync(ct);
        var userIds = shares.Select(s => s.InvestorId).ToList();
        var partyOf = await db.AppUsers.Where(u => userIds.Contains(u.UserId)).Select(u => new { u.UserId, u.PartyId }).ToDictionaryAsync(u => u.UserId, u => u.PartyId, ct);
        return shares.Where(s => !members.Contains(s.InvestorId) && !(partyOf.GetValueOrDefault(s.InvestorId) is { } p && (p == executor || related.Contains(p))))
            .ToDictionary(s => s.InvestorId, s => s.ConfirmedAmount);
    }

    private async Task RequireViewerAsync(Batch batch, CancellationToken ct)
    {
        if (me.IsInRole(Roles.PlatformAdmin)) return;
        if (await db.CapitalShares.AnyAsync(s => s.BatchId == batch.BatchId && s.InvestorId == me.UserId, ct)) return;
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
    }
}

public sealed record MoneyFigures(long Contributed, long Disbursed, long HeldInAccount);

public sealed record MoneySummaryResponse(string BatchCode, MoneyFigures Batch, MoneyFigures? Mine, string Note);

/// <summary>
/// BR-232: ba số của nhà đầu tư và của cả Lô: đã góp, đã giải ngân theo mốc, còn giữ trong tài khoản của Lô; dẫn xuất từ giao dịch tiền
/// đã đối soát (giao dịch vào đã khớp khoản góp, lệnh giải ngân đã thành công), không nhập tay.
/// </summary>
public sealed class MoneySummaryService(AppDbContext db, ICurrentUser me, BatchAccess access)
{
    public async Task<MoneySummaryResponse> GetAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        var myShare = await db.CapitalShares.AsNoTracking().Where(s => s.BatchId == batch.BatchId && s.InvestorId == me.UserId)
            .Select(s => (decimal?)s.ConfirmedAmount).SingleOrDefaultAsync(ct);
        if (myShare is null && !me.IsInRole(Roles.PlatformAdmin)) await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var account = await db.BatchAccounts.AsNoTracking().Where(a => a.BatchId == batch.BatchId).Select(a => (long?)a.BatchAccountId).SingleOrDefaultAsync(ct) ?? 0;
        var contributed = (long)(await db.CapitalShares.Where(s => s.BatchId == batch.BatchId).SumAsync(s => (decimal?)s.ConfirmedAmount, ct) ?? 0);
        var disbursed = (long)(await db.PaymentInstructions.Where(i => i.BatchAccountId == account && i.InstructionType == "Disbursement" && i.Status == "Succeeded")
            .SumAsync(i => (decimal?)i.Amount, ct) ?? 0);
        var moves = await db.ProviderTransactions.AsNoTracking().Where(t => t.BatchAccountId == account)
            .GroupBy(t => t.Direction).Select(g => new { g.Key, Amount = g.Sum(t => t.Amount) }).ToListAsync(ct);
        var held = (long)(moves.Where(m => m.Key == "In").Sum(m => m.Amount) - moves.Where(m => m.Key == "Out").Sum(m => m.Amount));
        MoneyFigures? mine = null;
        if (myShare is { } capital && contributed > 0)
        {
            var myDisbursed = (long)decimal.Floor(disbursed * capital / contributed);
            mine = new MoneyFigures((long)capital, myDisbursed, (long)capital - myDisbursed);
        }
        return new MoneySummaryResponse(batch.BatchCode, new MoneyFigures(contributed, disbursed, held), mine,
            "Phần của bạn trong số đã giải ngân tính theo tỷ lệ vốn, làm tròn xuống. Số dư tài khoản của Lô gồm cả tiền cọc và tiền hàng của khách.");
    }
}

[ApiController]
[Authorize]
public sealed class CollectiveDecisionsController(CollectiveDecisionService decisions, MoneySummaryService money, SettlementReadinessService readiness, ICurrentUser me)
    : ControllerBase
{
    [HttpPost("api/batches/{code}/decisions")]
    [EndpointSummary("Mở biểu quyết tập thể: thanh lý sớm hoặc bán phần dư (BR-182, BR-210, BR-211)")]
    public async Task<ActionResult<DecisionResponse>> Propose(string code, ProposeDecisionRequest req, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await decisions.ProposeAsync(code, req, ct));

    [HttpGet("api/batches/{code}/decisions")]
    public async Task<ActionResult<IReadOnlyList<DecisionResponse>>> List(string code, CancellationToken ct) => Ok(await decisions.ListAsync(code, ct));

    [HttpPost("api/decisions/{decisionNo}/votes"), Authorize(Policy = Policies.Investor)]
    [EndpointSummary("Nhà đầu tư biểu quyết, trọng số bằng vốn đã chốt")]
    public async Task<ActionResult<DecisionResponse>> Vote(string decisionNo, CastVoteRequest req, CancellationToken ct) => Ok(await decisions.VoteAsync(decisionNo, req, ct));

    [HttpGet("api/batches/{code}/money-summary")]
    [EndpointSummary("Ba số: đã góp, đã giải ngân theo mốc, còn giữ trong tài khoản của Lô (BR-232)")]
    public async Task<ActionResult<MoneySummaryResponse>> Money(string code, CancellationToken ct) => Ok(await money.GetAsync(code, ct));

    [HttpGet("api/batches/{code}/settlement-readiness")]
    [EndpointSummary("Sáu điều kiện chờ quyết toán và điều kiện nào còn thiếu (BR-183)")]
    public async Task<ActionResult<SettlementReadinessResponse>> Readiness(string code, CancellationToken ct) => Ok(await readiness.CheckAsync(code, ct, me.IsInRole(Roles.Investor) ? me.UserId : (long?)null));
}

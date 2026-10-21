using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.SettlementEngine;
using Microsoft.EntityFrameworkCore;
using SettlementEntity = CrabShare.Api.Infrastructure.Persistence.Entities.Settlement;

namespace CrabShare.Api.Features.Settlement;

/// <summary>
/// UC38 tính quyết toán (TH-12): doanh thu thực thu từ <c>v_batch_actual_revenue</c>, chi phí chuẩn đã khoá, vốn đã chốt trong
/// <c>capital_share</c>, tính bằng <see cref="SettlementCalculator"/> (lõi thuần, khớp tới 1 đồng). Mỗi lô một bảng
/// (<c>uq_settlement_batch_id</c>): tính lại trước khi duyệt thì tăng <c>revision_no</c>, thay toàn bộ dòng và đưa về Draft;
/// đã duyệt thì khoá (trigger BR-30), không tính lại được.
/// </summary>
public sealed class SettlementService(AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock)
{
    public static readonly string[] LockedStatuses = ["Approved", "PaidOut", "Closed"];
    private static readonly string[] SettleableBatchStatuses = ["Harvesting", "Settlement"];

    // ---------- Tính bảng nháp (UC38) ----------

    public Task<(SettlementResponse Settlement, bool Created)> CalculateAsync(string batchCode, CalculateSettlementRequest req, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await db.Batches
                .FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_code = {batchCode}")
                .Include(b => b.Settlement).ThenInclude(s => s!.SettlementLines)
                .SingleOrDefaultAsync(ct)
                ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
            if (!SettleableBatchStatuses.Contains(batch.Status))
                throw new BusinessRuleException("settlement.batch_not_ready", "Chỉ tính quyết toán cho lô đang thu hoạch hoặc chờ quyết toán.");
            var existing = batch.Settlement;
            if (existing is not null && LockedStatuses.Contains(existing.Status))
                throw new ConflictException("settlement.locked", "Bảng quyết toán đã duyệt nên không tính lại được (BR-30).");

            var shares = await db.CapitalShares.AsNoTracking().Where(s => s.BatchId == batch.BatchId)
                .OrderBy(s => s.InvestorId).Select(s => new { s.InvestorId, s.ConfirmedAmount }).ToListAsync(ct);
            if (shares.Count == 0)
                throw new BusinessRuleException("settlement.no_capital_shares", "Lô chưa chốt vốn nên chưa có tỷ lệ để chia.");
            var cost = await LockedCostAsync(batch.BatchId, ct)
                       ?? throw new BusinessRuleException("settlement.no_locked_cost", "Lô chưa có bảng chi phí chuẩn đã khoá.");
            var revenueRow = await db.VBatchActualRevenues.AsNoTracking().SingleOrDefaultAsync(v => v.BatchId == batch.BatchId, ct);
            var revenue = (long)Math.Max(0, revenueRow?.ActualRevenue ?? 0);

            var result = SettlementCalculator.Calculate(new SettlementInput(revenue, cost.Total, batch.OperatorSharePct, req.TaxWithholdingPct,
                shares.Select(s => (s.InvestorId, (long)s.ConfirmedAmount)).ToList()));

            var now = Now();
            var settlement = existing ?? new SettlementEntity { BatchId = batch.BatchId, RevisionNo = 0, CreatedAt = now };
            var before = existing is null ? null : Snapshot(existing);
            if (existing is not null)
            {
                // Bảng chưa duyệt: thay toàn bộ dòng (trigger chỉ chặn bảng đã duyệt). Xoá trước rồi thêm để không vướng ux_settlement_line_investor
                db.SettlementLines.RemoveRange(existing.SettlementLines);
                await db.SaveChangesAsync(ct);
            }
            settlement.RevisionNo++;
            settlement.ActualRevenue = revenue;
            settlement.LockedStandardCost = cost.Total;
            settlement.RevenuePool = result.RevenuePool;
            settlement.OperatorSharePct = batch.OperatorSharePct;
            settlement.OperatorRemuneration = result.OperatorRemuneration;
            settlement.DepreciationAmount = cost.Depreciation;
            settlement.TaxTotal = result.TaxTotal;
            settlement.Status = "Draft";
            settlement.ProposedAt = null;
            settlement.FeedbackDeadline = null;
            settlement.UpdatedAt = now;
            foreach (var line in result.Lines)
                settlement.SettlementLines.Add(new SettlementLine
                {
                    BatchId = batch.BatchId, InvestorId = line.InvestorId, CapitalReturn = line.Capital, ProfitShare = line.ProfitShare,
                    TaxWithheld = line.TaxWithheld, NetPayout = line.NetPayout, CreatedAt = now,
                });
            if (existing is null) db.Settlements.Add(settlement);

            var batchBefore = batch.Status;
            if (batch.Status == "Harvesting")
            {
                batch.Status = "Settlement";
                batch.UpdatedAt = now;
            }
            await db.SaveChangesAsync(ct);
            if (batchBefore != batch.Status)
                await audit.WriteAsync("batch", batch.BatchId, "start_settlement", new { status = batchBefore }, new { batch.Status, batch.BatchCode }, now, ct);
            await audit.WriteAsync("settlement", settlement.SettlementId, existing is null ? "calculate" : "recalculate", before, new
            {
                Snapshot = Snapshot(settlement), batch.BatchCode, distributable = result.Distributable, uncoveredLoss = result.UncoveredLoss,
                req.TaxWithholdingPct, revenueSources = revenueRow is null ? null : new
                {
                    orderRevenue = (long)revenueRow.OrderRevenue, forfeitedDeposits = (long)revenueRow.ForfeitedDeposits,
                    complaintRefunds = (long)revenueRow.ComplaintRefunds,
                },
                lines = result.Lines.Select(l => new { l.InvestorId, l.Capital, l.ProfitShare, l.TaxWithheld, l.NetPayout }),
            }, now, ct);
            return (await DescribeAsync(settlement.SettlementId, Viewer.Admin, ct), existing is null);
        }, ct);

    // ---------- Xem ----------

    /// <summary>Lô đang thu hoạch / quyết toán / đã đóng, kèm bảng quyết toán nếu có (AdminFinance, tab Quyết toán).</summary>
    public async Task<IReadOnlyList<AdminSettlementSummary>> ListForAdminAsync(CancellationToken ct)
        => await db.Batches.AsNoTracking()
            .Where(b => b.Status == "Harvesting" || b.Status == "Settlement" || b.Status == "Closed")
            .OrderBy(b => b.Status == "Settlement" ? 0 : b.Status == "Harvesting" ? 1 : 2).ThenBy(b => b.BatchCode)
            .Select(b => new AdminSettlementSummary(
                b.BatchCode, b.Title, b.Operator.LegalName, b.Status,
                b.Settlement == null ? null : b.Settlement.SettlementId,
                b.Settlement == null ? null : b.Settlement.Status,
                b.Settlement == null ? null : b.Settlement.RevisionNo,
                b.Settlement == null ? null : (long)b.Settlement.ActualRevenue,
                b.Settlement == null ? null : (long)b.Settlement.RevenuePool,
                b.Settlement == null ? null : b.Settlement.FeedbackDeadline,
                b.Settlement == null ? 0 : b.Settlement.SettlementFeedbacks.Count(f => f.Status == "Open"),
                b.Settlement == null ? null : b.Settlement.UpdatedAt))
            .ToListAsync(ct);

    public Task<SettlementResponse> GetForAdminAsync(long settlementId, CancellationToken ct) => DescribeAsync(settlementId, Viewer.Admin, ct);

    // ---------- Dùng chung (TH-13, TH-14) ----------

    /// <summary>Ai đang xem bảng: admin và người nuôi thấy mọi dòng; nhà đầu tư chỉ thấy tổng và dòng của mình.</summary>
    internal enum Viewer { Admin, Operator, Investor }

    internal async Task<SettlementResponse> DescribeAsync(long settlementId, Viewer viewer, CancellationToken ct)
    {
        var s = await db.Settlements.AsNoTracking()
            .Include(x => x.Batch).ThenInclude(b => b.Operator)
            .Include(x => x.SettlementLines).ThenInclude(l => l.Investor).ThenInclude(i => i.User)
            .Include(x => x.SettlementFeedbacks).ThenInclude(f => f.User)
            .AsSplitQuery()
            .SingleOrDefaultAsync(x => x.SettlementId == settlementId, ct)
            ?? throw new NotFoundException("settlement.not_found", "Không tìm thấy bảng quyết toán.");
        var revenue = await db.VBatchActualRevenues.AsNoTracking().SingleOrDefaultAsync(v => v.BatchId == s.BatchId, ct);
        var lineIds = s.SettlementLines.Select(l => l.SettlementLineId).ToList();
        var payouts = await db.PaymentInstructions.AsNoTracking()
            .Where(i => i.SettlementLineId != null && lineIds.Contains(i.SettlementLineId.Value))
            .Select(i => new { i.SettlementLineId, i.InstructionId, i.Status })
            .ToListAsync(ct);
        var anchors = await db.AuditLogs.AsNoTracking()
            .Where(a => (a.EntityType == "batch" && a.EntityId == s.BatchId && (a.ActionType == "close_capital" || a.ActionType == "close"))
                        || (a.EntityType == "settlement" && a.EntityId == s.SettlementId && a.ActionType == "approve"))
            .OrderBy(a => a.AuditId)
            .Select(a => new { a.ActionType, a.EntityType, a.OccurredAt, a.AuditId, a.RowHash })
            .ToListAsync(ct);
        var userId = me.IsAuthenticated ? me.UserId : 0;
        var pool = (long)s.RevenuePool;
        var distributable = pool > 0 ? pool - (long)s.OperatorRemuneration : pool;
        var sumProfit = s.SettlementLines.Sum(l => (long)l.ProfitShare);

        var lines = s.SettlementLines
            .Where(l => viewer != Viewer.Investor || l.InvestorId == userId)
            .OrderBy(l => l.InvestorId)
            .Select(l => new SettlementLineResponse(
                l.SettlementLineId, l.InvestorId, InvestorName(l.Investor), (long)l.CapitalReturn, (long)l.ProfitShare, (long)l.TaxWithheld,
                (long)l.NetPayout, l.InvestorId == userId,
                payouts.Where(p => p.SettlementLineId == l.SettlementLineId).MaxBy(p => p.InstructionId)?.Status))
            .ToList();
        var feedback = s.SettlementFeedbacks
            .Where(f => viewer != Viewer.Investor || f.UserId == userId)
            .OrderBy(f => f.FeedbackId)
            .Select(f => new SettlementFeedbackResponse(f.FeedbackId, f.User.FullName, f.Content, f.Status, f.Response, f.CreatedAt, f.RespondedAt, f.UserId == userId))
            .ToList();
        return new SettlementResponse(
            s.SettlementId, s.Batch.BatchCode, s.Batch.Title, s.Batch.Operator.LegalName, s.Batch.Status, s.Status, s.RevisionNo,
            (long)(revenue?.OrderRevenue ?? 0), (long)(revenue?.ForfeitedDeposits ?? 0), (long)(revenue?.ComplaintRefunds ?? 0),
            (long)s.ActualRevenue, (long)s.LockedStandardCost, pool, s.OperatorSharePct, (long)s.OperatorRemuneration, distributable,
            (long)s.DepreciationAmount, (long)s.TaxTotal, Math.Max(0, sumProfit - distributable), distributable - sumProfit,
            s.SettlementLines.Sum(l => (long)l.CapitalReturn), s.SettlementLines.Sum(l => (long)l.NetPayout), s.SettlementLines.Count,
            s.ProposedAt, s.FeedbackDeadline, s.ApprovedAt, s.CreatedAt, s.UpdatedAt, lines, feedback,
            $"Khoản khấu trừ thuế do người nuôi {s.Batch.Operator.LegalName} (MST {s.Batch.Operator.TaxCode}) khai thay và nộp thay theo hợp đồng của lô. "
            + "Con số trên bảng là số tham khảo; số chính thức do bên có nghĩa vụ kê khai xác định.",
            anchors.Select(a => new AuditAnchorResponse(
                a.ActionType switch { "close_capital" => "Chốt vốn", "approve" => "Duyệt quyết toán", _ => "Đóng lô" },
                a.OccurredAt, a.AuditId, a.RowHash)).ToList());
    }

    internal static string InvestorName(Investor investor)
        => investor.InvestorKind == "Organization" && !string.IsNullOrWhiteSpace(investor.OrganizationName) ? investor.OrganizationName : investor.User.FullName;

    /// <summary>Tổng chi phí chuẩn đã khoá (làm tròn từng dòng như Batches/BatchService) và phần khấu hao trong đó.</summary>
    private async Task<(long Total, long Depreciation)?> LockedCostAsync(long batchId, CancellationToken ct)
    {
        var items = await db.StandardCostItems.AsNoTracking()
            .Where(i => i.CostVersion.BatchId == batchId && i.CostVersion.Status == "Locked")
            .Select(i => new { i.Category, i.Quantity, i.UnitPrice })
            .ToListAsync(ct);
        if (items.Count == 0) return null;
        long Amount(decimal q, decimal p) => (long)decimal.Round(q * p, 0, MidpointRounding.AwayFromZero);
        return (items.Sum(i => Amount(i.Quantity, i.UnitPrice)), items.Where(i => i.Category == "Depreciation").Sum(i => Amount(i.Quantity, i.UnitPrice)));
    }

    private static object Snapshot(SettlementEntity s) => new
    {
        s.Status, s.RevisionNo, actualRevenue = (long)s.ActualRevenue, lockedStandardCost = (long)s.LockedStandardCost,
        revenuePool = (long)s.RevenuePool, s.OperatorSharePct, operatorRemuneration = (long)s.OperatorRemuneration,
        depreciationAmount = (long)s.DepreciationAmount, taxTotal = (long)s.TaxTotal,
    };

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
}

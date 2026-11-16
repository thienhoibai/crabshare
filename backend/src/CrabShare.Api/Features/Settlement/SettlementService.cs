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
/// Tính quyết toán theo Business Rule v1.5 (BR-183 – BR-201). Lô phải đủ sáu điều kiện chờ quyết toán (AwaitingSettlement).
/// Lô P: doanh thu thực thu = tổng dòng doanh thu; phí nền tảng = tỷ lệ phí của Lô × doanh thu; chi phí trừ theo cơ sở đã chọn
/// (Chi phí chuẩn mỗi con × số con được cấp vốn, hoặc chi phí thực tế có chứng từ); Pool = doanh thu − phí − chi phí trừ; thù lao theo bậc
/// của tỷ lệ sống; chia cho nhà đầu tư bằng <see cref="SettlementCalculator"/>. Lô T: kết quả thương vụ nội bộ của CrabShare. Lô A: hoa hồng
/// trên hàng đã giao và đã thu tiền, phần còn lại chi cho nhà cung cấp. Không khấu trừ thuế trên bảng (v1.5).
/// </summary>
public sealed class SettlementService(AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock)
{
    public static readonly string[] LockedStatuses = ["Approved", "PaidOut", "Closed"];
    private static readonly string[] SettleableBatchStatuses = ["AwaitingSettlement", "Settling"];

    // ---------- Tính bảng nháp ----------

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
                throw new BusinessRuleException("settlement.batch_not_ready", "Lô chưa đủ sáu điều kiện chờ quyết toán (BR-183).");
            var existing = batch.Settlement;
            if (existing is not null && LockedStatuses.Contains(existing.Status))
                throw new ConflictException("settlement.locked", "Bảng quyết toán đã duyệt nên không tính lại được (BR-206).");

            var figures = await FiguresAsync(batch, ct);
            var shares = batch.BatchMode == "P"
                ? await db.CapitalShares.AsNoTracking().Where(s => s.BatchId == batch.BatchId).OrderBy(s => s.InvestorId)
                    .Select(s => new { s.InvestorId, s.ConfirmedAmount }).ToListAsync(ct)
                : [];
            if (batch.BatchMode == "P" && shares.Count == 0)
                throw new BusinessRuleException("settlement.no_capital_shares", "Lô chưa chốt vốn nên chưa có tỷ lệ để chia.");

            SettlementResult? result = null;
            long fee = 0, deductible, pool, remuneration = 0, commission = 0, supplier = 0;
            decimal? commissionPct = null;
            switch (batch.BatchMode)
            {
                case "P":
                    fee = Money(figures.Revenue * figures.FeeRatePct / 100m);
                    deductible = figures.Deductible;
                    result = SettlementCalculator.Calculate(new SettlementInput(figures.Revenue, deductible, figures.RemunerationPct, 0m,
                        shares.Select(s => (s.InvestorId, (long)s.ConfirmedAmount)).ToList(), fee));
                    pool = result.RevenuePool;
                    remuneration = result.OperatorRemuneration;
                    break;
                case "T":
                    // BR-200: kết quả thương vụ = doanh thu thực thu − giá vốn mua cua − chi phí trực tiếp thực tế có chứng từ.
                    deductible = figures.PurchaseCost + figures.ActualCostExceptSeed;
                    pool = figures.Revenue - deductible;
                    break;
                default:
                    // BR-201: hoa hồng trên hàng đã giao, đã nghiệm thu và đã thu tiền; phần còn lại chi cho nhà cung cấp.
                    commissionPct = batch.CommissionPct ?? 0;
                    commission = Money(figures.SalesRevenue * commissionPct.Value / 100m);
                    supplier = figures.Revenue - commission;
                    fee = commission;
                    deductible = supplier;
                    pool = 0;
                    break;
            }

            var now = Now();
            var settlement = existing ?? new SettlementEntity { BatchId = batch.BatchId, RevisionNo = 0, CreatedAt = now };
            var before = existing is null ? null : Snapshot(existing);
            if (existing is not null)
            {
                db.SettlementLines.RemoveRange(existing.SettlementLines);
                await db.SaveChangesAsync(ct);
            }
            settlement.RevisionNo++;
            settlement.SettlementMode = batch.BatchMode;
            settlement.SettlementBasis = batch.SettlementBasis;
            settlement.ActualRevenue = figures.Revenue;
            settlement.PlatformFeeRatePct = batch.BatchMode == "P" ? figures.FeeRatePct : 0;
            settlement.PlatformFee = fee;
            settlement.LockedStandardCost = deductible;
            settlement.StandardCostDeductible = figures.StandardDeductible;
            settlement.ActualCostTotal = figures.ActualCost;
            settlement.ExcludedFaultCost = 0;
            settlement.DisbursedTotal = figures.Disbursed;
            settlement.UndisbursedCost = batch.BatchMode == "P" ? Math.Max(0, deductible - figures.Disbursed) : 0;
            settlement.CustomerRefunds = figures.Refunds;
            settlement.ReceivedCount = figures.Received;
            settlement.DeadCount = figures.Dead;
            settlement.SurvivalRatePct = batch.BatchMode == "P" ? figures.SurvivalPct : null;
            settlement.RevenuePool = pool;
            settlement.OperatorSharePct = batch.BatchMode == "P" ? figures.RemunerationPct : 0;
            settlement.OperatorRemuneration = remuneration;
            settlement.DepreciationAmount = 0;
            settlement.TaxTotal = 0;
            settlement.UncoveredLoss = result?.UncoveredLoss ?? 0;
            settlement.CommissionPct = commissionPct;
            settlement.CommissionAmount = commission;
            settlement.SupplierPayout = supplier;
            settlement.IsLiquidation = batch.LiquidationStartedAt is not null;
            settlement.Status = "Draft";
            settlement.ProposedAt = null;
            settlement.FeedbackDeadline = null;
            settlement.UpdatedAt = now;
            foreach (var line in result?.Lines ?? [])
                settlement.SettlementLines.Add(new SettlementLine
                {
                    BatchId = batch.BatchId, InvestorId = line.InvestorId, CapitalReturn = line.Capital, ProfitShare = line.ProfitShare,
                    TaxWithheld = 0, NetPayout = line.NetPayout, CreatedAt = now,
                });
            if (existing is null) db.Settlements.Add(settlement);

            var batchBefore = batch.Status;
            if (batch.Status == "AwaitingSettlement")
            {
                batch.Status = "Settling";
                batch.UpdatedAt = now;
            }
            await db.SaveChangesAsync(ct);
            if (batchBefore != batch.Status)
                await audit.WriteAsync("batch", batch.BatchId, "start_settlement", new { status = batchBefore }, new { batch.Status, batch.BatchCode }, now, ct);
            await audit.WriteAsync("settlement", settlement.SettlementId, existing is null ? "calculate" : "recalculate", before, new
            {
                Snapshot = Snapshot(settlement), batch.BatchCode, figures.RevenueByType,
                lines = (result?.Lines ?? []).Select(l => new { l.InvestorId, l.Capital, l.ProfitShare, l.NetPayout }),
            }, now, ct);
            return (await DescribeAsync(settlement.SettlementId, Viewer.Admin, ct), existing is null);
        }, ct);

    internal sealed record Figures(long Revenue, IReadOnlyDictionary<string, long> RevenueByType, long SalesRevenue, long Refunds, decimal FeeRatePct,
        long StandardDeductible, long ActualCost, long ActualCostExceptSeed, long PurchaseCost, long Disbursed, long Deductible, int Received, int Dead,
        decimal SurvivalPct, decimal RemunerationPct);

    /// <summary>Các số đầu vào của quyết toán, đều dẫn xuất từ dữ liệu đã ghi (BR-232: không nhập tay).</summary>
    internal async Task<Figures> FiguresAsync(Batch batch, CancellationToken ct)
    {
        var byType = await db.RevenueLines.AsNoTracking().Where(r => r.BatchId == batch.BatchId).GroupBy(r => r.SourceType)
            .Select(g => new { g.Key, Amount = g.Sum(r => r.Amount) }).ToDictionaryAsync(x => x.Key, x => (long)x.Amount, ct);
        var revenue = byType.Values.Sum();
        var account = await db.BatchAccounts.AsNoTracking().Where(a => a.BatchId == batch.BatchId).Select(a => (long?)a.BatchAccountId).SingleOrDefaultAsync(ct);
        var refunds = account is { } accountId
            ? (long)(await db.PaymentInstructions.Where(i => i.BatchAccountId == accountId && i.InstructionType == "Refund" && i.OrderId != null && i.Status != "Failed")
                .SumAsync(i => (decimal?)i.Amount, ct) ?? 0)
            : 0;
        var disbursed = account is { } a2
            ? (long)(await db.PaymentInstructions.Where(i => i.BatchAccountId == a2 && i.InstructionType == "Disbursement" && i.Status != "Failed")
                .SumAsync(i => (decimal?)i.Amount, ct) ?? 0)
            : 0;
        var funded = batch.FundedQuantity ?? batch.SeedQuantity;
        // BR-187: Chi phí chuẩn trừ = Chi phí chuẩn mỗi con × số con được cấp vốn (không giảm theo cua chết; trừ lỗi người nuôi, BR-126).
        var standard = (long)((batch.StandardCostPerCrab ?? 0) * funded);
        var costRows = await db.CostActuals.AsNoTracking().Where(c => c.BatchId == batch.BatchId)
            .Join(db.StandardCostItems, c => c.CostItemId, i => i.CostItemId, (c, i) => new { c.Amount, i.Category, Documented = c.DocumentEvidenceId != null || c.DocumentRef != null })
            .ToListAsync(ct);
        var actual = (long)costRows.Where(c => c.Documented).Sum(c => c.Amount);
        var actualExceptSeed = (long)costRows.Where(c => c.Documented && c.Category != "Seed").Sum(c => c.Amount);
        var purchases = await db.ProcurementOrders.AsNoTracking().Where(p => p.BatchId == batch.BatchId && p.Status != "Cancelled")
            .Select(p => new
            {
                Accepted = db.GoodsReceipts.Where(r => r.Status == "Completed" && db.SupplyLots.Any(l => l.SupplyLotId == r.SupplyLotId && l.ProcurementOrderId == p.ProcurementOrderId))
                    .Sum(r => (int?)r.AcceptedCount) ?? 0,
                p.UnitPrice,
            }).ToListAsync(ct);
        var purchase = (long)purchases.Sum(p => p.Accepted * p.UnitPrice);
        var deductible = batch.SettlementBasis == "ActualCost" ? actual : standard;
        if (batch.LiquidationStartedAt is not null)
        {
            // BR-210 (cách tính còn mở, mục 8): khi thanh lý sớm, người nuôi chỉ được tính phần đã giải ngân và phần chi phí đã phát sinh
            // có chứng từ, không vượt Chi phí chuẩn; phần vốn chưa giải ngân trở về cho nhà đầu tư qua Pool.
            deductible = Math.Min(standard, Math.Max(disbursed, actual));
        }

        // BR-191: tỷ lệ sống = 1 − số con chết ÷ số con nhận đạt kiểm đầu vào trong số con được cấp vốn; con thả bù chết vẫn tính chết.
        var received = Math.Min(funded, await db.CrabUnits.CountAsync(c => c.BatchId == batch.BatchId && c.ReplacesCrabUnitId == null, ct));
        var dead = await db.CrabUnits.CountAsync(c => c.BatchId == batch.BatchId &&
            (db.InventoryEvents.Any(e => e.CrabUnitId == c.CrabUnitId && e.EventType == "Died") ||
             db.GradeDecisions.Any(d => d.CrabUnitId == c.CrabUnitId && d.IsCurrent && d.Status == "Rejected" && d.LiveStatus == "Dead")), ct);
        var survival = received == 0 ? 0 : Math.Clamp(decimal.Round((1 - (decimal)dead / received) * 100, 2, MidpointRounding.ToZero), 0, 100);
        var tiers = await db.RemunerationTiers.AsNoTracking().Where(t => t.BatchId == batch.BatchId).OrderBy(t => t.SurvivalFromPct).ToListAsync(ct);
        var rate = tiers.Count == 0 ? batch.BaseRemunerationPct ?? batch.OperatorSharePct
            : tiers.FirstOrDefault(t => survival >= t.SurvivalFromPct && (survival < t.SurvivalToPct || (t.SurvivalToPct >= 100 && survival <= 100)))?.RatePct
              ?? tiers.First().RatePct;
        return new Figures(revenue, byType, revenue - byType.GetValueOrDefault("ForfeitedDeposit"), refunds, batch.PlatformFeeRatePct ?? 0, standard, actual,
            actualExceptSeed, purchase, disbursed, deductible, received, dead, survival, rate);
    }

    // ---------- Xem ----------

    public async Task<IReadOnlyList<AdminSettlementSummary>> ListForAdminAsync(CancellationToken ct)
        => await db.Batches.AsNoTracking()
            .Where(b => b.Status == "Selling" || b.Status == "Liquidating" || b.Status == "AwaitingSettlement" || b.Status == "Settling" || b.Status == "Closed")
            .OrderBy(b => b.Status == "Settling" ? 0 : b.Status == "AwaitingSettlement" ? 1 : 2).ThenBy(b => b.BatchCode)
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

    /// <summary>Ai đang xem bảng: admin và người nuôi thấy mọi dòng; nhà đầu tư chỉ thấy tổng và dòng của mình (BR-204).</summary>
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
        var byType = await db.RevenueLines.AsNoTracking().Where(r => r.BatchId == s.BatchId).GroupBy(r => r.SourceType)
            .Select(g => new { g.Key, Amount = g.Sum(r => r.Amount) }).ToDictionaryAsync(x => x.Key, x => (long)x.Amount, ct);
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
        var distributable = s.SettlementMode != "P" ? 0 : pool > 0 ? pool - (long)s.OperatorRemuneration : pool;
        var sumProfit = s.SettlementLines.Sum(l => (long)l.ProfitShare);

        var lines = s.SettlementLines
            .Where(l => viewer != Viewer.Investor || l.InvestorId == userId)
            .OrderBy(l => l.InvestorId)
            .Select(l => new SettlementLineResponse(
                l.SettlementLineId, l.InvestorId, InvestorName(l.Investor), (long)l.CapitalReturn, (long)l.ProfitShare, 0,
                (long)l.NetPayout, l.InvestorId == userId,
                payouts.Where(p => p.SettlementLineId == l.SettlementLineId).MaxBy(p => p.InstructionId)?.Status))
            .ToList();
        var feedback = s.SettlementFeedbacks
            .Where(f => viewer != Viewer.Investor || f.UserId == userId)
            .OrderBy(f => f.FeedbackId)
            .Select(f => new SettlementFeedbackResponse(f.FeedbackId, f.User.FullName, f.Content, f.Status, f.Response, f.CreatedAt, f.RespondedAt, f.UserId == userId))
            .ToList();
        var breakdown = new SettlementBreakdown(s.SettlementMode, s.SettlementBasis, byType.GetValueOrDefault("PreOrderDelivered"),
            byType.GetValueOrDefault("InvoicedSale"), byType.GetValueOrDefault("ForfeitedDeposit"), byType.GetValueOrDefault("FinalOrder"),
            s.PlatformFeeRatePct, (long)s.PlatformFee, (long)s.StandardCostDeductible, (long)s.ActualCostTotal, (long)s.ExcludedFaultCost,
            (long)s.DisbursedTotal, (long)s.UndisbursedCost, (long)s.CustomerRefunds, s.ReceivedCount, s.DeadCount, s.SurvivalRatePct,
            s.CommissionPct, (long)s.CommissionAmount, (long)s.SupplierPayout, s.IsLiquidation);
        return new SettlementResponse(
            s.SettlementId, s.Batch.BatchCode, s.Batch.Title, s.Batch.Operator.LegalName, s.Batch.Status, s.Status, s.RevisionNo,
            byType.GetValueOrDefault("PreOrderDelivered") + byType.GetValueOrDefault("InvoicedSale") + byType.GetValueOrDefault("FinalOrder"),
            byType.GetValueOrDefault("ForfeitedDeposit"), (long)s.CustomerRefunds,
            (long)s.ActualRevenue, (long)s.LockedStandardCost, pool, s.OperatorSharePct, (long)s.OperatorRemuneration, distributable,
            0, 0, (long)s.UncoveredLoss, distributable - sumProfit - (long)s.UncoveredLoss,
            s.SettlementLines.Sum(l => (long)l.CapitalReturn), s.SettlementLines.Sum(l => (long)l.NetPayout), s.SettlementLines.Count,
            s.ProposedAt, s.FeedbackDeadline, s.ApprovedAt, s.CreatedAt, s.UpdatedAt, lines, feedback,
            "Bảng quyết toán không khấu trừ thuế; mỗi bên tự kê khai thuế theo quy định (Business Rule v1.5).",
            anchors.Select(a => new AuditAnchorResponse(
                a.ActionType switch { "close_capital" => "Chốt vốn", "approve" => "Duyệt quyết toán", _ => "Đóng lô" },
                a.OccurredAt, a.AuditId, a.RowHash)).ToList(),
            breakdown);
    }

    internal static string InvestorName(Investor investor)
        => investor.InvestorKind == "Organization" && !string.IsNullOrWhiteSpace(investor.OrganizationName) ? investor.OrganizationName : investor.User.FullName;

    internal static long Money(decimal value) => (long)decimal.Round(value, 0, MidpointRounding.AwayFromZero);

    private static object Snapshot(SettlementEntity s) => new
    {
        s.Status, s.RevisionNo, s.SettlementMode, s.SettlementBasis, actualRevenue = (long)s.ActualRevenue, platformFee = (long)s.PlatformFee,
        deductibleCost = (long)s.LockedStandardCost, revenuePool = (long)s.RevenuePool, s.SurvivalRatePct, s.OperatorSharePct,
        operatorRemuneration = (long)s.OperatorRemuneration, undisbursed = (long)s.UndisbursedCost, commission = (long)s.CommissionAmount,
        supplierPayout = (long)s.SupplierPayout, s.IsLiquidation,
    };

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());
}

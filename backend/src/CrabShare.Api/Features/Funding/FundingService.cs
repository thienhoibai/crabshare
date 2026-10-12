using System.Globalization;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Funding;

/// <summary>
/// UC11 xác nhận rủi ro và UC10 giữ chỗ góp vốn (TL-09, TL-17).
/// Giữ chỗ chạy trong transaction: khoá chuỗi audit rồi khoá dòng lô, nên hai người giữ chỗ cùng lúc
/// chạy lần lượt và tổng (đã xác nhận + đang giữ chỗ) không bao giờ vượt max_capital.
/// </summary>
public sealed class FundingService(
    AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock,
    IOptions<FundingOptions> options, RiskDisclosureDocuments documents)
{
    private static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

    // ---------- Xác nhận rủi ro ----------

    public async Task<RiskDisclosureResponse> GetActiveDisclosureAsync(CancellationToken ct)
    {
        var investor = await RequireInvestorAsync(ct);
        var rd = await ActiveDisclosureAsync(ct);
        var acknowledgedAt = await db.RiskAcknowledgements.AsNoTracking()
            .Where(a => a.InvestorId == investor.UserId && a.RiskDisclosureId == rd.RiskDisclosureId)
            .Select(a => (DateTimeOffset?)a.AcknowledgedAt)
            .FirstOrDefaultAsync(ct);
        return new(rd.RiskDisclosureId, rd.VersionCode, rd.EffectiveFrom, rd.ContentHash,
            documents.Read(rd.VersionCode, rd.ContentHash), acknowledgedAt);
    }

    public Task<RiskAcknowledgementResponse> AcknowledgeAsync(AcknowledgeRiskRequest req, CancellationToken ct)
    {
        if (!req.ScrolledToEnd)
            throw new BusinessRuleException("funding.must_scroll_to_end", "Hãy đọc hết bản công bố rủi ro (cuộn tới cuối) rồi mới xác nhận.");

        return db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var investor = await RequireInvestorAsync(ct);
            var rd = await ActiveDisclosureAsync(ct);
            if (rd.RiskDisclosureId != req.RiskDisclosureId)
                throw new BusinessRuleException("funding.disclosure_outdated", "Bản công bố rủi ro vừa có phiên bản mới. Tải lại trang và đọc bản mới.");

            var existing = await db.RiskAcknowledgements
                .SingleOrDefaultAsync(a => a.InvestorId == investor.UserId && a.RiskDisclosureId == rd.RiskDisclosureId, ct);
            if (existing is not null) return new RiskAcknowledgementResponse(rd.RiskDisclosureId, rd.VersionCode, existing.AcknowledgedAt);

            var now = Now();
            db.RiskAcknowledgements.Add(new RiskAcknowledgement
            {
                InvestorId = investor.UserId, RiskDisclosureId = rd.RiskDisclosureId,
                AcknowledgedAt = now, ScrolledToEnd = true, CreatedAt = now,
            });
            await audit.WriteAsync("risk_acknowledgement", investor.UserId, "acknowledge", null,
                new { rd.VersionCode, rd.ContentHash, scrolledToEnd = true }, now, ct);
            return new RiskAcknowledgementResponse(rd.RiskDisclosureId, rd.VersionCode, now);
        }, ct);
    }

    // ---------- Lô đang gọi vốn ----------

    public async Task<IReadOnlyList<FundingBatchSummary>> ListOpenAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var batches = await db.Batches.AsNoTracking()
            .Where(b => b.Status == "Funding" && b.FundingOpenAt <= now && b.FundingDeadline > now)
            .OrderBy(b => b.FundingDeadline)
            .Select(b => new
            {
                b.BatchCode, b.Title, b.CrabType, b.Operator.LegalName, b.MinContribution, b.TargetCapital, b.MaxCapital, b.FundingDeadline,
                Confirmed = b.Contributions.Where(c => c.Status == "Confirmed").Sum(c => (decimal?)c.Amount) ?? 0,
                Reserved = b.Contributions.Where(c => c.Status == "Reserved" && c.ExpiresAt > now).Sum(c => (decimal?)c.Amount) ?? 0,
            })
            .ToListAsync(ct);
        return batches.Select(b => new FundingBatchSummary(b.BatchCode, b.Title, b.CrabType, b.LegalName, (long)b.MinContribution,
            (long)b.TargetCapital, (long)b.MaxCapital, (long)b.Confirmed, (long)Math.Max(0, b.MaxCapital - b.Confirmed - b.Reserved), b.FundingDeadline))
            .ToList();
    }

    public async Task<FundingBatchResponse> GetBatchAsync(string code, CancellationToken ct)
    {
        var investor = await RequireInvestorAsync(ct);
        var batch = await db.Batches.AsNoTracking().Include(b => b.Operator).SingleOrDefaultAsync(b => b.BatchCode == code, ct)
                    ?? throw BatchNotFound();
        var now = clock.GetUtcNow();
        var contributions = await db.Contributions.AsNoTracking()
            .Where(c => c.BatchId == batch.BatchId && (c.Status == "Confirmed" || (c.Status == "Reserved" && c.ExpiresAt > now)))
            .ToListAsync(ct);
        var confirmed = contributions.Where(c => c.Status == "Confirmed").Sum(c => c.Amount);
        var reserved = contributions.Where(c => c.Status == "Reserved").Sum(c => c.Amount);
        var mine = contributions.Where(c => c.Status == "Reserved" && c.InvestorId == investor.UserId).MaxBy(c => c.ReservedAt);

        return new FundingBatchResponse(
            batch.BatchCode, batch.Title, batch.CrabType, batch.Status, batch.Operator.LegalName,
            (long)batch.MinContribution, (long)batch.MinViableCapital, (long)batch.TargetCapital, (long)batch.MaxCapital,
            (long)confirmed, (long)reserved, (long)Math.Max(0, batch.MaxCapital - confirmed - reserved),
            contributions.Where(c => c.Status == "Confirmed").Select(c => c.InvestorId).Distinct().Count(),
            batch.FundingOpenAt, batch.FundingDeadline, IsOpen(batch, now), options.Value.ReservationMinutes,
            new FundingEligibility(investor.VerificationStatus == "Verified", await HasAcknowledgedActiveAsync(investor.UserId, ct)),
            mine is null ? null : ToResponse(mine, batch, now));
    }

    // ---------- Giữ chỗ ----------

    public Task<ContributionResponse> ReserveAsync(string code, ReserveContributionRequest req, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            // Giao thức chung: khoá chuỗi audit trước, rồi khoá dòng lô tới khi commit
            await audit.LockAsync(ct);
            var investor = await RequireInvestorAsync(ct);
            if (investor.VerificationStatus != "Verified")
                throw new BusinessRuleException("funding.kyc_required", "Bạn cần xác minh danh tính (eKYC) trước khi góp vốn.");
            if (!await HasAcknowledgedActiveAsync(investor.UserId, ct))
                throw new BusinessRuleException("funding.risk_ack_required", "Bạn cần đọc và xác nhận bản công bố rủi ro trước khi góp vốn.");

            var batch = await db.Batches
                .FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_code = {code}")
                .SingleOrDefaultAsync(ct) ?? throw BatchNotFound();
            var now = Now();
            if (!IsOpen(batch, now))
                throw new BusinessRuleException("funding.not_open", "Lô này hiện không nhận góp vốn.");
            if (req.Amount < batch.MinContribution)
                throw new BusinessRuleException("funding.below_min_contribution", $"Số tiền góp tối thiểu là {Vnd(batch.MinContribution)}.");
            if (await db.Contributions.AnyAsync(c => c.BatchId == batch.BatchId && c.InvestorId == investor.UserId
                    && c.Status == "Reserved" && c.ExpiresAt > now, ct))
                throw new ConflictException("funding.reservation_exists", "Bạn đang giữ chỗ ở lô này. Hoàn tất hoặc huỷ khoản đó trước khi giữ chỗ mới.");

            var committed = await db.Contributions
                .Where(c => c.BatchId == batch.BatchId && (c.Status == "Confirmed" || (c.Status == "Reserved" && c.ExpiresAt > now)))
                .SumAsync(c => (decimal?)c.Amount, ct) ?? 0;
            var remaining = batch.MaxCapital - committed;
            if (req.Amount > remaining)
                throw new BusinessRuleException("funding.over_max_capital", remaining <= 0
                    ? "Lô đã nhận đủ vốn tối đa."
                    : $"Lô chỉ còn nhận tối đa {Vnd(remaining)}.");

            var contribution = new Contribution
            {
                BatchId = batch.BatchId, InvestorId = investor.UserId, Amount = req.Amount, Status = "Reserved",
                ReservedAt = now, ExpiresAt = now.AddMinutes(options.Value.ReservationMinutes), CreatedAt = now, UpdatedAt = now,
            };
            db.Contributions.Add(contribution);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("contribution", contribution.ContributionId, "reserve", null,
                new { batch.BatchCode, amount = req.Amount, status = contribution.Status, contribution.ExpiresAt }, now, ct);
            return ToResponse(contribution, batch, now);
        }, ct);

    public Task CancelAsync(long contributionId, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var investor = await RequireInvestorAsync(ct);
            var contribution = await db.Contributions.SingleOrDefaultAsync(c => c.ContributionId == contributionId, ct)
                               ?? throw new NotFoundException("contribution.not_found", "Không tìm thấy khoản góp.");
            if (contribution.InvestorId != investor.UserId)
                throw new ForbiddenException("contribution.not_owner", "Khoản góp này không phải của bạn.");
            var now = Now();
            if (contribution.Status != "Reserved" || contribution.ExpiresAt <= now
                || await db.PaymentRequests.AnyAsync(r => r.ContributionId == contributionId && r.Status == "Paid", ct))
                throw new BusinessRuleException("contribution.not_cancellable", "Chỉ huỷ được khoản đang giữ chỗ và chưa thanh toán.");

            // CSDL không có trạng thái "Cancelled" cho khoản góp: huỷ = hết hạn ngay
            contribution.Status = "Expired";
            contribution.ExpiresAt = now;
            contribution.UpdatedAt = now;
            foreach (var request in await db.PaymentRequests.Where(r => r.ContributionId == contributionId && r.Status == "Pending").ToListAsync(ct))
            {
                request.Status = "Cancelled";
                request.UpdatedAt = now;
            }
            await audit.WriteAsync("contribution", contributionId, "cancel_reservation", new { status = "Reserved" },
                new { status = "Expired", reason = "Nhà đầu tư huỷ giữ chỗ" }, now, ct);
        }, ct);

    public async Task<IReadOnlyList<ContributionResponse>> MineAsync(CancellationToken ct)
    {
        var investor = await RequireInvestorAsync(ct);
        var now = clock.GetUtcNow();
        var rows = await db.Contributions.AsNoTracking().Include(c => c.Batch)
            .Where(c => c.InvestorId == investor.UserId)
            .OrderByDescending(c => c.ReservedAt)
            .ToListAsync(ct);
        return rows.Select(c => ToResponse(c, c.Batch, now)).ToList();
    }

    // ---------- Dùng chung ----------

    private sealed record InvestorInfo(long UserId, string VerificationStatus);

    private async Task<InvestorInfo> RequireInvestorAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.Investor))
            throw new ForbiddenException("auth.investor_only", "Chỉ nhà đầu tư mới góp vốn được.");
        var userId = me.UserId;
        var investor = await db.Investors.AsNoTracking()
            .Where(i => i.UserId == userId)
            .Select(i => new { i.UserId, i.VerificationStatus, UserStatus = i.User.Status })
            .SingleOrDefaultAsync(ct) ?? throw new NotFoundException("funding.investor_not_found", "Không tìm thấy hồ sơ nhà đầu tư.");
        if (investor.UserStatus == "Locked")
            throw new ForbiddenException("auth.locked", "Tài khoản đã bị khoá.");
        return new InvestorInfo(investor.UserId, investor.VerificationStatus);
    }

    private async Task<RiskDisclosure> ActiveDisclosureAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        return await db.RiskDisclosures.AsNoTracking()
                   .Where(r => r.Status == "Active" && r.EffectiveFrom <= now)
                   .OrderByDescending(r => r.EffectiveFrom)
                   .FirstOrDefaultAsync(ct)
               ?? throw new NotFoundException("funding.no_active_disclosure", "Chưa có bản công bố rủi ro đang hiệu lực.");
    }

    private async Task<bool> HasAcknowledgedActiveAsync(long investorId, CancellationToken ct)
    {
        var rd = await ActiveDisclosureAsync(ct);
        return await db.RiskAcknowledgements.AnyAsync(a => a.InvestorId == investorId && a.RiskDisclosureId == rd.RiskDisclosureId, ct);
    }

    private static bool IsOpen(Batch batch, DateTimeOffset now)
        => batch.Status == "Funding" && batch.FundingOpenAt <= now && batch.FundingDeadline > now;

    /// <summary>Khoản đang giữ chỗ mà đã quá hạn hiển thị là Expired ngay (job TH-07 sẽ đổi hẳn trong CSDL).</summary>
    private static ContributionResponse ToResponse(Contribution c, Batch batch, DateTimeOffset now) => new(
        c.ContributionId, batch.BatchCode, batch.Title, (long)c.Amount,
        c.Status == "Reserved" && c.ExpiresAt <= now ? "Expired" : c.Status,
        c.ReservedAt, c.ExpiresAt, c.ConfirmedAt);

    private DateTimeOffset Now() => AuditChain.Timestamp(clock.GetUtcNow());

    private static string Vnd(decimal amount) => string.Format(Vi, "{0:N0} đ", amount);

    private static NotFoundException BatchNotFound() => new("batch.not_found", "Không tìm thấy lô.");
}

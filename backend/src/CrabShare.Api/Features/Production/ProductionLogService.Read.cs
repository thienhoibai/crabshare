using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Production;

public sealed partial class ProductionLogService
{
    private async Task RequireRoleAsync(string role, CancellationToken ct)
    {
        if (!me.IsInRole(role) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active", ct)
            || !await db.AppUserRoles.AnyAsync(r => r.UserId == me.UserId && r.RoleCode == role, ct)) throw Denied();
    }

    private async Task<bool> HasRoleAsync(string role, CancellationToken ct)
        => me.IsInRole(role) && await db.AppUserRoles.AnyAsync(r => r.UserId == me.UserId && r.RoleCode == role, ct);

    private async Task<Batch> ReadableBatchAsync(string code, CancellationToken ct)
    {
        var userId = me.UserId;
        if (!await db.AppUsers.AnyAsync(u => u.UserId == userId && u.Status == "Active", ct)) throw Denied();
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == code, ct)
            ?? throw new NotFoundException("batch.not_found", "Không tìm thấy lô.");
        if (await HasRoleAsync(Roles.PlatformAdmin, ct)) return batch;
        if (await HasRoleAsync(Roles.OperatorMember, ct))
        {
            var member = await MemberAsync(false, ct);
            if (member.OperatorId == batch.OperatorId) return batch;
        }
        if (await HasRoleAsync(Roles.Investor, ct) &&
            (await db.CapitalShares.AnyAsync(s => s.BatchId == batch.BatchId && s.InvestorId == userId, ct)
             || await db.Contributions.AnyAsync(c => c.BatchId == batch.BatchId && c.InvestorId == userId && c.Status == "Confirmed", ct))) return batch;
        throw Denied();
    }

    public async Task<ProductionThresholdState> ThresholdsAsync(string code, CancellationToken ct)
    {
        var batch = await ReadableBatchAsync(code, ct);
        var current = await CurrentThresholdAsync(batch.BatchId, ct);
        var canConfigure = false;
        var canRecord = false;
        if (await HasRoleAsync(Roles.OperatorMember, ct))
        {
            var member = await MemberAsync(false, ct);
            var approved = member.OperatorId == batch.OperatorId && await db.Operators.AnyAsync(o => o.OperatorId == member.OperatorId && o.Status == "Approved", ct);
            canConfigure = approved && member.MemberRole == "Owner" && IsConfigurationState(batch.Status);
            canRecord = approved && current is not null && IsRecordingState(batch.Status);
        }
        return new(Today(), canConfigure, canRecord, current is null ? null : ThresholdResponse(current));
    }

    public async Task<PagedResult<ProductionLogResponse>> ListAsync(string code, ProductionLogFilter filter, PageQuery paging, CancellationToken ct)
    {
        var batch = await ReadableBatchAsync(code, ct);
        return await ReadLogsAsync(db.ProductionLogs.Where(l => l.BatchId == batch.BatchId), filter, paging, ct);
    }

    public async Task<PagedResult<ProductionLogResponse>> ListMineAsync(ProductionLogFilter filter, PageQuery paging, CancellationToken ct)
    {
        var member = await MemberAsync(false, ct);
        return await ReadLogsAsync(db.ProductionLogs.Where(l => l.Batch.OperatorId == member.OperatorId), filter, paging, ct);
    }

    private static IQueryable<ProductionLog> FilterLogs(IQueryable<ProductionLog> query, ProductionLogFilter filter)
    {
        if (filter.From is { } from) query = query.Where(l => l.LogDate >= from);
        if (filter.To is { } to) query = query.Where(l => l.LogDate <= to);
        return query;
    }

    private static async Task<PagedResult<ProductionLogResponse>> ReadLogsAsync(IQueryable<ProductionLog> query, ProductionLogFilter filter, PageQuery paging, CancellationToken ct)
    {
        BatchService.Validate(filter); BatchService.Validate(paging);
        var page = await FilterLogs(query, filter).AsNoTracking().Include(l => l.Batch).Include(l => l.ThresholdVersion)
            .OrderByDescending(l => l.LogDate).ThenByDescending(l => l.ProductionLogId).ToPagedAsync(paging, ct);
        return new(page.Items.Select(LogResponse).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<PagedResult<ProductionBatchResponse>> BatchesAsync(PageQuery paging, CancellationToken ct)
    {
        BatchService.Validate(paging);
        var member = await MemberAsync(false, ct);
        var batches = await db.Batches.AsNoTracking().Where(b => b.OperatorId == member.OperatorId &&
            (b.Status == "Stocked" || b.Status == "InProduction" || b.Status == "Harvesting"))
            .OrderByDescending(b => b.CreatedAt).ThenByDescending(b => b.BatchId).ToPagedAsync(paging, ct);
        var ids = batches.Items.Select(b => b.BatchId).ToArray();
        var today = Today();
        if (ids.Length == 0) return new([], batches.Page, batches.PageSize, batches.Total);
        var latest = await db.ProductionLogs.AsNoTracking().Where(l => ids.Contains(l.BatchId) &&
            !db.ProductionLogs.Any(other => other.BatchId == l.BatchId && (other.LogDate > l.LogDate || (other.LogDate == l.LogDate && other.ProductionLogId > l.ProductionLogId))))
            .Include(l => l.Batch).Include(l => l.ThresholdVersion).ToDictionaryAsync(l => l.BatchId, ct);
        var logged = await db.ProductionLogs.Where(l => ids.Contains(l.BatchId) && l.LogDate == today && l.Source == "Manual").Select(l => l.BatchId).ToListAsync(ct);
        var configured = await db.ProductionThresholdVersions.Where(v => ids.Contains(v.BatchId)).Select(v => v.BatchId).Distinct().ToListAsync(ct);
        var alive = await db.CrabItems.Where(c => ids.Contains(c.BatchId) && c.Status == "Growing").GroupBy(c => c.BatchId).Select(g => new { BatchId = g.Key, Count = g.Count() }).ToDictionaryAsync(g => g.BatchId, g => g.Count, ct);
        var approved = await db.Operators.AnyAsync(o => o.OperatorId == member.OperatorId && o.Status == "Approved", ct);
        var result = batches.Items.Select(b => new ProductionBatchResponse(b.BatchCode, b.Title, b.CrabType, b.Status, b.CycleDays, b.SeedQuantity,
            alive.GetValueOrDefault(b.BatchId), b.StockedAt is { } stocked ? today.DayNumber - DateOnly.FromDateTime(stocked.ToOffset(VietnamOffset).DateTime).DayNumber + 1 : null,
            latest.TryGetValue(b.BatchId, out var log) ? LogResponse(log) : null, logged.Contains(b.BatchId),
            approved && IsRecordingState(b.Status) && configured.Contains(b.BatchId), today)).ToList();
        return new(result, batches.Page, batches.PageSize, batches.Total);
    }
}

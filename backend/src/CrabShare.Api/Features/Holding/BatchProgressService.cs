using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Holding;

/// <param name="DeadCrabs">Chỉ có với người tham gia Lô (BR-143).</param>
/// <param name="RestockedCrabs">Chỉ có với người tham gia Lô (BR-143).</param>
public sealed record BatchProgressResponse(string BatchCode, string Status, int CrabsAlive, int? DaysRaised, bool IsParticipant,
    int? DeadCrabs, int? RestockedCrabs, int? GradedCrabs, int? DeliveredOrSoldCrabs);

/// <summary>
/// Tiến độ Lô theo quyền xem (BR-142, BR-143, BR-220): người không tham gia Lô chỉ thấy số cua đang nuôi và số ngày đã nuôi; số cua chết,
/// số con thả bù và các số khác chỉ hiện cho người tham gia (nhà đầu tư, khách có đơn, người nuôi, Nhân viên kiểm phẩm, Admin).
/// </summary>
public sealed class BatchProgressService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    private static readonly string[] AtFarm = ["Received", "Holding", "Graded", "Allocated"];

    public async Task<BatchProgressResponse> GetAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        if (batch.Status is "Draft" or "PendingApproval" or "NeedsRevision" or "Rejected")
            throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        var alive = await db.CrabUnits.CountAsync(c => c.BatchId == batch.BatchId && AtFarm.Contains(c.InventoryStatus), ct);
        var since = batch.StockedAt ?? await db.CrabUnits.Where(c => c.BatchId == batch.BatchId).MinAsync(c => (DateTimeOffset?)c.ReceivedAt, ct);
        int? days = since is { } s ? Math.Max(0, (int)(clock.GetUtcNow() - s).TotalDays) : null;
        if (!await ParticipantAsync(batch.BatchId, batch.OperatorId, ct))
            return new BatchProgressResponse(batch.BatchCode, batch.Status, alive, days, false, null, null, null, null);
        var counts = await db.CrabUnits.Where(c => c.BatchId == batch.BatchId).GroupBy(c => c.InventoryStatus)
            .Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var restocked = await db.CrabUnits.CountAsync(c => c.BatchId == batch.BatchId && c.ReplacesCrabUnitId != null, ct);
        var graded = await db.GradeDecisions.CountAsync(d => d.BatchId == batch.BatchId && d.IsCurrent && d.Status == "Approved", ct);
        return new BatchProgressResponse(batch.BatchCode, batch.Status, alive, days, true, counts.GetValueOrDefault("Dead") + counts.GetValueOrDefault("Destroyed"),
            restocked, graded, counts.GetValueOrDefault("Delivered") + counts.GetValueOrDefault("Sold"));
    }

    private async Task<bool> ParticipantAsync(long batchId, long operatorId, CancellationToken ct)
    {
        if (!me.IsAuthenticated) return false;
        if (me.IsInRole(Roles.PlatformAdmin) || me.IsInRole(Roles.QcInspector)) return true;
        var userId = me.UserId;
        return await db.OperatorMembers.AnyAsync(m => m.UserId == userId && m.OperatorId == operatorId, ct)
               || await db.CapitalShares.AnyAsync(s => s.BatchId == batchId && s.InvestorId == userId, ct)
               || await db.Contributions.AnyAsync(c => c.BatchId == batchId && c.InvestorId == userId && c.Status == "Confirmed", ct)
               || await db.SalesOrders.AnyAsync(o => o.BatchId == batchId && o.CustomerId == userId && o.Status != "Cancelled", ct);
    }
}

[ApiController]
public sealed class BatchProgressController(BatchProgressService progress) : ControllerBase
{
    [HttpGet("api/batches/{code}/progress"), AllowAnonymous]
    [EndpointSummary("Tiến độ Lô: công khai số cua đang nuôi và số ngày nuôi; người tham gia thấy thêm số chết, thả bù (BR-143)")]
    public async Task<ActionResult<BatchProgressResponse>> Get(string code, CancellationToken ct) => Ok(await progress.GetAsync(code, ct));
}

using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Offtake;

/// <summary>
/// Kg đang trong cửa sổ ưu tiên, chưa có đơn Offtake còn hiệu lực.
/// Gian hàng và checkout trừ phần này khỏi hàng tươi bán lẻ; nhận hàng thì chuyển thành giữ chỗ của đơn.
/// </summary>
public static class OfftakeStock
{
    public const int WindowHours = 48;

    public static IQueryable<OfftakeCommitment> Unclaimed(IQueryable<OfftakeCommitment> query) =>
        query.Where(o => o.Status == "WindowOpen"
                         && o.DepositStatus == "Held"
                         && !o.SalesOrders.Any(s => s.Status != "Cancelled"));

    public static async Task<decimal> HoldKgAsync(AppDbContext db, long batchId, long gradeId, long? exceptOfftakeId, CancellationToken ct)
    {
        var query = Unclaimed(db.OfftakeCommitments.AsNoTracking())
            .Where(o => o.BatchId == batchId && o.GradeId == gradeId);
        if (exceptOfftakeId is { } id)
            query = query.Where(o => o.OfftakeId != id);
        return await query.SumAsync(o => (decimal?)o.CommittedQtyKg, ct) ?? 0m;
    }
}

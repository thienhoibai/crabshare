using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Delivery;

/// <summary>
/// Trang truy xuất của mã QR đơn (BR-162, BR-163): ai có mã đều xem Lô, trại, vùng xuất xứ và ngày thu của các lô nguồn, quy cách đã duyệt
/// của các dòng đã giao; không hiển thị thông tin cá nhân của khách hay nhà đầu tư, không có mã từng con.
/// </summary>
public sealed class OrderTraceService(AppDbContext db)
{
    public const string StandardNote = "Quy cách theo chuẩn phân hạng nội bộ tham chiếu T/SCFA 0014-2024, không phải chứng nhận (BR-038).";

    public async Task<OrderTraceResponse> TraceAsync(string traceCode, CancellationToken ct)
    {
        var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(o => o.TraceCode == traceCode.Trim().ToUpperInvariant(), ct)
                    ?? throw new NotFoundException("trace.not_found", "Không tìm thấy mã QR đơn.");
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == order.BatchId, ct);
        var farmName = await db.Operators.AsNoTracking().Where(o => o.OperatorId == batch.OperatorId).Select(o => o.LegalName).SingleAsync(ct);
        var crabIds = await db.InventoryAllocations.Where(a => a.OrderId == order.OrderId && a.Status != "Released").Select(a => a.CrabUnitId).ToListAsync(ct);
        var lots = await db.SupplyLots.AsNoTracking().Where(l => db.CrabUnits.Any(c => crabIds.Contains(c.CrabUnitId) && c.SupplyLotId == l.SupplyLotId))
            .OrderBy(l => l.HarvestedOn).Select(l => new TraceSourceLot(l.OriginRegion, l.HarvestedOn, l.DeclaredSpecies)).ToListAsync(ct);
        var lines = await (from a in db.InventoryAllocations
                           join s in db.ProductSpecifications on a.CrabSpecId equals s.SpecId
                           where a.OrderId == order.OrderId && a.Status != "Released"
                           group a by new { s.SpecCode, s.Name } into g
                           orderby g.Key.SpecCode
                           select new TraceLine(g.Key.SpecCode, g.Key.Name, g.Count())).ToListAsync(ct);
        var deliveries = await db.Shipments.Where(s => s.OrderId == order.OrderId && s.DeliveredAt != null).OrderBy(s => s.DeliveredAt)
            .Select(s => s.DeliveredAt!.Value).ToListAsync(ct);
        return new OrderTraceResponse(order.TraceCode!, batch.BatchCode, batch.Title, batch.CrabType, farmName, lots, lines, deliveries, StandardNote);
    }
}

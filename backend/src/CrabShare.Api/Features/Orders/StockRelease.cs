using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Trả tồn khi giữ chỗ không còn hiệu lực (huỷ đơn, hết hạn thanh toán — TL-28 §8). Dùng chung cho
/// <see cref="OrderCancellationService"/> và <see cref="ReservationExpiryService"/>; gọi bên trong transaction của bên gọi.
/// Mọi câu đều là UPDATE có điều kiện trạng thái: giữ chỗ đã được bên khác (webhook, lần chạy trước) đổi thì bỏ qua,
/// không trả tồn hai lần. Không đổi listing.updated_at (concurrency token của việc đổi giá).
/// </summary>
public static class StockRelease
{
    /// <summary>Kết quả trả tồn của một giữ chỗ: số kg đã trả và trả vào cột nào.</summary>
    public sealed record Released(long StockReservationId, long ListingId, decimal QuantityKg, string From);

    /// <summary>
    /// Giữ chỗ <c>Active</c> (chưa trả tiền): tồn gốc chưa bị trừ, chỉ cần trả <c>reserved_qty_kg</c>.
    /// Giữ chỗ <c>Committed</c> (đã trả tiền, tồn gốc đã trừ khi cam kết): cộng lại <c>stock_qty_kg</c>.
    /// Đã <c>Released</c> hoặc bị đổi đồng thời: trả null.
    /// </summary>
    public static async Task<Released?> ReleaseAsync(AppDbContext db, StockReservation reservation, DateTimeOffset now, CancellationToken ct)
    {
        var id = reservation.StockReservationId;
        var qty = reservation.QuantityKg;

        if (await MarkReleasedAsync(db, id, "Active", now, ct))
        {
            // Không âm: nếu dữ liệu lệch thì về 0 chứ không ném lỗi làm hỏng cả giao dịch huỷ.
            await db.ProductListings.Where(l => l.ListingId == reservation.ListingId)
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.ReservedQtyKg,
                    l => l.ReservedQtyKg >= qty ? l.ReservedQtyKg - qty : 0m), ct);
            return new Released(id, reservation.ListingId, qty, "reserved");
        }

        if (await MarkReleasedAsync(db, id, "Committed", now, ct))
        {
            await db.ProductListings.Where(l => l.ListingId == reservation.ListingId)
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.StockQtyKg, l => l.StockQtyKg + qty), ct);
            return new Released(id, reservation.ListingId, qty, "stock");
        }

        return null;
    }

    private static async Task<bool> MarkReleasedAsync(AppDbContext db, long reservationId, string expected, DateTimeOffset now, CancellationToken ct)
        => await db.StockReservations
            .Where(r => r.StockReservationId == reservationId && r.Status == expected)
            .ExecuteUpdateAsync(s => s
                .SetProperty(r => r.Status, "Released")
                .SetProperty(r => r.UpdatedAt, now), ct) == 1;
}

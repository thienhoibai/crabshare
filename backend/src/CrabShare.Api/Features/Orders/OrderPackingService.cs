using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// UC29 Đóng gói đơn bằng quét tem (NH-09). Tem Active, cua InStock, đúng lô/hạng, đủ kg → cua Packed + event Packed, đơn Packed.
/// </summary>
public sealed class OrderPackingService(AppDbContext db, ICurrentUser me, IAuditLog audit, TimeProvider clock)
{
    private static readonly HashSet<string> AllowedListStatus = ["Paid", "Packed", "Shipping", "Delivered", "Completed"];

    public async Task<IReadOnlyList<OperatorOrderSummaryResponse>> ListMineAsync(string? status, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var filter = NormalizeListStatus(status);
        return await db.SalesOrders.AsNoTracking()
            .Where(o => o.Batch.OperatorId == operatorId && o.Status == filter)
            .OrderBy(o => o.PaidAt ?? o.PlacedAt).ThenBy(o => o.OrderId)
            .Select(o => new OperatorOrderSummaryResponse(
                o.OrderNo, o.Status, o.PlacedAt, o.PaidAt, o.Batch.BatchCode, o.Customer.FullName,
                o.OrderLines.Count, o.OrderLines.Sum(l => l.QuantityKg), (long)o.TotalAmount))
            .ToListAsync(ct);
    }

    public async Task<OperatorOrderDetailResponse> GetMineAsync(string orderNo, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var order = await DetailQuery().AsNoTracking().FirstOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw OrderNotFound();
        EnsureOwned(order, operatorId);
        return ToDetail(order);
    }

    public Task<OperatorOrderDetailResponse> PackAsync(string orderNo, PackOrderRequest req, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var actorId = me.UserId;
        var codes = NormalizeCodes(req.TagCodes);
        return db.InTransactionAsync(async () =>
        {
            var order = await DetailQuery().FirstOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                        ?? throw OrderNotFound();
            EnsureOwned(order, operatorId);
            if (order.Status != "Paid")
                throw new BusinessRuleException(PackingErrors.OrderNotPaid, "Chỉ đóng gói được đơn đang ở trạng thái đã thanh toán (Paid).")
                    { Details = new { orderNo, status = order.Status } };

            var tags = await db.CrabTags.Include(t => t.CrabItem)
                .Where(t => codes.Contains(t.TagCode))
                .ToListAsync(ct);
            var byCode = tags.ToDictionary(t => t.TagCode.Trim(), StringComparer.OrdinalIgnoreCase);
            var fills = order.OrderLines.Select(l => new LineFill(l)).ToList();
            var now = clock.GetUtcNow();
            var packed = new List<(CrabTag Tag, OrderLine Line)>();

            foreach (var code in codes)
            {
                if (!byCode.TryGetValue(code, out var tag) || tag.Status != "Active")
                    throw new BusinessRuleException(PackingErrors.TagNotActive, $"Tem {code} không tồn tại hoặc chưa kích hoạt.")
                        { Details = new { tagCode = code } };
                var crab = tag.CrabItem;
                if (crab.Status != "InStock")
                    throw new BusinessRuleException(PackingErrors.CrabNotInStock, $"Cua của tem {code} không còn trong kho.")
                        { Details = new { tagCode = code, status = crab.Status } };
                if (crab.BatchId != order.BatchId)
                    throw new BusinessRuleException(PackingErrors.WrongBatch, $"Tem {code} thuộc lô khác với đơn {orderNo}.")
                        { Details = new { tagCode = code, orderNo } };
                var gradeId = crab.GradeId
                              ?? throw new BusinessRuleException(PackingErrors.WrongGrade, $"Tem {code} chưa có hạng.")
                                  { Details = new { tagCode = code } };
                if (fills.All(f => f.Line.ProductListing.GradeId != gradeId))
                    throw new BusinessRuleException(PackingErrors.WrongGrade, $"Hạng của tem {code} không có trong đơn {orderNo}.")
                        { Details = new { tagCode = code, orderNo } };
                var fill = fills.FirstOrDefault(f => f.Line.ProductListing.GradeId == gradeId && f.AssignedKg < f.Line.QuantityKg);
                if (fill is null)
                    throw new BusinessRuleException(PackingErrors.LineAlreadyFull, $"Mọi dòng hạng của tem {code} đã đủ kg.")
                        { Details = new { tagCode = code } };

                fill.AssignedKg += ToKg(crab.WeightG!.Value);
                packed.Add((tag, fill.Line));
            }

            var shortLines = fills.Where(f => f.AssignedKg < f.Line.QuantityKg).ToList();
            if (shortLines.Count > 0)
                throw new BusinessRuleException(PackingErrors.NotEnoughWeight, "Tổng khối lượng cua quét chưa đủ số kg khách đặt.")
                {
                    Details = shortLines.Select(f => new
                    {
                        orderLineId = f.Line.OrderLineId,
                        gradeCode = f.Line.ProductListing.Grade.GradeCode,
                        quantityKg = f.Line.QuantityKg,
                        assignedKg = f.AssignedKg,
                    }).ToList(),
                };

            foreach (var (tag, line) in packed)
            {
                var crab = tag.CrabItem;
                crab.Status = "Packed";
                crab.OrderLineId = line.OrderLineId;
                crab.UpdatedAt = now;
                crab.CrabTag = tag;
                if (!line.CrabItems.Contains(crab)) line.CrabItems.Add(crab);
                db.CrabItemEvents.Add(new CrabItemEvent
                {
                    CrabItemId = crab.CrabItemId,
                    EventType = "Packed",
                    OccurredAt = now,
                    ActorId = actorId,
                    TagId = tag.TagId,
                });
            }

            var before = order.Status;
            order.Status = "Packed";
            order.UpdatedAt = now;
            await audit.WriteAsync("sales_order", order.OrderId, "pack", new { status = before },
                new { status = "Packed", tagCodes = codes, packedCount = packed.Count }, now, ct);

            return ToDetail(order);
        }, ct);
    }

    private IQueryable<SalesOrder> DetailQuery() => db.SalesOrders
        .Include(o => o.Batch)
        .Include(o => o.Customer)
        .Include(o => o.OrderLines).ThenInclude(l => l.ProductListing).ThenInclude(p => p.Grade)
        .Include(o => o.OrderLines).ThenInclude(l => l.CrabItems).ThenInclude(c => c.CrabTag);

    private static void EnsureOwned(SalesOrder order, long operatorId)
    {
        if (order.Batch.OperatorId != operatorId)
            throw new ForbiddenException("pack.order_forbidden", "Đơn này không thuộc hộ nuôi của bạn.");
    }

    private static NotFoundException OrderNotFound() =>
        new(PackingErrors.OrderNotFound, "Không tìm thấy đơn hàng.");

    private static string NormalizeListStatus(string? status)
    {
        var value = string.IsNullOrWhiteSpace(status) ? "Paid" : status.Trim();
        if (!AllowedListStatus.Contains(value))
            throw new AppException(StatusCodes.Status400BadRequest, PackingErrors.InvalidStatus,
                "Tham số status chỉ nhận Paid, Packed, Shipping, Delivered hoặc Completed.");
        return value;
    }

    private static List<string> NormalizeCodes(IEnumerable<string> raw)
    {
        var codes = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in raw)
        {
            var code = ExtractTagCode(item)
                       ?? throw new BusinessRuleException(PackingErrors.TagNotActive, "Mã tem không hợp lệ.")
                           { Details = new { tagCode = item } };
            if (!seen.Add(code))
                throw new BusinessRuleException(PackingErrors.DuplicateTag, $"Mã tem {code} bị quét trùng trong cùng lần đóng gói.")
                    { Details = new { tagCode = code } };
            codes.Add(code);
        }
        return codes;
    }

    internal static string? ExtractTagCode(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var text = raw.Trim().ToUpperInvariant();
        var slash = text.LastIndexOf('/');
        if (slash >= 0 && slash < text.Length - 1) text = text[(slash + 1)..];
        var chars = text.Where(char.IsLetterOrDigit).ToArray();
        if (chars.Length >= 12) text = new string(chars[^12..]);
        else text = new string(chars);
        return text.Length == 12 ? text : null;
    }

    private static OperatorOrderDetailResponse ToDetail(SalesOrder order)
    {
        var batchCode = order.Batch.BatchCode;
        var lines = order.OrderLines.OrderBy(l => l.OrderLineId).Select(l => ToLine(l, batchCode)).ToList();
        return new OperatorOrderDetailResponse(
            order.OrderNo, order.Status, order.PlacedAt, order.PaidAt, batchCode,
            order.Customer.FullName, order.RecipientName, order.RecipientPhone, order.ShippingAddress,
            (long)order.TotalAmount, lines.Sum(l => l.QuantityKg), lines,
            OrderFulfilmentService.ToShipment(order));
    }

    private static OperatorOrderLineResponse ToLine(OrderLine line, string batchCode)
    {
        var packed = line.CrabItems.Where(c => c.Status is "Packed" or "Sold").OrderBy(c => c.CrabItemId).ToList();
        var assignedKg = ToKg(packed.Sum(c => c.WeightG ?? 0));
        var tags = packed.Select(c => new PackedTagResponse(c.CrabTag?.TagCode.Trim() ?? "", c.WeightG ?? 0,
            line.ProductListing.Grade.GradeCode)).ToList();
        return new OperatorOrderLineResponse(
            line.OrderLineId, line.ListingId, line.ProductListing.Title, batchCode,
            line.ProductListing.Grade.GradeCode, line.ProductListing.Grade.GradeName, line.QuantityKg, assignedKg, packed.Count, tags);
    }

    private static decimal ToKg(int grams) => Math.Round(grams / 1000m, 3);

    private sealed class LineFill(OrderLine line)
    {
        public OrderLine Line { get; } = line;
        public decimal AssignedKg { get; set; } = ToKg(line.CrabItems.Where(c => c.Status == "Packed").Sum(c => c.WeightG ?? 0));
    }
}

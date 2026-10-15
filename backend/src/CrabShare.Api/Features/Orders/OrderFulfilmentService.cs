using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// UC30 (NH-10). Hộ nuôi giao cho nhà xe (Packed → Shipping) rồi báo đã giao (Shipping → Delivered); khách xác nhận đã nhận.
/// Nền tảng chỉ ghi lại thông tin hộ nuôi khai, không vận chuyển, không thu phí ship (BR-52, TL-31).
/// Mỗi thao tác: một transaction, khoá chuỗi audit trước khi đọc, UPDATE có điều kiện theo trạng thái cũ.
/// Sang Delivered: cua Packed của đơn → Sold + crab_item_event Delivered; hạn đổi trả = lúc giao + Orders:ReturnWindowHours.
/// </summary>
public sealed class OrderFulfilmentService(
    AppDbContext db,
    ICurrentUser me,
    IAuditLog audit,
    TimeProvider clock,
    IOptions<OrderOptions> options,
    OrderPackingService packing,
    OrderQueryService queries)
{
    public const string ShipAction = "ship";
    public const string DeliverAction = "deliver";
    public const string ReceiveAction = "receive";

    /// <summary>Khách còn bấm "Đã nhận hàng" được không: đang giao, hoặc hộ nuôi đã báo giao mà khách chưa xác nhận.</summary>
    public static bool CanConfirmReceipt(string status, DateTimeOffset? receivedAt)
        => status == "Shipping" || (status == "Delivered" && receivedAt is null);

    public static OrderShipmentResponse? ToShipment(SalesOrder o)
        => o.ShippedAt is null && o.DeliveredAt is null
            ? null
            : new OrderShipmentResponse(o.CarrierName, o.VehiclePlate, o.DriverPhone, o.ExpectedArrivalAt, o.ShippingNote,
                o.ShippedAt, o.DeliveredAt, o.ReceivedAt, o.ReturnWindowEndsAt, o.CompletedAt);

    public async Task<OperatorOrderDetailResponse> ShipAsync(string orderNo, ShipOrderRequest req, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var carrier = req.CarrierName.Trim();
        var plate = Clean(req.VehiclePlate)?.ToUpperInvariant();
        var phone = req.DriverPhone.Trim();
        var note = Clean(req.Note);
        DateTimeOffset? eta = req.ExpectedArrivalAt is { } at ? AuditChain.Timestamp(at.ToUniversalTime()) : null;
        if (eta is { } e && (e < now.AddMinutes(-5) || e > now.AddDays(7)))
            throw new BusinessRuleException(FulfilmentErrors.EtaInvalid,
                "Giờ xe dự kiến đến phải trong khoảng từ bây giờ tới 7 ngày sau.")
            { Details = new { expectedArrivalAt = eta } };

        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var order = await LoadForOperatorAsync(orderNo, operatorId, ct);
            EnsureStatus(order, "Packed");
            var changed = await db.SalesOrders
                .Where(o => o.OrderId == order.OrderId && o.Status == "Packed")
                .ExecuteUpdateAsync(s => s
                    .SetProperty(o => o.Status, "Shipping")
                    .SetProperty(o => o.ShippedAt, now)
                    .SetProperty(o => o.CarrierName, carrier)
                    .SetProperty(o => o.VehiclePlate, plate)
                    .SetProperty(o => o.DriverPhone, phone)
                    .SetProperty(o => o.ExpectedArrivalAt, eta)
                    .SetProperty(o => o.ShippingNote, note)
                    .SetProperty(o => o.UpdatedAt, now), ct);
            if (changed == 0) throw StatusChanged();
            await audit.WriteAsync("sales_order", order.OrderId, ShipAction, new { status = "Packed" },
                new
                {
                    status = "Shipping",
                    shippedAt = now,
                    carrierName = carrier,
                    vehiclePlate = plate,
                    driverPhone = phone,
                    expectedArrivalAt = eta,
                    note,
                }, now, ct);
        }, ct);
        return await packing.GetMineAsync(orderNo, ct);
    }

    public async Task<OperatorOrderDetailResponse> DeliverAsync(string orderNo, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var actorId = me.UserId;
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var windowEnds = now.AddHours(options.Value.ReturnWindowHours);

        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var order = await LoadForOperatorAsync(orderNo, operatorId, ct);
            EnsureStatus(order, "Shipping");
            var changed = await db.SalesOrders
                .Where(o => o.OrderId == order.OrderId && o.Status == "Shipping")
                .ExecuteUpdateAsync(s => s
                    .SetProperty(o => o.Status, "Delivered")
                    .SetProperty(o => o.DeliveredAt, now)
                    .SetProperty(o => o.ReturnWindowEndsAt, windowEnds)
                    .SetProperty(o => o.UpdatedAt, now), ct);
            if (changed == 0) throw StatusChanged();
            var sold = await MarkCrabsSoldAsync(order.OrderId, order.OrderNo, actorId, now, ct);
            await audit.WriteAsync("sales_order", order.OrderId, DeliverAction, new { status = "Shipping" },
                new { status = "Delivered", deliveredAt = now, returnWindowEndsAt = windowEnds, soldCrabs = sold }, now, ct);
        }, ct);
        return await packing.GetMineAsync(orderNo, ct);
    }

    public async Task<OrderTrackingResponse> ReceiveAsync(string orderNo, CancellationToken ct)
    {
        var customerId = me.UserId;
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var windowEnds = now.AddHours(options.Value.ReturnWindowHours);

        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                        ?? throw new NotFoundException("order.not_found", "Không tìm thấy đơn hàng.");
            if (order.CustomerId != customerId)
                throw new ForbiddenException("order.not_owner", "Đơn hàng này không phải của bạn.");
            if (order.Status == "Delivered" && order.ReceivedAt is not null) return; // đã xác nhận trước đó: không ghi lại

            if (order.Status == "Shipping")
            {
                var changed = await db.SalesOrders
                    .Where(o => o.OrderId == order.OrderId && o.Status == "Shipping")
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(o => o.Status, "Delivered")
                        .SetProperty(o => o.DeliveredAt, now)
                        .SetProperty(o => o.ReceivedAt, now)
                        .SetProperty(o => o.ReturnWindowEndsAt, windowEnds)
                        .SetProperty(o => o.UpdatedAt, now), ct);
                if (changed == 0) throw StatusChanged();
                var sold = await MarkCrabsSoldAsync(order.OrderId, order.OrderNo, customerId, now, ct);
                await audit.WriteAsync("sales_order", order.OrderId, ReceiveAction, new { status = "Shipping" },
                    new { status = "Delivered", deliveredAt = now, receivedAt = now, returnWindowEndsAt = windowEnds, soldCrabs = sold }, now, ct);
                return;
            }

            if (order.Status == "Delivered")
            {
                var changed = await db.SalesOrders
                    .Where(o => o.OrderId == order.OrderId && o.Status == "Delivered" && o.ReceivedAt == null)
                    .ExecuteUpdateAsync(s => s.SetProperty(o => o.ReceivedAt, now).SetProperty(o => o.UpdatedAt, now), ct);
                if (changed == 0) throw StatusChanged();
                await audit.WriteAsync("sales_order", order.OrderId, ReceiveAction,
                    new { status = "Delivered", receivedAt = (DateTimeOffset?)null },
                    new { status = "Delivered", receivedAt = now, order.ReturnWindowEndsAt }, now, ct);
                return;
            }

            throw InvalidStatus(order, "Shipping", "Delivered");
        }, ct);
        return await queries.GetMineAsync(orderNo, ct);
    }

    private async Task<SalesOrder> LoadForOperatorAsync(string orderNo, long operatorId, CancellationToken ct)
    {
        var order = await db.SalesOrders.AsNoTracking().Include(o => o.Batch)
                        .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException(FulfilmentErrors.OrderNotFound, "Không tìm thấy đơn hàng.");
        if (order.Batch.OperatorId != operatorId)
            throw new ForbiddenException(FulfilmentErrors.OrderForbidden, "Đơn này không thuộc hộ nuôi của bạn.");
        return order;
    }

    private static void EnsureStatus(SalesOrder order, string allowed)
    {
        if (order.Status != allowed) throw InvalidStatus(order, allowed);
    }

    private static BusinessRuleException InvalidStatus(SalesOrder order, params string[] allowed)
        => new(FulfilmentErrors.InvalidStatus,
            $"Đơn {order.OrderNo} đang ở trạng thái {order.Status}, thao tác này chỉ dùng cho đơn {string.Join(" hoặc ", allowed)}.")
        { Details = new { orderNo = order.OrderNo, status = order.Status, allowed } };

    private static ConflictException StatusChanged()
        => new(FulfilmentErrors.StatusChanged, "Trạng thái đơn vừa thay đổi, hãy tải lại rồi thử lại.");

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Cua đã đóng vào đơn rời trại tới tay khách: Packed → Sold, mỗi con một event Delivered (giống dữ liệu demo).</summary>
    private async Task<int> MarkCrabsSoldAsync(long orderId, string orderNo, long actorId, DateTimeOffset now, CancellationToken ct)
    {
        var crabs = await db.CrabItems.AsNoTracking()
            .Where(c => c.OrderLine != null && c.OrderLine.OrderId == orderId && c.Status == "Packed")
            .Select(c => new { c.CrabItemId, TagId = c.CrabTag == null ? (long?)null : c.CrabTag.TagId })
            .ToListAsync(ct);
        if (crabs.Count == 0) return 0;
        var ids = crabs.Select(c => c.CrabItemId).ToList();
        await db.CrabItems
            .Where(c => ids.Contains(c.CrabItemId) && c.Status == "Packed")
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, "Sold").SetProperty(c => c.UpdatedAt, now), ct);
        foreach (var crab in crabs)
        {
            db.CrabItemEvents.Add(new CrabItemEvent
            {
                CrabItemId = crab.CrabItemId,
                EventType = "Delivered",
                OccurredAt = now,
                ActorId = actorId,
                TagId = crab.TagId,
                Note = orderNo,
            });
        }
        return crabs.Count;
    }
}

using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Features.Sales;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Delivery;

/// <summary>
/// Giao hàng theo đợt (BR-161 – BR-168, BR-234): đơn vị thực hiện lập chuyến giao cho từng đợt, cân lần một khi xuất, cân lần hai khi nhận;
/// khách xác nhận biên bản nghiệm thu; tiền hàng theo kg nghiệm thu × giá mỗi kg của quy cách; cọc trừ dần trên cả đơn; phần còn lại trả qua VietQR.
/// Nền tảng ghi nhận và xác nhận kết quả, không quản lý xe và tuyến.
/// </summary>
public sealed class DeliveryService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access,
    AllocationService allocations, SalesLedger ledger, PaymentRequestService payments, PlatformParameters parameters)
{
    // ---------- Người nuôi: đợt giao, chuyến giao ----------

    /// <summary>Các đợt giao của Lô kèm số con đã phân bổ theo từng dòng (BR-160, BR-234).</summary>
    public async Task<IReadOnlyList<TrancheStatusResponse>> TranchesAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var orders = await db.SalesOrders.AsNoTracking().Where(o => o.BatchId == batch.BatchId && o.OrderType == "PreOrder" &&
            (OrderStatus.Allocatable.Contains(o.Status) || o.Status == OrderStatus.Delivered || o.Status == OrderStatus.Completed)).ToListAsync(ct);
        var orderIds = orders.Select(o => o.OrderId).ToList();
        var tranches = await db.DeliveryTranches.AsNoTracking().Include(t => t.Lines).Where(t => orderIds.Contains(t.OrderId))
            .OrderBy(t => t.DueDate).ThenBy(t => t.Seq).ToListAsync(ct);
        var lines = await db.SalesOrderLines.AsNoTracking().Include(l => l.Spec).Where(l => orderIds.Contains(l.OrderId)).ToDictionaryAsync(l => l.LineId, ct);
        var trancheIds = tranches.Select(t => t.TrancheId).ToList();
        var counts = await db.InventoryAllocations.AsNoTracking().Where(a => a.TrancheId != null && trancheIds.Contains(a.TrancheId.Value) && a.ReleasedAt == null)
            .GroupBy(a => new { a.TrancheId, a.LineId }).Select(g => new { g.Key.TrancheId, g.Key.LineId, Count = g.Count(), Subs = g.Count(a => a.IsSubstitution) })
            .ToListAsync(ct);
        var shipments = await db.Shipments.AsNoTracking().Where(s => trancheIds.Contains(s.TrancheId) && s.Status != "Cancelled")
            .ToDictionaryAsync(s => s.TrancheId, ct);
        var byOrder = orders.ToDictionary(o => o.OrderId);
        return tranches.Select(t =>
        {
            var o = byOrder[t.OrderId];
            var ship = shipments.GetValueOrDefault(t.TrancheId);
            return new TrancheStatusResponse(t.TrancheId, o.OrderNo, o.Status, t.Seq, t.DueDate, t.Status, o.RecipientName, o.RecipientPhone, o.ShippingAddress,
                t.Lines.Select(l =>
                {
                    var c = counts.FirstOrDefault(x => x.TrancheId == t.TrancheId && x.LineId == l.LineId);
                    return new TrancheLineStatus(l.LineId, lines[l.LineId].Spec.SpecCode, l.ConvertedCrabs, c?.Count ?? 0, c?.Subs ?? 0, lines[l.LineId].PricePerKg);
                }).ToList(), ship?.ShipmentNo, ship?.Status);
        }).ToList();
    }

    /// <summary>
    /// Lập chuyến giao cho một đợt (BR-164): bù cua còn thiếu từ tồn đã duyệt, cho phép thay cua cùng size hạng cao hơn (BR-160);
    /// phát mã QR cho đơn ở chuyến đầu (BR-162).
    /// </summary>
    public async Task<ShipmentResponse> CreateShipmentAsync(long trancheId, CreateShipmentRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var no = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (tranche, order, batch) = await LoadTrancheAsync(trancheId, ct);
            await access.RequireOperatorAsync(batch, ct);
            if (!OrderStatus.Allocatable.Contains(order.Status))
                throw new BusinessRuleException("delivery.order_not_open", "Đơn chưa xác nhận hoặc đã kết thúc.");
            if (tranche.Status is not ("Planned" or "Allocated"))
                throw new BusinessRuleException("delivery.tranche_not_open", "Đợt giao này đã xuất hoặc đã huỷ.");
            if (await db.Shipments.AnyAsync(s => s.TrancheId == trancheId && s.Status != "Cancelled", ct))
                throw new ConflictException("delivery.shipment_exists", "Đợt giao đã có chuyến giao (BR-164).");
            var tl = await db.DeliveryTrancheLines.Where(l => l.TrancheId == trancheId).ToListAsync(ct);
            foreach (var l in tl) await allocations.FillLineAsync(trancheId, l.LineId, req.AllowSubstitution, ct);
            if (!await db.InventoryAllocations.AnyAsync(a => a.TrancheId == trancheId && a.ReleasedAt == null, ct))
                throw new BusinessRuleException("delivery.nothing_allocated", "Chưa có con cua nào đã duyệt hạng được phân bổ cho đợt này.");
            var now = clock.GetUtcNow();
            var prices = await db.SalesOrderLines.Where(l => l.OrderId == order.OrderId).ToDictionaryAsync(l => l.LineId, l => l.PricePerKg, ct);
            var shipment = new Shipment
            {
                ShipmentNo = Codes.New("CG", 10), OrderId = order.OrderId, TrancheId = trancheId, BatchId = batch.BatchId,
                ScheduledAt = req.ScheduledAt!.Value.ToUniversalTime(), TransportCondition = req.TransportCondition?.Trim(), Status = "Scheduled",
                CreatedBy = me.UserId, CreatedAt = now, UpdatedAt = now,
                Lines = tl.Select(l => new ShipmentLine { LineId = l.LineId, PricePerKg = prices[l.LineId] }).ToList(),
            };
            db.Shipments.Add(shipment);
            order.TraceCode ??= Codes.New("QR", 10);
            order.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("shipment", shipment.ShipmentId, "create", null, new { shipment.ShipmentNo, order.OrderNo, tranche.Seq, order.TraceCode }, ct);
            return shipment.ShipmentNo;
        }, ct, IsolationLevel.Serializable);
        return await ShipmentAsync(no, ct);
    }

    /// <summary>Thiếu cua cho cả đợt: huỷ đợt, nhả phân bổ; đợt cuối thì chốt đơn và hoàn phần cọc chưa dùng (BR-160).</summary>
    public async Task<OrderDeliveriesResponse> CancelTrancheAsync(long trancheId, CancelTrancheRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var orderNo = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (tranche, order, batch) = await LoadTrancheAsync(trancheId, ct);
            await access.RequireOperatorAsync(batch, ct);
            if (tranche.Status is not ("Planned" or "Allocated"))
                throw new BusinessRuleException("delivery.tranche_not_open", "Chỉ huỷ được đợt chưa xuất.");
            if (await db.Shipments.AnyAsync(s => s.TrancheId == trancheId && s.Status == "Scheduled", ct))
                await db.Shipments.Where(s => s.TrancheId == trancheId && s.Status == "Scheduled")
                    .ExecuteUpdateAsync(u => u.SetProperty(s => s.Status, "Cancelled"), ct);
            foreach (var a in await db.InventoryAllocations.Where(a => a.TrancheId == trancheId && a.ReleasedAt == null).ToListAsync(ct))
                await allocations.ReleaseAsync(a, $"Huỷ đợt giao: {req.Reason.Trim()}", ct);
            var now = clock.GetUtcNow();
            tranche.Status = "Cancelled";
            tranche.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("delivery_tranche", trancheId, "cancel_shortage", null, new { order.OrderNo, tranche.Seq, reason = req.Reason.Trim() }, ct);
            await ledger.FinalizeIfDoneAsync(order, now, ct);
            return order.OrderNo;
        }, ct, IsolationLevel.Serializable);
        return await OrderDeliveriesAsync(orderNo, ct);
    }

    /// <summary>Cân lần một khi xuất (BR-164): số con xuất của từng dòng bằng số con đã phân bổ; đơn chuyển Delivering ở đợt đầu.</summary>
    public async Task<ShipmentResponse> DispatchAsync(string shipmentNo, DispatchRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        foreach (var l in req.Lines) BatchService.Validate(l);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (shipment, order, batch) = await LoadShipmentAsync(shipmentNo, ct);
            await access.RequireOperatorAsync(batch, ct);
            if (shipment.Status != "Scheduled")
                throw new BusinessRuleException("delivery.not_scheduled", "Chuyến giao đã xuất hoặc đã huỷ.");
            var allocated = await db.InventoryAllocations.Where(a => a.TrancheId == shipment.TrancheId && a.ReleasedAt == null && a.Status == "Active").ToListAsync(ct);
            foreach (var line in shipment.Lines)
            {
                var input = req.Lines.SingleOrDefault(l => l.LineId == line.LineId)
                            ?? throw new BusinessRuleException("delivery.line_missing", "Thiếu số liệu cân lần một của một dòng giao.");
                var count = allocated.Count(a => a.LineId == line.LineId);
                if (input.DispatchedCrabs != count)
                    throw new BusinessRuleException("delivery.dispatch_count", $"Số con xuất của dòng phải bằng số con đã phân bổ ({count}).");
                if ((input.DispatchedCrabs > 0) != (input.DispatchedKg > 0))
                    throw new BusinessRuleException("delivery.dispatch_kg", "Dòng có cua phải có kg xuất và ngược lại.");
                line.DispatchedCrabs = input.DispatchedCrabs;
                line.DispatchedKg = decimal.Round(input.DispatchedKg, 3);
            }
            var now = clock.GetUtcNow();
            foreach (var a in allocated)
            {
                a.Status = "Shipped";
                var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == a.CrabUnitId, ct);
                crab.InventoryStatus = "Shipped";
                crab.UpdatedAt = now;
                db.InventoryEvents.Add(new InventoryEvent
                {
                    CrabUnitId = crab.CrabUnitId, BatchId = crab.BatchId, EventType = "Shipped", OccurredAt = now, Source = "App", ActorId = me.UserId,
                    Reason = shipment.ShipmentNo, CreatedAt = now,
                });
            }
            shipment.Status = "Dispatched";
            shipment.DispatchedAt = shipment.UpdatedAt = now;
            if (req.TransportCondition is { } condition) shipment.TransportCondition = condition.Trim();
            var tranche = await db.DeliveryTranches.SingleAsync(t => t.TrancheId == shipment.TrancheId, ct);
            tranche.Status = "Dispatched";
            tranche.UpdatedAt = now;
            var previous = order.Status;
            if (order.Status == PreorderStatus.Confirmed)
            {
                order.Status = OrderStatus.Delivering;
                order.ShippedAt = now;
            }
            order.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("shipment", shipment.ShipmentId, "dispatch", new { orderStatus = previous },
                new { shipment.Status, crabs = allocated.Count, kg = shipment.Lines.Sum(l => l.DispatchedKg), orderStatus = order.Status }, ct);
        }, ct, IsolationLevel.Serializable);
        return await ShipmentAsync(shipmentNo, ct);
    }

    /// <summary>Cân lần hai khi nhận (BR-165): người nuôi ghi số con nhận, kg nhận, số con và kg chấp nhận; hao hụt vận chuyển chỉ ghi lại.</summary>
    public async Task<ShipmentResponse> RecordReceiptAsync(string shipmentNo, ReceiptRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        foreach (var l in req.Lines) BatchService.Validate(l);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (shipment, order, batch) = await LoadShipmentAsync(shipmentNo, ct);
            await access.RequireOperatorAsync(batch, ct);
            if (shipment.Status != "Dispatched")
                throw new BusinessRuleException("delivery.not_dispatched", "Chuyến giao chưa xuất hoặc đã nghiệm thu.");
            var acceptance = await db.DeliveryAcceptances.SingleOrDefaultAsync(a => a.ShipmentId == shipment.ShipmentId, ct);
            if (acceptance is { Status: not "Pending" })
                throw new ConflictException("delivery.acceptance_closed", "Biên bản nghiệm thu đã chốt.");
            var discrepancy = false;
            foreach (var line in shipment.Lines)
            {
                var input = req.Lines.SingleOrDefault(l => l.LineId == line.LineId)
                            ?? throw new BusinessRuleException("delivery.line_missing", "Thiếu số liệu cân lần hai của một dòng giao.");
                if (input.ReceivedCrabs > (line.DispatchedCrabs ?? 0) || input.AcceptedCrabs > input.ReceivedCrabs || input.AcceptedKg > input.ReceivedKg)
                    throw new BusinessRuleException("delivery.receipt_invalid", "Số nhận không vượt số xuất; số chấp nhận không vượt số nhận.");
                if ((input.AcceptedCrabs > 0) != (input.AcceptedKg > 0))
                    throw new BusinessRuleException("delivery.receipt_kg", "Dòng có cua chấp nhận phải có kg chấp nhận và ngược lại.");
                discrepancy |= input.ReceivedCrabs != line.DispatchedCrabs || input.AcceptedCrabs != input.ReceivedCrabs;
                line.ReceivedCrabs = input.ReceivedCrabs;
                line.ReceivedKg = decimal.Round(input.ReceivedKg, 3);
                line.AcceptedCrabs = input.AcceptedCrabs;
                line.AcceptedKg = decimal.Round(input.AcceptedKg, 3);
                line.RejectedCrabs = input.ReceivedCrabs - input.AcceptedCrabs;
                line.GoodsValue = SalesLedger.Money(line.AcceptedKg.Value * line.PricePerKg);
            }
            if (discrepancy && string.IsNullOrWhiteSpace(req.DiscrepancyReason))
                throw new BusinessRuleException("delivery.reason_required", "Có chênh lệch số con giữa xuất, nhận và chấp nhận: ghi lý do (BR-165).");
            var rejectedCodes = (req.RejectedCrabCodes ?? []).Select(c => c.Trim().ToUpperInvariant()).Where(c => c.Length > 0).Distinct().ToList();
            var now = clock.GetUtcNow();
            if (rejectedCodes.Count > 0)
            {
                var shipped = await (from a in db.InventoryAllocations
                                     join c in db.CrabUnits on a.CrabUnitId equals c.CrabUnitId
                                     where a.TrancheId == shipment.TrancheId && a.Status == "Shipped" && rejectedCodes.Contains(c.CrabCode)
                                     select new { Allocation = a, Crab = c }).ToListAsync(ct);
                if (shipped.Count != rejectedCodes.Count)
                    throw new BusinessRuleException("delivery.rejected_not_shipped", "Mã cua bị từ chối phải thuộc chuyến giao này.");
                // Con khách từ chối khi nhận quay về trại; có thể bán lại qua đơn có hoá đơn.
                foreach (var x in shipped)
                {
                    x.Allocation.Status = "Returned";
                    x.Allocation.ReleasedAt = now;
                    x.Allocation.ReleaseReason = "Khách từ chối khi nghiệm thu";
                    x.Crab.InventoryStatus = "Returned";
                    x.Crab.UpdatedAt = now;
                    db.InventoryEvents.Add(new InventoryEvent
                    {
                        CrabUnitId = x.Crab.CrabUnitId, BatchId = x.Crab.BatchId, EventType = "Returned", OccurredAt = now, Source = "App",
                        ActorId = me.UserId, Reason = shipment.ShipmentNo, CreatedAt = now,
                    });
                }
            }
            acceptance ??= db.DeliveryAcceptances.Add(new DeliveryAcceptance
            {
                ShipmentId = shipment.ShipmentId, OrderId = order.OrderId, TrancheId = shipment.TrancheId, CreatedAt = now,
            }).Entity;
            acceptance.AcceptedCrabs = shipment.Lines.Sum(l => l.AcceptedCrabs ?? 0);
            acceptance.AcceptedKg = shipment.Lines.Sum(l => l.AcceptedKg ?? 0);
            acceptance.RejectedCrabs = shipment.Lines.Sum(l => l.RejectedCrabs ?? 0);
            var note = req.DiscrepancyReason?.Trim();
            if (rejectedCodes.Count > 0) note = $"{note} (từ chối: {string.Join(", ", rejectedCodes)})".Trim();
            acceptance.DiscrepancyReason = string.IsNullOrEmpty(note) ? null : note.Length > 300 ? note[..300] : note;
            acceptance.Status = "Pending";
            acceptance.OperatorRecordedBy = me.UserId;
            acceptance.OperatorRecordedAt = acceptance.UpdatedAt = now;
            shipment.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("shipment", shipment.ShipmentId, "record_receipt", null,
                new { acceptance.AcceptedCrabs, acceptance.AcceptedKg, acceptance.RejectedCrabs, rejected = rejectedCodes }, ct);
        }, ct, IsolationLevel.Serializable);
        return await ShipmentAsync(shipmentNo, ct);
    }

    // ---------- Khách: nghiệm thu ----------

    /// <summary>
    /// Khách xác nhận biên bản nghiệm thu (BR-165, BR-166): tiền hàng = Σ kg nghiệm thu × giá mỗi kg; trừ cọc còn lại; phần còn lại trả qua VietQR
    /// trong hạn (BR-168). Mỗi đợt có một hoá đơn (BR-170, BR-171).
    /// </summary>
    public async Task<ShipmentResponse> ConfirmAcceptanceAsync(string shipmentNo, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (shipment, order, batch) = await LoadShipmentAsync(shipmentNo, ct);
            if (order.CustomerId != me.UserId)
                throw new ForbiddenException("delivery.not_customer", "Chỉ khách của đơn xác nhận nghiệm thu.");
            var acceptance = await db.DeliveryAcceptances.SingleOrDefaultAsync(a => a.ShipmentId == shipment.ShipmentId, ct);
            if (shipment.Status != "Dispatched" || acceptance is not { Status: "Pending" })
                throw new BusinessRuleException("delivery.acceptance_not_ready", "Chưa có biên bản nghiệm thu chờ xác nhận.");
            var now = clock.GetUtcNow();
            var goods = shipment.Lines.Sum(l => l.GoodsValue ?? 0);
            var credit = await ledger.DepositCreditAsync(order, ct);
            var applied = Math.Min(Math.Max(credit, 0), goods);
            acceptance.Status = "Confirmed";
            acceptance.CustomerConfirmedBy = me.UserId;
            acceptance.CustomerConfirmedAt = acceptance.UpdatedAt = now;
            acceptance.GoodsValue = goods;
            acceptance.DepositApplied = applied;
            acceptance.BalanceDue = goods - applied;
            shipment.Status = "Accepted";
            shipment.DeliveredAt = shipment.UpdatedAt = now;
            shipment.ReturnWindowEndsAt = await ledger.ReturnWindowEndAsync(now, ct);
            var tranche = await db.DeliveryTranches.SingleAsync(t => t.TrancheId == shipment.TrancheId, ct);
            tranche.UpdatedAt = now;
            await db.SaveChangesAsync(ct);

            // Cua còn trong chuyến (không bị từ chối lúc cân lần hai) chuyển Delivered.
            foreach (var a in await db.InventoryAllocations.Where(a => a.TrancheId == tranche.TrancheId && a.Status == "Shipped").ToListAsync(ct))
            {
                var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == a.CrabUnitId, ct);
                a.Status = "Delivered";
                crab.InventoryStatus = "Delivered";
                crab.UpdatedAt = now;
                db.InventoryEvents.Add(new InventoryEvent
                {
                    CrabUnitId = crab.CrabUnitId, BatchId = crab.BatchId, EventType = "Delivered", OccurredAt = now, Source = "App",
                    ActorId = me.UserId, Reason = shipment.ShipmentNo, CreatedAt = now,
                });
            }
            await ledger.IssueInvoiceAsync(order, batch, tranche.TrancheId, goods, order.CustomerPartyId, order.RecipientName, now, ct);
            if (acceptance.BalanceDue > 0)
            {
                tranche.Status = "Accepted";
                var hours = await parameters.GetIntAsync(ParamKeys.BalancePaymentHours, now, ct);
                acceptance.BalanceDueAt = now.AddHours(hours);
                var account = await db.BatchAccounts.SingleAsync(a => a.BatchId == batch.BatchId, ct);
                var created = await payments.CreateAsync(PaymentPurposes.PreOrderBalance, acceptance.BalanceDue.Value, account.BatchAccountId,
                    account.ProviderAccountNo, acceptance.BalanceDueAt.Value, PaymentTarget.ForOrder(order), null, ct);
                created.Request.TrancheId = tranche.TrancheId;
            }
            else
            {
                tranche.Status = "Completed";
                acceptance.BalancePaidAt = now;
            }
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("delivery_acceptance", acceptance.AcceptanceId, "confirm", new { status = "Pending" },
                new { goods = (long)goods, applied = (long)applied, balance = (long)acceptance.BalanceDue!.Value, tranche.Status }, ct);
            await ledger.FinalizeIfDoneAsync(order, now, ct);
        }, ct, IsolationLevel.Serializable);
        return await ShipmentAsync(shipmentNo, ct);
    }

    /// <summary>Khách từ chối nhận hàng (BR-169): mất cọc, cua quay về tồn để bán lại qua đơn có hoá đơn.</summary>
    public async Task<ShipmentResponse> RefuseAsync(string shipmentNo, RefuseDeliveryRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (shipment, order, _) = await LoadShipmentAsync(shipmentNo, ct);
            if (order.CustomerId != me.UserId)
                throw new ForbiddenException("delivery.not_customer", "Chỉ khách của đơn từ chối nhận.");
            if (shipment.Status != "Dispatched")
                throw new BusinessRuleException("delivery.not_dispatched", "Chỉ từ chối được chuyến đang giao.");
            var now = clock.GetUtcNow();
            var acceptance = await db.DeliveryAcceptances.SingleOrDefaultAsync(a => a.ShipmentId == shipment.ShipmentId, ct);
            if (acceptance is not null) { acceptance.Status = "Refused"; acceptance.UpdatedAt = now; }
            await ledger.ForfeitAsync(order, $"Khách từ chối nhận chuyến {shipment.ShipmentNo}: {req.Reason.Trim()}", now, ct);
        }, ct, IsolationLevel.Serializable);
        return await ShipmentAsync(shipmentNo, ct);
    }

    // ---------- Đọc ----------

    public async Task<ShipmentResponse> ShipmentAsync(string shipmentNo, CancellationToken ct)
    {
        var shipment = await db.Shipments.AsNoTracking().Include(s => s.Lines).SingleOrDefaultAsync(s => s.ShipmentNo == shipmentNo, ct)
                       ?? throw new NotFoundException("delivery.shipment_not_found", "Không tìm thấy chuyến giao.");
        var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderId == shipment.OrderId, ct);
        await RequireOrderViewerAsync(order, ct);
        return await ShipmentResponseAsync(shipment, order, ct);
    }

    public async Task<OrderDeliveriesResponse> OrderDeliveriesAsync(string orderNo, CancellationToken ct)
    {
        var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("preorder.not_found", "Không tìm thấy đơn.");
        await RequireOrderViewerAsync(order, ct);
        var shipments = await db.Shipments.AsNoTracking().Include(s => s.Lines).Where(s => s.OrderId == order.OrderId).OrderBy(s => s.CreatedAt).ToListAsync(ct);
        var list = new List<ShipmentResponse>();
        foreach (var s in shipments) list.Add(await ShipmentResponseAsync(s, order, ct));
        var seqs = await db.DeliveryTranches.Where(t => t.OrderId == order.OrderId).ToDictionaryAsync(t => t.TrancheId, t => (int)t.Seq, ct);
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == order.BatchId, ct);
        var invoices = await InvoicesAsync(order.OrderId, seqs, ct);
        var applied = await db.DeliveryAcceptances.Where(a => a.OrderId == order.OrderId && a.Status == "Confirmed").SumAsync(a => (decimal?)a.DepositApplied, ct) ?? 0;
        _ = batch;
        return new OrderDeliveriesResponse(order.OrderNo, order.Status, (long)(order.DepositAmount ?? 0), (long)applied, order.TraceCode, list, invoices,
            order.ReturnWindowEndsAt);
    }

    public async Task<IReadOnlyList<AllocationResponse>> AllocationsAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        return await (from a in db.InventoryAllocations.AsNoTracking()
                      join c in db.CrabUnits on a.CrabUnitId equals c.CrabUnitId
                      join o in db.SalesOrders on a.OrderId equals o.OrderId
                      where a.BatchId == batch.BatchId
                      orderby a.AllocatedAt
                      select new AllocationResponse(c.CrabCode, o.OrderNo, o.OrderType,
                          a.TrancheId == null ? null : (int?)db.DeliveryTranches.Where(t => t.TrancheId == a.TrancheId).Select(t => (int)t.Seq).First(),
                          a.LineId == null ? null : db.SalesOrderLines.Where(l => l.LineId == a.LineId).Select(l => l.Spec.SpecCode).First(),
                          a.CrabSpecId == null ? null : db.ProductSpecifications.Where(s => s.SpecId == a.CrabSpecId).Select(s => s.SpecCode).First(),
                          a.IsSubstitution, a.Status, a.AllocatedAt, a.ReleasedAt, a.ReleaseReason)).Take(2000).ToListAsync(ct);
    }

    private async Task<ShipmentResponse> ShipmentResponseAsync(Shipment s, SalesOrder order, CancellationToken ct)
    {
        var specs = await db.SalesOrderLines.Where(l => l.OrderId == order.OrderId).Select(l => new { l.LineId, l.Spec.SpecCode })
            .ToDictionaryAsync(l => l.LineId, l => l.SpecCode, ct);
        var seq = await db.DeliveryTranches.Where(t => t.TrancheId == s.TrancheId).Select(t => (int)t.Seq).SingleAsync(ct);
        var a = await db.DeliveryAcceptances.AsNoTracking().SingleOrDefaultAsync(x => x.ShipmentId == s.ShipmentId, ct);
        BalancePaymentResponse? balance = null;
        if (a is { Status: "Confirmed", BalanceDue: > 0 })
        {
            var request = await db.PaymentRequests.AsNoTracking().Where(r => r.TrancheId == s.TrancheId && r.Purpose == PaymentPurposes.PreOrderBalance)
                .OrderByDescending(r => r.PaymentRequestId).FirstOrDefaultAsync(ct);
            if (request is not null) balance = await PaymentAsync(request, ct);
        }
        return new ShipmentResponse(s.ShipmentNo, order.OrderNo, seq, s.Status, s.ScheduledAt, s.DispatchedAt, s.DeliveredAt, s.ReturnWindowEndsAt,
            s.TransportCondition,
            s.Lines.OrderBy(l => l.LineId).Select(l => new ShipmentLineResponse(l.LineId, specs.GetValueOrDefault(l.LineId, ""), l.PricePerKg, l.DispatchedCrabs,
                l.DispatchedKg, l.ReceivedCrabs, l.ReceivedKg, l.AcceptedCrabs, l.AcceptedKg, l.RejectedCrabs,
                l.DispatchedKg is { } d && l.ReceivedKg is { } r ? d - r : null, l.GoodsValue is { } g ? (long)g : null)).ToList(),
            a is null ? null : new AcceptanceResponse(a.Status, a.AcceptedCrabs, a.AcceptedKg, a.RejectedCrabs, a.DiscrepancyReason, a.OperatorRecordedAt,
                a.CustomerConfirmedAt, a.GoodsValue is { } gv ? (long)gv : null, a.DepositApplied is { } da ? (long)da : null,
                a.BalanceDue is { } bd ? (long)bd : null, a.BalanceDueAt, a.BalancePaidAt),
            balance, order.TraceCode);
    }

    internal async Task<BalancePaymentResponse> PaymentAsync(PaymentRequest request, CancellationToken ct)
    {
        var account = await db.BatchAccounts.AsNoTracking().SingleAsync(x => x.BatchAccountId == request.BatchAccountId, ct);
        var described = await payments.DescribeAsync(request, account, "", ct);
        return new BalancePaymentResponse(request.PaymentRequestId, request.ReferenceCode, (long)request.Amount, described.QrContent ?? "", request.ExpiresAt,
            account.ProviderAccountNo, described.Status);
    }

    private async Task<IReadOnlyList<InvoiceResponse>> InvoicesAsync(long orderId, IReadOnlyDictionary<long, int> seqs, CancellationToken ct)
    {
        var rows = await db.Invoices.AsNoTracking().Where(i => i.OrderId == orderId).OrderBy(i => i.IssuedAt).ToListAsync(ct);
        var partyIds = rows.Select(r => r.SellerPartyId).Distinct().ToList();
        var names = await db.Parties.Where(p => partyIds.Contains(p.PartyId)).ToDictionaryAsync(p => p.PartyId, p => p.LegalName, ct);
        return rows.Select(i => new InvoiceResponse(i.InvoiceNo, i.TrancheId is { } t ? seqs.GetValueOrDefault(t) : null, (long)i.Amount,
            names.GetValueOrDefault(i.SellerPartyId, ""), i.BuyerName, i.Status, i.IssuedAt)).ToList();
    }

    /// <summary>Khách của đơn, người nuôi của Lô, Admin.</summary>
    private async Task RequireOrderViewerAsync(SalesOrder order, CancellationToken ct)
    {
        if (order.CustomerId == me.UserId || me.IsInRole(Roles.PlatformAdmin)) return;
        var batch = await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == order.BatchId, ct);
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
    }

    private async Task<(DeliveryTranche Tranche, SalesOrder Order, Batch Batch)> LoadTrancheAsync(long trancheId, CancellationToken ct)
    {
        var tranche = await db.DeliveryTranches.FromSqlInterpolated($"SELECT * FROM dbo.delivery_tranche WITH (UPDLOCK, HOLDLOCK) WHERE tranche_id = {trancheId}")
                          .SingleOrDefaultAsync(ct)
                      ?? throw new NotFoundException("delivery.tranche_not_found", "Không tìm thấy đợt giao.");
        var order = await db.SalesOrders.SingleAsync(o => o.OrderId == tranche.OrderId, ct);
        var batch = await db.Batches.SingleAsync(b => b.BatchId == order.BatchId, ct);
        return (tranche, order, batch);
    }

    private async Task<(Shipment Shipment, SalesOrder Order, Batch Batch)> LoadShipmentAsync(string shipmentNo, CancellationToken ct)
    {
        var shipment = await db.Shipments.FromSqlInterpolated($"SELECT * FROM dbo.shipment WITH (UPDLOCK, HOLDLOCK) WHERE shipment_no = {shipmentNo}")
                           .Include(s => s.Lines).SingleOrDefaultAsync(ct)
                       ?? throw new NotFoundException("delivery.shipment_not_found", "Không tìm thấy chuyến giao.");
        var order = await db.SalesOrders.SingleAsync(o => o.OrderId == shipment.OrderId, ct);
        var batch = await db.Batches.SingleAsync(b => b.BatchId == order.BatchId, ct);
        return (shipment, order, batch);
    }
}

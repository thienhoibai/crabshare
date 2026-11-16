using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Grading;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Features.Sales;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Delivery;

/// <summary>
/// Bán trực tiếp có hoá đơn (BR-169, BR-177, BR-178) và đơn hàng cuối (BR-179 – BR-182): người nuôi ghi bên mua, kg, đơn giá; tiền vào tài khoản
/// của Lô qua VietQR; đơn PendingPayment chuyển Completed khi tiền về. Cua bị loại bỏ không bán (BR-156).
/// </summary>
public sealed class DirectSaleService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access,
    SalesLedger ledger, AllocationService allocations, PaymentRequestService payments, PlatformParameters parameters, DeliveryService delivery)
{
    // BR-210: khi thanh lý sớm, cua còn lại bán qua đơn có hoá đơn.
    private static readonly string[] SellingStatuses = ["Sourcing", "Harvesting", "Selling", "Liquidating"];

    /// <summary>Cua còn trong tồn đã duyệt hạng, chưa phân bổ (kể cả cua khách trả về).</summary>
    public async Task<IReadOnlyList<SellableCrab>> SellableAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        return await (from c in db.CrabUnits.AsNoTracking()
                      join d in db.GradeDecisions on c.CrabUnitId equals d.CrabUnitId
                      where c.BatchId == batch.BatchId && (c.InventoryStatus == "Graded" || c.InventoryStatus == "Returned") && d.IsCurrent && d.Status == "Approved"
                            && !db.InventoryAllocations.Any(a => a.CrabUnitId == c.CrabUnitId && a.ReleasedAt == null)
                      orderby c.CrabCode
                      select new SellableCrab(c.CrabCode, d.SpecId == null ? null : db.ProductSpecifications.Where(s => s.SpecId == d.SpecId).Select(s => s.SpecCode).First(),
                          d.FinalSize!, d.FinalGrade!, d.IsSubstandard, d.WeightG, c.InventoryStatus)).ToListAsync(ct);
    }

    /// <summary>
    /// Đơn có hoá đơn (BR-177): LowGrade chỉ cho cua dưới chuẩn (cua ngoài quy cách cần Lô có chào giá quy cách ngoài, BR-158);
    /// ForfeitResale cho cua nhả từ đơn mất cọc (BR-169); Surplus khi bên cam kết không mua đơn hàng cuối (BR-182).
    /// </summary>
    public async Task<DirectSaleResponse> CreateInvoicedSaleAsync(string batchCode, InvoicedSaleRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var orderNo = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await access.OperateAsync(batchCode, ct, lockRow: true);
            if (!SellingStatuses.Contains(batch.Status))
                throw new BusinessRuleException("sale.batch_not_selling", "Lô chưa tới giai đoạn bán hoặc đã đóng.");
            var crabs = await CrabsForSaleAsync(batch, req.CrabCodes, ct);
            switch (req.SaleReason)
            {
                case "LowGrade":
                    if (crabs.Any(c => !c.Decision.IsSubstandard))
                        throw new BusinessRuleException("sale.not_substandard", "Đơn bán dưới chuẩn chỉ gồm cua dưới chuẩn; cua đạt chuẩn bán theo đơn đặt trước (BR-159).");
                    if (crabs.Any(c => c.Decision.FinalSize == GradeLabels.Out))
                    {
                        var outCode = GradeLabels.SpecCode(batch.CrabType, GradeLabels.Out, GradeLabels.Grade1);
                        if (!await db.Offers.AnyAsync(o => o.BatchId == batch.BatchId && o.Spec.SpecCode == outCode, ct))
                            throw new BusinessRuleException("sale.out_spec_not_offered", "Cua ngoài quy cách chỉ bán khi hợp đồng của Lô có chào giá quy cách này (BR-158).");
                    }
                    break;
                case "ForfeitResale":
                    var source = await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderNo == req.SourceOrderNo && o.BatchId == batch.BatchId, ct);
                    if (source is not { Status: PreorderStatus.Forfeited })
                        throw new BusinessRuleException("sale.source_not_forfeited", "Bán lại do mất cọc cần mã đơn đã mất cọc của Lô (BR-169).");
                    var ids = crabs.Select(c => c.Crab.CrabUnitId).ToList();
                    var fromSource = await db.InventoryAllocations.Where(a => a.OrderId == source.OrderId && ids.Contains(a.CrabUnitId))
                        .Select(a => a.CrabUnitId).Distinct().CountAsync(ct);
                    if (fromSource != ids.Count)
                        throw new BusinessRuleException("sale.crab_not_from_source", "Chỉ bán lại cua đã phân bổ cho đơn mất cọc đó.");
                    break;
                case "Surplus":
                    var liquidating = batch.Status == "Liquidating";
                    if (!liquidating && !await db.SalesOrders.AnyAsync(o => o.BatchId == batch.BatchId && o.OrderType == "FinalOrder" && o.Status == "Cancelled", ct))
                        throw new BusinessRuleException("sale.surplus_not_allowed", "Bán phần dư chỉ khi bên cam kết không mua đơn hàng cuối (BR-182).");
                    // Lô P: cần quyết định tập thể của nhà đầu tư (BR-182, BR-211); thanh lý sớm đã được biểu quyết (BR-210).
                    if (batch.BatchMode == "P" && !liquidating && !await Settlement.CollectiveDecisionService.PassedAsync(db, batch.BatchId, "SurplusSale", ct))
                        throw new BusinessRuleException("sale.surplus_needs_vote", "Lô P cần nhà đầu tư biểu quyết thông qua việc bán phần dư (BR-182, BR-211).");
                    break;
            }
            long? sourceId = req.SaleReason == "ForfeitResale"
                ? await db.SalesOrders.Where(o => o.OrderNo == req.SourceOrderNo).Select(o => (long?)o.OrderId).SingleAsync(ct) : null;
            var order = await CreateOrderAsync(batch, "InvoicedSale", req.SaleReason, req.BuyerPartyId, req.BuyerName.Trim(), req.BuyerPhone,
                crabs, req.Kg, req.PricePerKg, sourceId, ct);
            return order.OrderNo;
        }, ct, IsolationLevel.Serializable);
        return await GetAsync(orderNo, ct);
    }

    /// <summary>
    /// Đơn hàng cuối (BR-179 – BR-181): hết số ngày bán, cua còn lại chưa bán bán cho bên cam kết thu mua với đơn giá không dưới giá sàn;
    /// mỗi Lô tối đa một đơn; nền tảng không bù chênh lệch.
    /// </summary>
    public async Task<DirectSaleResponse> CreateFinalOrderAsync(string batchCode, FinalOrderRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        var orderNo = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var batch = await access.OperateAsync(batchCode, ct, lockRow: true);
            if (batch.Status != "Selling")
                throw new BusinessRuleException("sale.batch_not_selling", "Đơn hàng cuối lập khi Lô đang bán.");
            var now = clock.GetUtcNow();
            if (batch.SellingStartedAt is not { } started || started.AddDays(batch.SaleDays ?? 0) > now)
                throw new BusinessRuleException("sale.window_open", "Chưa hết số ngày bán của Lô (BR-179).");
            if (batch.OfftakeBuyerPartyId is not { } buyer)
                throw new BusinessRuleException("sale.no_committed_buyer", "Lô không có bên cam kết thu mua.");
            if (batch.FloorPricePerKg is { } floor && req.PricePerKg < floor)
                throw new BusinessRuleException("sale.below_floor", $"Đơn giá không được dưới giá sàn {(long)floor:N0} đ/kg (BR-181).");
            if (await db.SalesOrders.AnyAsync(o => o.BatchId == batch.BatchId && o.OrderType == "FinalOrder" && o.Status != "Cancelled", ct))
                throw new ConflictException("sale.final_exists", "Lô đã có đơn hàng cuối (BR-181).");
            var remaining = await db.CrabUnits.Where(c => c.BatchId == batch.BatchId && (c.InventoryStatus == "Graded" || c.InventoryStatus == "Returned")
                    && db.GradeDecisions.Any(d => d.CrabUnitId == c.CrabUnitId && d.IsCurrent && d.Status == "Approved")
                    && !db.InventoryAllocations.Any(a => a.CrabUnitId == c.CrabUnitId && a.ReleasedAt == null))
                .Select(c => c.CrabCode).ToListAsync(ct);
            if (remaining.Count == 0)
                throw new BusinessRuleException("sale.nothing_left", "Không còn cua nào chưa bán.");
            var crabs = await CrabsForSaleAsync(batch, remaining, ct);
            var name = await db.Parties.Where(p => p.PartyId == buyer).Select(p => p.LegalName).SingleAsync(ct);
            var order = await CreateOrderAsync(batch, "FinalOrder", null, buyer, name, null, crabs, req.Kg, req.PricePerKg, null, ct);
            return order.OrderNo;
        }, ct, IsolationLevel.Serializable);
        return await GetAsync(orderNo, ct);
    }

    /// <summary>Huỷ đơn có hoá đơn chưa thu tiền, hoặc ghi bên cam kết không mua đơn hàng cuối (mở đường cho bán phần dư, BR-182).</summary>
    public async Task<DirectSaleResponse> CancelAsync(string orderNo, CancelDirectSaleRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var order = await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderNo == orderNo && (o.OrderType == "InvoicedSale" || o.OrderType == "FinalOrder"), ct)
                        ?? throw new NotFoundException("sale.not_found", "Không tìm thấy đơn.");
            await access.RequireOperatorAsync(await db.Batches.SingleAsync(b => b.BatchId == order.BatchId, ct), ct);
            if (order.Status != OrderStatus.PendingPayment)
                throw new BusinessRuleException("sale.not_pending", "Chỉ huỷ được đơn chưa thu tiền.");
            var now = clock.GetUtcNow();
            foreach (var a in await db.InventoryAllocations.Where(a => a.OrderId == order.OrderId && a.ReleasedAt == null).ToListAsync(ct))
                await allocations.ReleaseAsync(a, $"Huỷ đơn {order.OrderNo}: {req.Reason.Trim()}", ct);
            await ledger.CancelInvoicesAsync(order.OrderId, null, req.Reason.Trim(), now, ct);
            await db.PaymentRequests.Where(r => r.OrderId == order.OrderId && r.Status == "Pending")
                .ExecuteUpdateAsync(u => u.SetProperty(r => r.Status, "Cancelled").SetProperty(r => r.UpdatedAt, now), ct);
            order.Status = PreorderStatus.Cancelled;
            order.CancelledAt = order.UpdatedAt = now;
            order.CancelReason = req.Reason.Trim();
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("sales_order", order.OrderId, "cancel_direct_sale", new { status = OrderStatus.PendingPayment }, new { order.Status, order.CancelReason }, ct);
        }, ct, IsolationLevel.Serializable);
        return await GetAsync(orderNo, ct);
    }

    public async Task<IReadOnlyList<DirectSaleResponse>> ListAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await access.RequireOperatorOrAdminReadAsync(batch, ct);
        var nos = await db.SalesOrders.Where(o => o.BatchId == batch.BatchId && (o.OrderType == "InvoicedSale" || o.OrderType == "FinalOrder"))
            .OrderBy(o => o.PlacedAt).Select(o => o.OrderNo).ToListAsync(ct);
        var list = new List<DirectSaleResponse>();
        foreach (var no in nos) list.Add(await GetAsync(no, ct));
        return list;
    }

    public async Task<DirectSaleResponse> GetAsync(string orderNo, CancellationToken ct)
    {
        var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(o => o.OrderNo == orderNo && (o.OrderType == "InvoicedSale" || o.OrderType == "FinalOrder"), ct)
                    ?? throw new NotFoundException("sale.not_found", "Không tìm thấy đơn.");
        await access.RequireOperatorOrAdminReadAsync(await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == order.BatchId, ct), ct);
        var crabs = await db.InventoryAllocations.CountAsync(a => a.OrderId == order.OrderId && a.Status != "Released", ct);
        var invoice = await db.Invoices.Where(i => i.OrderId == order.OrderId && i.Status == "Active").Select(i => i.InvoiceNo).FirstOrDefaultAsync(ct);
        BalancePaymentResponse? payment = null;
        if (order.Status == OrderStatus.PendingPayment)
        {
            var request = await db.PaymentRequests.AsNoTracking().Where(r => r.OrderId == order.OrderId && r.Purpose == PaymentPurposes.OrderPayment)
                .OrderByDescending(r => r.PaymentRequestId).FirstOrDefaultAsync(ct);
            if (request is not null) payment = await delivery.PaymentAsync(request, ct);
        }
        return new DirectSaleResponse(order.OrderNo, order.OrderType, order.SaleReason, order.Status, order.BuyerName ?? order.RecipientName, crabs,
            order.SaleKg ?? 0, (long)(order.SalePricePerKg ?? 0), (long)order.TotalAmount, invoice, payment, order.PlacedAt, order.CompletedAt);
    }

    private sealed record SaleCrab(CrabUnit Crab, GradeDecision Decision);

    /// <summary>Cua bán được: thuộc Lô, đã duyệt hạng, còn trong tồn và chưa phân bổ. Cua bị loại bỏ không bán (BR-156).</summary>
    private async Task<IReadOnlyList<SaleCrab>> CrabsForSaleAsync(Batch batch, IReadOnlyCollection<string> codes, CancellationToken ct)
    {
        var wanted = codes.Select(c => c.Trim().ToUpperInvariant()).Distinct().ToList();
        var rows = await (from c in db.CrabUnits
                          join d in db.GradeDecisions on c.CrabUnitId equals d.CrabUnitId
                          where c.BatchId == batch.BatchId && wanted.Contains(c.CrabCode) && d.IsCurrent
                          select new SaleCrab(c, d)).ToListAsync(ct);
        if (rows.Count != wanted.Count)
            throw new NotFoundException("sale.crab_not_found", "Có mã cua không thuộc Lô hoặc chưa phân hạng.");
        if (rows.Any(r => r.Decision.Status == "Rejected"))
            throw new BusinessRuleException("sale.rejected_crab", "Cua bị loại bỏ không được bán ở bất kỳ giá nào (BR-156).");
        if (rows.Any(r => r.Decision.Status != "Approved" || r.Crab.InventoryStatus is not ("Graded" or "Returned")))
            throw new BusinessRuleException("sale.crab_not_available", "Có con cua chưa duyệt hạng, đã phân bổ hoặc đã bán.");
        var ids = rows.Select(r => r.Crab.CrabUnitId).ToList();
        if (await db.InventoryAllocations.AnyAsync(a => ids.Contains(a.CrabUnitId) && a.ReleasedAt == null, ct))
            throw new BusinessRuleException("sale.crab_not_available", "Có con cua đang phân bổ cho đơn khác.");
        return rows;
    }

    private async Task<SalesOrder> CreateOrderAsync(Batch batch, string type, string? reason, long? buyerPartyId, string buyerName, string? buyerPhone,
        IReadOnlyList<SaleCrab> crabs, decimal kg, long pricePerKg, long? sourceOrderId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var total = SalesLedger.Money(decimal.Round(kg, 3) * pricePerKg);
        var order = new SalesOrder
        {
            OrderNo = OrderNumber.New(), CustomerId = me.UserId, BatchId = batch.BatchId, OrderType = type, Status = OrderStatus.PendingPayment,
            TotalAmount = total, RecipientName = buyerName.Length > 150 ? buyerName[..150] : buyerName, RecipientPhone = buyerPhone?.Trim() ?? "",
            ShippingAddress = "", PlacedAt = now, CreatedAt = now, UpdatedAt = now, SaleReason = reason, BuyerPartyId = buyerPartyId, BuyerName = buyerName,
            SaleKg = decimal.Round(kg, 3), SalePricePerKg = pricePerKg, SourceOrderId = sourceOrderId,
        };
        db.SalesOrders.Add(order);
        await db.SaveChangesAsync(ct);
        foreach (var c in crabs)
        {
            db.InventoryAllocations.Add(new InventoryAllocation
            {
                CrabUnitId = c.Crab.CrabUnitId, BatchId = batch.BatchId, OrderId = order.OrderId, GradeDecisionId = c.Decision.GradeDecisionId,
                CrabSpecId = c.Decision.SpecId, Status = "Active", AllocatedAt = now, ActorId = me.UserId, CreatedAt = now,
            });
            c.Crab.InventoryStatus = "Allocated";
            c.Crab.UpdatedAt = now;
        }
        await db.SaveChangesAsync(ct);
        await ledger.IssueInvoiceAsync(order, batch, null, total, buyerPartyId, buyerName, now, ct);
        var account = await db.BatchAccounts.SingleAsync(a => a.BatchId == batch.BatchId, ct);
        var hours = await parameters.GetIntAsync(ParamKeys.BalancePaymentHours, now, ct);
        await payments.CreateAsync(PaymentPurposes.OrderPayment, total, account.BatchAccountId, account.ProviderAccountNo, now.AddHours(hours),
            PaymentTarget.ForOrder(order), order.OrderNo, ct);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("sales_order", order.OrderId, type == "FinalOrder" ? "create_final_order" : "create_invoiced_sale", null,
            new { order.OrderNo, reason, crabs = crabs.Count, kg = order.SaleKg, pricePerKg, total }, ct);
        return order;
    }
}

/// <summary>Tiền đơn có hoá đơn hoặc đơn hàng cuối về (BR-178): Completed, cua Sold, ghi dòng doanh thu (BR-184).</summary>
public sealed class DirectSalePaymentHandler(AppDbContext db, IAuditLog audit, SalesLedger ledger, RefundService refunds) : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.OrderPayment;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var order = request.OrderId is { } id ? await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderId == id, ct) : null;
        if (order is null || order.OrderType is not ("InvoicedSale" or "FinalOrder")) return;
        if (order.Status != OrderStatus.PendingPayment)
        {
            await refunds.CreateRefundAsync(request.BatchAccountId, request.Amount, null, order.OrderId, $"Tiền đến sau khi đơn {order.OrderNo} đã {order.Status}", paidAt, ct);
            return;
        }
        order.Status = OrderStatus.Completed;
        order.PaidAt = order.CompletedAt = order.UpdatedAt = paidAt;
        foreach (var a in await db.InventoryAllocations.Where(a => a.OrderId == order.OrderId && a.Status == "Active").ToListAsync(ct))
        {
            a.Status = "Delivered";
            var crab = await db.CrabUnits.SingleAsync(c => c.CrabUnitId == a.CrabUnitId, ct);
            crab.InventoryStatus = "Sold";
            crab.UpdatedAt = paidAt;
            db.InventoryEvents.Add(new InventoryEvent
            {
                CrabUnitId = crab.CrabUnitId, BatchId = crab.BatchId, EventType = "Sold", OccurredAt = paidAt, Source = "System", Reason = order.OrderNo, CreatedAt = paidAt,
            });
        }
        await db.SaveChangesAsync(ct);
        await ledger.RecognizeAsync(order.BatchId, order.OrderType, order.OrderId, request.Amount, $"{order.OrderType} {order.OrderNo}", paidAt, ct);
        await audit.WriteAsync("sales_order", order.OrderId, "paid", new { status = OrderStatus.PendingPayment }, new { order.Status, request.ReferenceCode, amount = (long)request.Amount }, paidAt, ct);
    }
}

/// <summary>Tiền phần còn lại của một đợt giao về (BR-168): đợt Completed; mọi đợt xong thì chốt đơn.</summary>
public sealed class PreorderBalanceHandler(AppDbContext db, IAuditLog audit, SalesLedger ledger, RefundService refunds) : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.PreOrderBalance;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var order = request.OrderId is { } id ? await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderId == id, ct) : null;
        var acceptance = request.TrancheId is { } t ? await db.DeliveryAcceptances.SingleOrDefaultAsync(a => a.TrancheId == t && a.Status == "Confirmed", ct) : null;
        if (order is null || acceptance is null || acceptance.BalancePaidAt is not null || order.Status is not (OrderStatus.Delivering or PreorderStatus.Confirmed))
        {
            if (order is not null)
                await refunds.CreateRefundAsync(request.BatchAccountId, request.Amount, null, order.OrderId,
                    $"Phần còn lại đến sau khi đơn {order.OrderNo} đã {order.Status}", paidAt, ct);
            return;
        }
        acceptance.BalancePaidAt = acceptance.UpdatedAt = paidAt;
        var tranche = await db.DeliveryTranches.SingleAsync(x => x.TrancheId == acceptance.TrancheId, ct);
        tranche.Status = "Completed";
        tranche.UpdatedAt = paidAt;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("delivery_acceptance", acceptance.AcceptanceId, "balance_paid", null, new { request.ReferenceCode, amount = (long)request.Amount }, paidAt, ct);
        await ledger.FinalizeIfDoneAsync(order, paidAt, ct);
    }
}

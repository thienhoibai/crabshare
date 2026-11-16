using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Batches;

using CrabShare.Api.Features.Parties;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Sales;

/// <summary>Trạng thái đơn đặt trước theo BR v1.5.</summary>
public static class PreorderStatus
{
    public const string PendingDeposit = "PendingDeposit";
    public const string Deposited = "Deposited";
    public const string Confirmed = "Confirmed";
    public const string CancelRequested = "CancelRequested";
    public const string Cancelled = "Cancelled";
    public const string Forfeited = "Forfeited";
    public const string Refunded = "Refunded";
    /// <summary>Đơn đang giữ số lượng của Lô (BR-089): giữ chưa hết hạn, đã cọc, đã xác nhận.</summary>
    public static readonly string[] Committing = [PendingDeposit, Deposited, Confirmed];
}

/// <summary>
/// WF-04 đặt trước sỉ và đặt cọc (BR-084…097, BR-234). Đặt trước khoá dòng Lô (UPDLOCK, HOLDLOCK) trong transaction Serializable,
/// nên 50 lượt đặt cọc đồng thời vẫn không bán vượt số con đặt trước được (BR-055) và số lượng chào của từng quy cách (BR-089).
/// </summary>
public sealed class PreorderService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, PartyDirectory parties,
    PlatformParameters parameters, PaymentRequestService payments)
{
    // ---------- đặt trước ----------
    public async Task<PreorderResponse> CreateAsync(PreorderRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        foreach (var line in req.Lines) BatchService.Validate(line);
        var orderNo = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var userId = me.UserId;
            if (!await db.Customers.AnyAsync(c => c.UserId == userId, ct))
                throw new ForbiddenException("preorder.customer_required", "Tài khoản chưa có hồ sơ khách hàng.");
            var partyId = await parties.PartyIdOfUserAsync(userId, ct);
            var batch = await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_code = {req.BatchCode}")
                            .SingleOrDefaultAsync(ct)
                        ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
            var now = clock.GetUtcNow();
            if (!AcceptsPreorders(batch, now))
                throw new BusinessRuleException("preorder.not_open", "Lô không nhận đặt trước lúc này (BR-085, BR-086).");
            if (await parties.IsExecutorOrRelatedAsync(batch.BatchId, partyId, ct))
                throw new ForbiddenException("preorder.related_party", "Người nuôi của Lô và bên liên quan không được đặt trước Lô của mình (BR-094).");

            var site = await db.PartySites.SingleOrDefaultAsync(s => s.SiteId == req.DeliverySiteId && s.PartyId == partyId &&
                           s.SiteType == "DeliveryAddress" && s.Status == "Active", ct)
                       ?? throw new NotFoundException("preorder.site_not_found", "Không tìm thấy địa chỉ giao của bạn.");
            if (site.Latitude is null || site.Longitude is null)
                throw new BusinessRuleException("preorder.site_coordinates", "Địa chỉ giao phải có toạ độ (chọn trên bản đồ) để tính khoảng cách (BR-084).");
            var dispatch = await db.PartySites.AsNoTracking().SingleOrDefaultAsync(s => s.SiteId == batch.DispatchSiteId, ct);
            if (dispatch?.Latitude is null || dispatch.Longitude is null)
                throw new BusinessRuleException("preorder.no_dispatch_site", "Lô chưa khai điểm xuất hàng có toạ độ nên chưa nhận đặt trước (BR-084).");
            var distance = decimal.Round(BatchExploreService.DistanceKm(site.Latitude.Value, site.Longitude.Value, dispatch.Latitude.Value, dispatch.Longitude.Value), 1);
            if (batch.DeliveryRadiusKm is { } radius && distance > radius)
                throw new BusinessRuleException("preorder.out_of_radius", $"Địa chỉ cách điểm xuất hàng {distance} km, ngoài bán kính giao {radius} km (BR-085).");

            var offers = await db.Offers.Include(o => o.Spec).Where(o => o.BatchId == batch.BatchId).ToListAsync(ct);
            var lines = new List<SalesOrderLine>();
            foreach (var l in req.Lines)
            {
                var offer = offers.SingleOrDefault(o => o.Spec.SpecCode == l.SpecCode.Trim().ToUpperInvariant())
                            ?? throw new BusinessRuleException("preorder.spec_not_offered", $"Lô không chào giá quy cách {l.SpecCode}.");
                if (l.MinGrade is { } min && GradeRank(min) > offer.Spec.GradeRank)
                    throw new BusinessRuleException("preorder.min_grade", "Hạng tối thiểu không được cao hơn hạng của quy cách.");
                lines.Add(NewLine(batch.BatchId, offer, l, now));
            }
            var converted = lines.Sum(l => l.ConvertedCrabs);
            var moment = batch.FundingOpenAt ?? batch.ApprovedAt ?? now;
            var minCrabs = await parameters.GetIntAsync(ParamKeys.MinOrderCrabs, moment, ct);
            if (converted < minCrabs)
                throw new BusinessRuleException("preorder.below_minimum", $"Đơn tối thiểu {minCrabs} con quy đổi (BR-087).");

            // BR-089: không bán vượt, tính chung và theo từng quy cách.
            var committed = await CommittedAsync(batch.BatchId, now, ct);
            var sellable = await SellableAsync(batch, ct);
            if (committed.Total + converted > sellable)
                throw new BusinessRuleException("preorder.exceeds_sellable",
                    $"Lô chỉ còn đặt trước được {Math.Max(0, sellable - committed.Total)} con (BR-055, BR-089).");
            foreach (var line in lines)
            {
                var offer = offers.Single(o => o.OfferId == line.OfferId);
                var used = committed.BySpec.GetValueOrDefault(line.SpecId);
                if (used + line.ConvertedCrabs > offer.OfferedQuantity)
                    throw new BusinessRuleException("preorder.exceeds_offer",
                        $"Quy cách {offer.Spec.Name} chỉ còn {Math.Max(0, offer.OfferedQuantity - used)} con (BR-089).");
            }

            var estimated = lines.Sum(l => l.EstimatedValue);
            var rate = await parameters.GetAsync(ParamKeys.DepositRatePct, moment, ct);
            var deposit = (long)decimal.Round(estimated * rate / 100m, 0, MidpointRounding.AwayFromZero);
            var holdMinutes = await parameters.GetIntAsync(ParamKeys.OrderHoldMinutes, moment, ct);
            var hold = now.AddMinutes(holdMinutes);
            var closesAt = batch.BatchMode == "P" ? batch.FundingDeadline : batch.PreorderDeadline;
            if (closesAt is { } close && close < hold) hold = close;

            var order = new SalesOrder
            {
                OrderNo = OrderNumber.New(), CustomerId = userId, CustomerPartyId = partyId, BatchId = batch.BatchId, OrderType = "PreOrder",
                Status = PreorderStatus.PendingDeposit, TotalAmount = estimated, EstimatedValue = estimated, DepositAmount = deposit,
                DepositRatePct = rate, HoldExpiresAt = hold, DeliverySiteId = site.SiteId, DeliveryDistanceKm = distance,
                RecipientName = site.ContactName ?? site.Name, RecipientPhone = site.ContactPhone ?? "0000000000",
                ShippingAddress = site.AddressLine, PlacedAt = now, CreatedAt = now, UpdatedAt = now,
            };
            db.SalesOrders.Add(order);
            await db.SaveChangesAsync(ct);
            foreach (var line in lines) line.OrderId = order.OrderId;
            db.SalesOrderLines.AddRange(lines);
            await db.SaveChangesAsync(ct);
            await SaveTranchesAsync(order, batch, lines, req.Tranches, now, ct);

            var account = await db.BatchAccounts.SingleOrDefaultAsync(a => a.BatchId == batch.BatchId && a.Status == "Open", ct)
                          ?? throw new BusinessRuleException("preorder.batch_account_unavailable", "Lô chưa có tài khoản để nhận cọc.");
            if (deposit > 0)
                await payments.CreateAsync(PaymentPurposes.PreOrderDeposit, deposit, account.BatchAccountId, account.ProviderAccountNo, hold,
                    PaymentTarget.ForOrder(order), order.OrderNo, ct);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("sales_order", order.OrderId, "preorder", null, new
            {
                order.OrderNo, batch.BatchCode, estimatedValue = estimated, deposit, rate, convertedCrabs = converted, hold,
                lines = lines.Select(l => new { l.SpecId, l.OrderMode, l.QtyCrabs, l.QtyKg, l.ConvertedCrabs, price = (long)l.PricePerKg }),
            }, ct);
            return order.OrderNo;
        }, ct, IsolationLevel.Serializable);
        return await GetAsync(orderNo, ct);
    }

    internal static bool AcceptsPreorders(Batch b, DateTimeOffset now)
        => b.BatchMode == "P"
            ? b.Status == "Funding" && b.CapitalClosedAt == null && b.FundingOpenAt <= now && b.FundingDeadline > now
            : b.Status == "Sourcing" && b.PreorderDeadline > now;

    private static int GradeRank(string grade) => grade == "SPECIAL" ? 2 : 1;

    /// <summary>BR-087: số con quy đổi của dòng theo kg = kg ÷ khối lượng quy đổi mỗi con, làm tròn lên. BR-092: kg ước tính, giá trị ước tính.</summary>
    internal static SalesOrderLine NewLine(long batchId, Offer offer, PreorderLineRequest l, DateTimeOffset now)
    {
        var byKg = l.Mode == "ByKg";
        var converted = byKg ? (int)Math.Ceiling(l.QtyKg!.Value * 1000m / offer.ConversionWeightG) : l.QtyCrabs!.Value;
        var estimatedKg = byKg ? l.QtyKg!.Value : decimal.Round(l.QtyCrabs!.Value * offer.ConversionWeightG / 1000m, 3);
        return new SalesOrderLine
        {
            BatchId = batchId, OfferId = offer.OfferId, SpecId = offer.SpecId, Spec = offer.Spec, OrderMode = l.Mode,
            QtyCrabs = byKg ? null : l.QtyCrabs, QtyKg = byKg ? l.QtyKg : null, ConvertedCrabs = converted,
            PricePerKg = offer.PricePerKg, ConversionWeightG = offer.ConversionWeightG, MinGradeCode = l.MinGrade,
            EstimatedKg = estimatedKg, EstimatedValue = decimal.Round(estimatedKg * offer.PricePerKg, 0, MidpointRounding.AwayFromZero), CreatedAt = now,
        };
    }

    /// <summary>Số con quy đổi đang giữ và đã cọc của Lô, tính chung và theo quy cách.</summary>
    internal async Task<(int Total, Dictionary<long, int> BySpec)> CommittedAsync(long batchId, DateTimeOffset now, CancellationToken ct)
    {
        var rows = await db.SalesOrderLines.AsNoTracking()
            .Where(l => l.BatchId == batchId && db.SalesOrders.Any(o => o.OrderId == l.OrderId && o.OrderType == "PreOrder" &&
                (o.Status == PreorderStatus.Deposited || o.Status == PreorderStatus.Confirmed ||
                 (o.Status == PreorderStatus.PendingDeposit && o.HoldExpiresAt > now))))
            .GroupBy(l => l.SpecId).Select(g => new { g.Key, Crabs = g.Sum(l => l.ConvertedCrabs) }).ToListAsync(ct);
        return (rows.Sum(r => r.Crabs), rows.ToDictionary(r => r.Key, r => r.Crabs));
    }

    /// <summary>BR-055: số con đặt trước được tại thời điểm đặt.</summary>
    internal async Task<int> SellableAsync(Batch batch, CancellationToken ct)
    {
        if (batch.BatchMode != "P" || batch.FundedQuantity is not null) return batch.FundedQuantity ?? batch.SeedQuantity;
        var confirmed = await db.Contributions.Where(c => c.BatchId == batch.BatchId && c.Status == "Confirmed").SumAsync(c => (decimal?)c.Amount, ct) ?? 0;
        return BatchExploreService.SellableCrabs(batch, (long)confirmed);
    }

    // ---------- đợt giao (BR-234) ----------
    private async Task SaveTranchesAsync(SalesOrder order, Batch batch, IReadOnlyList<SalesOrderLine> lines, List<TrancheRequest>? requested,
        DateTimeOffset now, CancellationToken ct)
    {
        var tranches = requested is { Count: > 0 }
            ? requested
            : [new TrancheRequest
            {
                Seq = 1, DueDate = DefaultDueDate(batch),
                Lines = lines.Select(l => new TrancheLineRequest { SpecCode = l.Spec.SpecCode, QtyCrabs = l.QtyCrabs, QtyKg = l.QtyKg }).ToList(),
            }];
        ValidateTranches(tranches, lines, batch);
        db.DeliveryTrancheLines.RemoveRange(await db.DeliveryTrancheLines.Where(l => db.DeliveryTranches.Any(t => t.TrancheId == l.TrancheId && t.OrderId == order.OrderId)).ToListAsync(ct));
        db.DeliveryTranches.RemoveRange(await db.DeliveryTranches.Where(t => t.OrderId == order.OrderId).ToListAsync(ct));
        await db.SaveChangesAsync(ct);
        foreach (var t in tranches.OrderBy(t => t.Seq))
        {
            var tranche = new DeliveryTranche { OrderId = order.OrderId, Seq = t.Seq, DueDate = t.DueDate, Status = "Planned", CreatedAt = now, UpdatedAt = now };
            foreach (var tl in t.Lines)
            {
                var line = lines.Single(l => l.Spec.SpecCode == tl.SpecCode.Trim().ToUpperInvariant());
                var converted = line.OrderMode == "ByKg"
                    ? (int)Math.Ceiling(tl.QtyKg!.Value * 1000m / line.ConversionWeightG)
                    : tl.QtyCrabs!.Value;
                tranche.Lines.Add(new DeliveryTrancheLine { LineId = line.LineId, QtyCrabs = tl.QtyCrabs, QtyKg = tl.QtyKg, ConvertedCrabs = converted });
            }
            db.DeliveryTranches.Add(tranche);
        }
        await db.SaveChangesAsync(ct);
    }

    internal static DateOnly DefaultDueDate(Batch batch)
    {
        var receipt = batch.ExpectedReceiptDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30));
        return batch.HasHolding ? receipt.AddDays(batch.CycleDays) : receipt.AddDays(2);
    }

    /// <summary>BR-234: tổng số lượng các đợt của một dòng bằng đúng số lượng của dòng; đơn vị của đợt theo hình thức đặt của dòng.</summary>
    internal static void ValidateTranches(IReadOnlyList<TrancheRequest> tranches, IReadOnlyList<SalesOrderLine> lines, Batch batch)
    {
        if (tranches.Select(t => t.Seq).Distinct().Count() != tranches.Count)
            throw new BusinessRuleException("preorder.tranche_seq", "Thứ tự đợt giao bị trùng.");
        var earliest = batch.ExpectedReceiptDate ?? DateOnly.MinValue;
        foreach (var t in tranches)
        {
            if (t.DueDate < earliest)
                throw new BusinessRuleException("preorder.tranche_date", "Ngày đến hạn của đợt giao không được trước ngày nhận hàng dự kiến của Lô.");
            if (t.Lines.Count == 0)
                throw new BusinessRuleException("preorder.tranche_empty", "Mỗi đợt giao phải có ít nhất một dòng.");
        }
        foreach (var line in lines)
        {
            var parts = tranches.SelectMany(t => t.Lines).Where(l => l.SpecCode.Trim().ToUpperInvariant() == line.Spec.SpecCode).ToList();
            if (parts.Any(p => (line.OrderMode == "ByKg") != (p.QtyKg is not null) || (p.QtyKg is null && p.QtyCrabs is null)))
                throw new BusinessRuleException("preorder.tranche_unit", $"Đợt giao của dòng {line.Spec.SpecCode} phải dùng cùng đơn vị với dòng đơn.");
            var ok = line.OrderMode == "ByKg" ? parts.Sum(p => p.QtyKg ?? 0) == line.QtyKg : parts.Sum(p => p.QtyCrabs ?? 0) == line.QtyCrabs;
            if (!ok)
                throw new BusinessRuleException("preorder.tranche_total", $"Tổng các đợt của dòng {line.Spec.SpecCode} phải bằng đúng số lượng của dòng (BR-234).");
        }
        var known = lines.Select(l => l.Spec.SpecCode).ToHashSet();
        if (tranches.SelectMany(t => t.Lines).Any(l => !known.Contains(l.SpecCode.Trim().ToUpperInvariant())))
            throw new BusinessRuleException("preorder.tranche_spec", "Đợt giao có quy cách không thuộc đơn.");
    }

    public async Task<PreorderResponse> SplitTranchesAsync(string orderNo, SplitTranchesRequest req, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            var order = await OwnOrderAsync(orderNo, ct);
            var batch = await db.Batches.SingleAsync(b => b.BatchId == order.BatchId, ct);
            if (order.Status is not (PreorderStatus.PendingDeposit or PreorderStatus.Deposited or PreorderStatus.Confirmed) ||
                batch.Status is "Selling" or "Settlement" or "Closed")
                throw new BusinessRuleException("preorder.tranche_locked", "Chỉ chia đợt khi đặt hoặc trước khi Lô chuyển Selling (BR-234).");
            if (await db.DeliveryTranches.AnyAsync(t => t.OrderId == order.OrderId && t.Status != "Planned", ct))
                throw new BusinessRuleException("preorder.tranche_locked", "Đã có đợt giao được phân bổ hoặc xuất hàng.");
            var lines = await db.SalesOrderLines.Include(l => l.Spec).Where(l => l.OrderId == order.OrderId).ToListAsync(ct);
            var before = await TranchesAsync(order.OrderId, ct);
            await SaveTranchesAsync(order, batch, lines, req.Tranches, clock.GetUtcNow(), ct);
            await audit.WriteAsync("sales_order", order.OrderId, "split_tranches", before, req.Tranches, ct);
        }, ct);
        return await GetAsync(orderNo, ct);
    }

    // ---------- huỷ (BR-096, BR-097) ----------
    public async Task<PreorderResponse> CancelAsync(string orderNo, CancelPreorderRequest req, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var order = await OwnOrderAsync(orderNo, ct);
            var now = clock.GetUtcNow();
            var before = order.Status;
            switch (order.Status)
            {
                case PreorderStatus.PendingDeposit:
                    // Chưa cọc thì không mất gì.
                    order.Status = PreorderStatus.Cancelled;
                    order.CancelledAt = now;
                    await CancelPendingPaymentsAsync(order.OrderId, now, ct);
                    break;
                case PreorderStatus.Deposited:
                    // Lô còn gọi vốn: cọc giữ tới khi đóng gọi vốn, rồi xử lý theo việc Lô có mở hay không (BR-097).
                    order.Status = PreorderStatus.CancelRequested;
                    order.CancelRequestedAt = now;
                    break;
                case PreorderStatus.Confirmed:
                    // Đã cọc mà Lô đã mở: mất cọc, cọc thành doanh thu của Lô (BR-096).
                    order.Status = PreorderStatus.Forfeited;
                    order.CancelRequestedAt = order.ForfeitedAt = now;
                    break;
                default:
                    throw new BusinessRuleException("preorder.not_cancellable", "Đơn ở trạng thái này không huỷ được.");
            }
            order.CancelReason = req.Reason?.Trim() ?? "Khách huỷ đơn";
            order.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("sales_order", order.OrderId, "cancel", new { status = before }, new { order.Status, order.CancelReason }, ct);
        }, ct);
        return await GetAsync(orderNo, ct);
    }

    private async Task CancelPendingPaymentsAsync(long orderId, DateTimeOffset now, CancellationToken ct)
    {
        foreach (var r in await db.PaymentRequests.Where(r => r.OrderId == orderId && r.Status == "Pending").ToListAsync(ct))
        {
            r.Status = "Cancelled";
            r.UpdatedAt = now;
        }
    }

    // ---------- đọc ----------
    public async Task<PreorderResponse> GetAsync(string orderNo, CancellationToken ct)
    {
        var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(o => o.OrderNo == orderNo && o.OrderType == "PreOrder", ct)
                    ?? throw new NotFoundException("preorder.not_found", "Không tìm thấy đơn đặt trước.");
        await RequireViewerAsync(order, ct);
        return await ResponseAsync(order, ct);
    }

    public async Task<PagedResult<PreorderResponse>> MineAsync(PageQuery paging, CancellationToken ct)
    {
        var userId = me.UserId;
        var page = await db.SalesOrders.AsNoTracking().Where(o => o.CustomerId == userId && o.OrderType == "PreOrder")
            .OrderByDescending(o => o.PlacedAt).ToPagedAsync(paging, ct);
        var items = new List<PreorderResponse>();
        foreach (var o in page.Items) items.Add(await ResponseAsync(o, ct));
        return new(items, page.Page, page.PageSize, page.Total);
    }

    /// <summary>Người nuôi xem các đơn đặt trước của Lô mình vận hành.</summary>
    public async Task<PagedResult<PreorderResponse>> ForOperatorAsync(string? batchCode, PageQuery paging, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var page = await db.SalesOrders.AsNoTracking()
            .Where(o => o.OrderType == "PreOrder" && o.Batch.OperatorId == operatorId && (batchCode == null || o.Batch.BatchCode == batchCode))
            .OrderByDescending(o => o.PlacedAt).ToPagedAsync(paging, ct);
        var items = new List<PreorderResponse>();
        foreach (var o in page.Items) items.Add(await ResponseAsync(o, ct));
        return new(items, page.Page, page.PageSize, page.Total);
    }

    public async Task<AvailabilityResponse> AvailabilityAsync(string batchCode, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchCode == batchCode && b.ApprovedAt != null, ct)
                    ?? throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        var now = clock.GetUtcNow();
        var committed = await CommittedAsync(batch.BatchId, now, ct);
        var sellable = await SellableAsync(batch, ct);
        var offers = await db.Offers.AsNoTracking().Include(o => o.Spec).Where(o => o.BatchId == batch.BatchId)
            .OrderBy(o => o.Spec.SizeRank).ThenByDescending(o => o.Spec.GradeRank).ToListAsync(ct);
        var moment = batch.FundingOpenAt ?? batch.ApprovedAt ?? now;
        return new AvailabilityResponse(batch.BatchCode, AcceptsPreorders(batch, now), sellable, committed.Total, Math.Max(0, sellable - committed.Total),
            offers.Select(o =>
            {
                var used = committed.BySpec.GetValueOrDefault(o.SpecId);
                return new SpecAvailability(o.Spec.SpecCode, o.Spec.Name, (long)o.PricePerKg, o.ConversionWeightG, o.OfferedQuantity, used,
                    Math.Max(0, Math.Min(o.OfferedQuantity - used, sellable - committed.Total)));
            }).ToList(),
            await parameters.GetIntAsync(ParamKeys.MinOrderCrabs, moment, ct), await parameters.GetAsync(ParamKeys.DepositRatePct, moment, ct),
            await parameters.GetIntAsync(ParamKeys.OrderHoldMinutes, moment, ct));
    }

    /// <summary>Mã VietQR cọc còn hiệu lực của đơn; hết hạn thì không cấp mã mới vì đơn đã hết giữ.</summary>
    public async Task<DepositPaymentResponse?> DepositAsync(SalesOrder order, CancellationToken ct)
    {
        var request = await db.PaymentRequests.AsNoTracking().Where(r => r.OrderId == order.OrderId && r.Purpose == PaymentPurposes.PreOrderDeposit)
            .OrderByDescending(r => r.PaymentRequestId).FirstOrDefaultAsync(ct);
        if (request is null) return null;
        var account = await db.BatchAccounts.AsNoTracking().SingleAsync(a => a.BatchAccountId == request.BatchAccountId, ct);
        var described = await payments.DescribeAsync(request, account, "", ct);
        return new DepositPaymentResponse(request.PaymentRequestId, request.ReferenceCode, (long)request.Amount, described.QrContent ?? "",
            request.ExpiresAt, account.ProviderAccountNo, described.Status);
    }

    private async Task<SalesOrder> OwnOrderAsync(string orderNo, CancellationToken ct)
    {
        var order = await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderNo == orderNo && o.OrderType == "PreOrder", ct)
                    ?? throw new NotFoundException("preorder.not_found", "Không tìm thấy đơn đặt trước.");
        if (order.CustomerId != me.UserId)
            throw new ForbiddenException("preorder.not_owner", "Đơn này không phải của bạn.");
        return order;
    }

    private async Task RequireViewerAsync(SalesOrder order, CancellationToken ct)
    {
        if (order.CustomerId == me.UserId || me.IsInRole(Roles.PlatformAdmin)) return;
        if (me.OperatorId is { } op && await db.Batches.AnyAsync(b => b.BatchId == order.BatchId && b.OperatorId == op, ct)) return;
        throw new ForbiddenException("preorder.not_owner", "Bạn không xem được đơn này.");
    }

    internal async Task<IReadOnlyList<TrancheResponse>> TranchesAsync(long orderId, CancellationToken ct)
    {
        var specs = await db.SalesOrderLines.AsNoTracking().Where(l => l.OrderId == orderId)
            .Select(l => new { l.LineId, l.Spec.SpecCode }).ToDictionaryAsync(l => l.LineId, l => l.SpecCode, ct);
        return (await db.DeliveryTranches.AsNoTracking().Include(t => t.Lines).Where(t => t.OrderId == orderId).OrderBy(t => t.Seq).ToListAsync(ct))
            .Select(t => new TrancheResponse(t.TrancheId, t.Seq, t.DueDate, t.Status,
                t.Lines.Select(l => new TrancheLineResponse(specs.GetValueOrDefault(l.LineId, ""), l.QtyCrabs, l.QtyKg, l.ConvertedCrabs)).ToList()))
            .ToList();
    }

    private async Task<PreorderResponse> ResponseAsync(SalesOrder o, CancellationToken ct)
    {
        var batch = await db.Batches.AsNoTracking().Where(b => b.BatchId == o.BatchId).Select(b => new { b.BatchCode, b.BatchMode }).SingleAsync(ct);
        var lines = await db.SalesOrderLines.AsNoTracking().Include(l => l.Spec).Where(l => l.OrderId == o.OrderId).OrderBy(l => l.LineId)
            .Select(l => new PreorderLineResponse(l.LineId, l.Spec.SpecCode, l.Spec.Name, l.OrderMode, l.QtyCrabs, l.QtyKg, l.ConvertedCrabs,
                (long)l.PricePerKg, l.ConversionWeightG, l.MinGradeCode, l.EstimatedKg, (long)l.EstimatedValue)).ToListAsync(ct);
        var deposit = o.Status == PreorderStatus.PendingDeposit ? await DepositAsync(o, ct) : null;
        return new PreorderResponse(o.OrderNo, batch.BatchCode, batch.BatchMode, o.Status, (long)(o.EstimatedValue ?? o.TotalAmount), o.DepositRatePct ?? 0,
            (long)(o.DepositAmount ?? 0), lines.Sum(l => l.ConvertedCrabs), o.PlacedAt, o.HoldExpiresAt, o.DepositedAt, o.ConfirmedAt,
            o.ShippingAddress, o.DeliveryDistanceKm, lines, await TranchesAsync(o.OrderId, ct), deposit, o.CancelReason);
    }
}

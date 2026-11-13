using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using CrabShare.Api.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Delivery;

/// <summary>
/// Đổi trả và khiếu nại sau giao (BR-172 – BR-176): trong hạn đổi trả, khách gửi một khiếu nại cho mỗi chuyến giao kèm ảnh chụp trong app;
/// người nuôi xử lý trong hạn phản hồi; quá hạn hoặc khách không đồng ý thì Admin quyết định cuối. Chấp nhận thì hoàn tiền theo
/// kg bị ảnh hưởng × giá mỗi kg của quy cách. Mỗi đơn đã giao một đánh giá.
/// </summary>
public sealed class ClaimService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, BatchAccess access, RefundService refunds,
    PlatformParameters parameters, EvidenceImageProcessor images, IFileStorage files)
{
    private static readonly string[] OpenStatuses = ["Open", "OperatorAccepted", "OperatorRejected", "Escalated"];

    public async Task<ClaimResponse> CreateAsync(string orderNo, CreateClaimRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        if (req.AffectedCrabs is null && req.AffectedKg is null)
            throw new BusinessRuleException("claim.affected_required", "Ghi số con hoặc số kg bị ảnh hưởng.");
        var image = await images.ReadAsync(req.Photo!, ct);
        StoredFile photo;
        await using (var stream = new MemoryStream(image.Bytes, writable: false))
            photo = await files.SaveAsync(stream, "claim" + image.Extension, image.ContentType, $"claims/{clock.GetUtcNow():yyyy/MM}", ct);
        var claimNo = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var order = await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderNo == orderNo && o.OrderType == "PreOrder", ct)
                        ?? throw new NotFoundException("preorder.not_found", "Không tìm thấy đơn đặt trước.");
            if (order.CustomerId != me.UserId)
                throw new ForbiddenException("preorder.not_owner", "Đơn này không phải của bạn.");
            var shipment = await db.Shipments.Include(s => s.Lines).SingleOrDefaultAsync(s => s.ShipmentNo == req.ShipmentNo && s.OrderId == order.OrderId, ct)
                           ?? throw new NotFoundException("delivery.shipment_not_found", "Không tìm thấy chuyến giao của đơn.");
            var now = clock.GetUtcNow();
            if (shipment.Status != "Accepted" || shipment.ReturnWindowEndsAt is not { } end || now > end)
                throw new BusinessRuleException("claim.window_closed", "Chỉ gửi khiếu nại cho chuyến đã nghiệm thu, trong hạn đổi trả (BR-172).");
            if (await db.CustomerClaims.AnyAsync(c => c.ShipmentId == shipment.ShipmentId, ct))
                throw new ConflictException("claim.exists", "Chuyến giao này đã có khiếu nại.");
            var line = await db.SalesOrderLines.Include(l => l.Spec).SingleOrDefaultAsync(l => l.OrderId == order.OrderId && l.Spec.SpecCode == req.SpecCode, ct)
                       ?? throw new NotFoundException("claim.line_not_found", "Đơn không có dòng quy cách này.");
            var shipped = shipment.Lines.SingleOrDefault(l => l.LineId == line.LineId);
            if (shipped is null || (shipped.AcceptedCrabs ?? 0) == 0)
                throw new BusinessRuleException("claim.line_not_delivered", "Chuyến giao không có cua nghiệm thu của quy cách này.");
            if (req.AffectedCrabs > shipped.AcceptedCrabs || req.AffectedKg > shipped.AcceptedKg)
                throw new BusinessRuleException("claim.affected_too_large", "Số bị ảnh hưởng vượt số đã nghiệm thu.");
            var hours = await parameters.GetIntAsync(ParamKeys.ClaimResponseHours, now, ct);
            var claim = new CustomerClaim
            {
                ClaimNo = Codes.New("KN", 10), OrderId = order.OrderId, ShipmentId = shipment.ShipmentId, LineId = line.LineId, ClaimType = req.ClaimType,
                IssueType = req.IssueType, AffectedCrabs = req.AffectedCrabs, AffectedKg = req.AffectedKg is { } kg ? decimal.Round(kg, 3) : null,
                Description = req.Description.Trim(), PhotoUri = photo.Uri, PhotoSha256 = photo.Sha256, Status = "Open", ResponseDueAt = now.AddHours(hours),
                CreatedBy = me.UserId, CreatedAt = now, UpdatedAt = now,
            };
            db.CustomerClaims.Add(claim);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("claim", claim.ClaimId, "create", null, new { claim.ClaimNo, order.OrderNo, claim.ClaimType, claim.IssueType, claim.AffectedCrabs, claim.AffectedKg }, ct);
            return claim.ClaimNo;
        }, ct, IsolationLevel.Serializable);
        return await GetAsync(claimNo, ct);
    }

    /// <summary>Người nuôi phản hồi trong hạn (mặc định 48 giờ).</summary>
    public async Task<ClaimResponse> RespondAsync(string claimNo, RespondClaimRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (claim, order) = await LoadAsync(claimNo, ct);
            await access.RequireOperatorAsync(await db.Batches.SingleAsync(b => b.BatchId == order.BatchId, ct), ct);
            var now = clock.GetUtcNow();
            if (claim.Status != "Open")
                throw new BusinessRuleException("claim.not_open", "Khiếu nại không còn chờ người nuôi phản hồi.");
            if (now > claim.ResponseDueAt)
                throw new BusinessRuleException("claim.response_overdue", "Đã quá hạn phản hồi; khiếu nại chuyển Admin quyết định (BR-172).");
            claim.Status = req.Accept ? "OperatorAccepted" : "OperatorRejected";
            claim.OperatorResponse = req.Response.Trim();
            claim.OperatorRespondedBy = me.UserId;
            claim.OperatorRespondedAt = claim.UpdatedAt = now;
            if (req.Accept) claim.RefundKg = req.RefundKg is { } kg ? decimal.Round(kg, 3) : null;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("claim", claim.ClaimId, "respond", new { status = "Open" }, new { claim.Status, claim.OperatorResponse, claim.RefundKg }, ct);
        }, ct, IsolationLevel.Serializable);
        return await GetAsync(claimNo, ct);
    }

    /// <summary>Khách đồng ý thì chốt theo phản hồi của người nuôi; không đồng ý thì chuyển Admin.</summary>
    public async Task<ClaimResponse> CustomerReplyAsync(string claimNo, CustomerReplyRequest req, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (claim, order) = await LoadAsync(claimNo, ct);
            if (order.CustomerId != me.UserId)
                throw new ForbiddenException("preorder.not_owner", "Đơn này không phải của bạn.");
            if (claim.Status is not ("OperatorAccepted" or "OperatorRejected"))
                throw new BusinessRuleException("claim.no_response", "Người nuôi chưa phản hồi khiếu nại.");
            var now = clock.GetUtcNow();
            var previous = claim.Status;
            claim.CustomerAgreed = req.Agree;
            claim.UpdatedAt = now;
            if (!req.Agree) claim.Status = "Escalated";
            else if (previous == "OperatorAccepted") await AcceptAsync(claim, order, claim.RefundKg, $"Người nuôi chấp nhận: {claim.OperatorResponse}", now, ct);
            else { claim.Status = "Rejected"; claim.DecidedAt = now; }
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("claim", claim.ClaimId, "customer_reply", new { status = previous }, new { claim.Status, req.Agree }, ct);
        }, ct, IsolationLevel.Serializable);
        return await GetAsync(claimNo, ct);
    }

    /// <summary>Admin quyết định cuối (BR-174) cho khiếu nại đã chuyển lên hoặc quá hạn phản hồi.</summary>
    public async Task<ClaimResponse> AdminDecideAsync(string claimNo, AdminClaimDecisionRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var (claim, order) = await LoadAsync(claimNo, ct);
            var now = clock.GetUtcNow();
            if (!(claim.Status == "Escalated" || (claim.Status == "Open" && now > claim.ResponseDueAt)))
                throw new BusinessRuleException("claim.not_escalated", "Admin chỉ quyết định khiếu nại đã chuyển lên hoặc quá hạn phản hồi.");
            var previous = claim.Status;
            claim.AdminDecision = req.Decision.Trim();
            claim.DecidedBy = me.UserId;
            claim.UpdatedAt = now;
            if (req.Accept) await AcceptAsync(claim, order, req.RefundKg, $"Admin quyết định: {claim.AdminDecision}", now, ct);
            else { claim.Status = "Rejected"; claim.DecidedAt = now; }
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("claim", claim.ClaimId, "admin_decide", new { status = previous }, new { claim.Status, claim.AdminDecision, claim.RefundAmount }, ct);
        }, ct, IsolationLevel.Serializable);
        return await GetAsync(claimNo, ct);
    }

    /// <summary>BR-173: hoàn tiền theo kg bị ảnh hưởng × giá mỗi kg của quy cách; số con thì quy ra kg theo kg bình quân đã nghiệm thu của dòng.</summary>
    private async Task AcceptAsync(CustomerClaim claim, SalesOrder order, decimal? refundKg, string note, DateTimeOffset now, CancellationToken ct)
    {
        var line = await db.ShipmentLines.SingleAsync(l => l.ShipmentId == claim.ShipmentId && l.LineId == claim.LineId, ct);
        var accepted = line.AcceptedKg ?? 0;
        var kg = refundKg ?? claim.AffectedKg ?? (line.AcceptedCrabs is > 0 && claim.AffectedCrabs is { } n ? accepted / line.AcceptedCrabs.Value * n : 0);
        kg = decimal.Round(Math.Min(kg, accepted), 3);
        var amount = SalesLedger.Money(kg * line.PricePerKg);
        claim.Status = "Accepted";
        claim.DecidedAt = now;
        claim.RefundKg = kg;
        claim.RefundAmount = amount;
        if (amount > 0)
        {
            var account = await db.BatchAccounts.SingleAsync(a => a.BatchId == order.BatchId, ct);
            var instruction = await refunds.CreateRefundAsync(account.BatchAccountId, amount, null, order.OrderId,
                $"Hoàn tiền khiếu nại {claim.ClaimNo}: {note}", now, ct);
            claim.RefundInstructionId = instruction.InstructionId;
        }
    }

    /// <summary>Quá hạn phản hồi mà người nuôi chưa xử lý thì chuyển Admin (BR-172).</summary>
    public async Task<int> EscalateOverdueAsync(CancellationToken ct)
        => await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var now = clock.GetUtcNow();
            var due = await db.CustomerClaims.Where(c => c.Status == "Open" && c.ResponseDueAt < now).ToListAsync(ct);
            foreach (var c in due)
            {
                c.Status = "Escalated";
                c.UpdatedAt = now;
                await audit.WriteAsync("claim", c.ClaimId, "escalate_overdue", new { status = "Open" }, new { c.Status }, now, ct);
            }
            await db.SaveChangesAsync(ct);
            return due.Count;
        }, ct);

    public async Task<ClaimResponse> GetAsync(string claimNo, CancellationToken ct)
    {
        var claim = await db.CustomerClaims.AsNoTracking().SingleOrDefaultAsync(c => c.ClaimNo == claimNo, ct)
                    ?? throw new NotFoundException("claim.not_found", "Không tìm thấy khiếu nại.");
        var order = await db.SalesOrders.AsNoTracking().SingleAsync(o => o.OrderId == claim.OrderId, ct);
        if (order.CustomerId != me.UserId && !me.IsInRole(Roles.PlatformAdmin))
            await access.RequireOperatorOrAdminReadAsync(await db.Batches.AsNoTracking().SingleAsync(b => b.BatchId == order.BatchId, ct), ct);
        return (await ResponsesAsync([claim], ct)).Single();
    }

    public async Task<IReadOnlyList<ClaimResponse>> ListAsync(string? status, bool mine, CancellationToken ct)
    {
        var query = db.CustomerClaims.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(c => c.Status == status);
        if (mine)
        {
            var operatorId = me.RequireOperatorId();
            query = query.Where(c => db.SalesOrders.Any(o => o.OrderId == c.OrderId && o.Batch.OperatorId == operatorId));
        }
        return await ResponsesAsync(await query.OrderByDescending(c => c.CreatedAt).Take(500).ToListAsync(ct), ct);
    }

    public async Task<(Stream Content, string ContentType)> PhotoAsync(string claimNo, CancellationToken ct)
    {
        await GetAsync(claimNo, ct);
        var uri = await db.CustomerClaims.Where(c => c.ClaimNo == claimNo).Select(c => c.PhotoUri).SingleAsync(ct);
        var type = Path.GetExtension(uri).ToLowerInvariant() switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
        return (await files.OpenReadAsync(uri, ct), type);
    }

    /// <summary>BR-176: khách đánh giá đơn đã giao, mỗi đơn một lần.</summary>
    public async Task<OrderRatingResponse> RateAsync(string orderNo, RateOrderRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        await db.InTransactionAsync(async () =>
        {
            var order = await db.SalesOrders.SingleOrDefaultAsync(o => o.OrderNo == orderNo && o.OrderType == "PreOrder", ct)
                        ?? throw new NotFoundException("preorder.not_found", "Không tìm thấy đơn đặt trước.");
            if (order.CustomerId != me.UserId) throw new ForbiddenException("preorder.not_owner", "Đơn này không phải của bạn.");
            if (order.Status is not (OrderStatus.Delivered or OrderStatus.Completed))
                throw new BusinessRuleException("rating.not_delivered", "Chỉ đánh giá đơn đã giao.");
            if (await db.OrderRatings.AnyAsync(r => r.OrderId == order.OrderId, ct))
                throw new ConflictException("rating.exists", "Đơn này đã được đánh giá.");
            db.OrderRatings.Add(new OrderRating
            {
                OrderId = order.OrderId, Stars = (byte)req.Stars, Comment = string.IsNullOrWhiteSpace(req.Comment) ? null : req.Comment.Trim(),
                CreatedBy = me.UserId, CreatedAt = clock.GetUtcNow(),
            });
            await db.SaveChangesAsync(ct);
        }, ct);
        var orderId = await db.SalesOrders.Where(o => o.OrderNo == orderNo).Select(o => o.OrderId).SingleAsync(ct);
        var rating = await db.OrderRatings.AsNoTracking().SingleAsync(r => r.OrderId == orderId, ct);
        return new OrderRatingResponse(orderNo, rating.Stars, rating.Comment, rating.CreatedAt);
    }

    private async Task<(CustomerClaim Claim, SalesOrder Order)> LoadAsync(string claimNo, CancellationToken ct)
    {
        var claim = await db.CustomerClaims.FromSqlInterpolated($"SELECT * FROM dbo.claim WITH (UPDLOCK, HOLDLOCK) WHERE claim_no = {claimNo}").SingleOrDefaultAsync(ct)
                    ?? throw new NotFoundException("claim.not_found", "Không tìm thấy khiếu nại.");
        return (claim, await db.SalesOrders.SingleAsync(o => o.OrderId == claim.OrderId, ct));
    }

    private async Task<IReadOnlyList<ClaimResponse>> ResponsesAsync(IReadOnlyList<CustomerClaim> claims, CancellationToken ct)
    {
        var orderIds = claims.Select(c => c.OrderId).Distinct().ToList();
        var shipmentIds = claims.Select(c => c.ShipmentId).Distinct().ToList();
        var lineIds = claims.Select(c => c.LineId).Distinct().ToList();
        var orders = await db.SalesOrders.Where(o => orderIds.Contains(o.OrderId)).ToDictionaryAsync(o => o.OrderId, o => o.OrderNo, ct);
        var shipments = await db.Shipments.Where(s => shipmentIds.Contains(s.ShipmentId)).ToDictionaryAsync(s => s.ShipmentId, s => s.ShipmentNo, ct);
        var specs = await db.SalesOrderLines.Where(l => lineIds.Contains(l.LineId)).Select(l => new { l.LineId, l.Spec.SpecCode }).ToDictionaryAsync(l => l.LineId, l => l.SpecCode, ct);
        return claims.Select(c => new ClaimResponse(c.ClaimNo, orders[c.OrderId], shipments[c.ShipmentId], specs[c.LineId], c.ClaimType, c.IssueType,
            c.AffectedCrabs, c.AffectedKg, c.Description, c.Status, c.ResponseDueAt, c.OperatorResponse, c.OperatorRespondedAt, c.CustomerAgreed,
            c.AdminDecision, c.DecidedAt, c.RefundKg, c.RefundAmount is { } r ? (long)r : null, c.CreatedAt)).ToList();
    }

    public static bool IsOpen(string status) => OpenStatuses.Contains(status);
}

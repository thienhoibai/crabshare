using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

public sealed class OrderReturnService(
    AppDbContext db, ICurrentUser me, IAuditLog audit, RefundService refunds, TimeProvider clock)
{
    public const string ReturnAction = "return";
    public const string ReturnRequestAction = "return_request";
    public const string ReturnRejectAction = "return_reject";
    private static readonly string[] ReturnAuditActions = [ReturnRequestAction, ReturnRejectAction, ReturnAction];
    private static readonly string[] SettledStatuses = ["Approved", "PaidOut", "Closed"];

    public async Task<bool> CanReturnAsync(string orderNo, CancellationToken ct)
    {
        var (canReturn, _) = await GetStateAsync(orderNo, ct);
        return canReturn;
    }

    public async Task<(bool CanReturn, ReturnRequestInfo? ReturnRequest)> GetStateAsync(string orderNo, CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct);
        if (order is null) return (false, null);

        var reqInfo = await GetReturnRequestByOrderIdAsync(order.OrderId, ct);
        if (order.CustomerId != me.UserId) return (false, reqInfo);
        if (reqInfo?.Status == "Pending") return (false, reqInfo);

        var canReturn = await BlockAsync(order, now, ct) is null;
        return (canReturn, reqInfo);
    }

    public async Task<ReturnRequestInfo?> GetReturnRequestByOrderIdAsync(long orderId, CancellationToken ct)
    {
        var map = await GetReturnRequestsByOrderIdsAsync([orderId], ct);
        return map.GetValueOrDefault(orderId);
    }

    public async Task<Dictionary<long, ReturnRequestInfo>> GetReturnRequestsByOrderIdsAsync(
        IReadOnlyCollection<long> orderIds, CancellationToken ct)
    {
        var result = new Dictionary<long, ReturnRequestInfo>();
        if (orderIds.Count == 0) return result;

        var logs = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == "sales_order"
                        && orderIds.Contains(a.EntityId)
                        && ReturnAuditActions.Contains(a.ActionType))
            .OrderBy(a => a.AuditId)
            .ToListAsync(ct);

        foreach (var group in logs.GroupBy(a => a.EntityId))
        {
            string reason = "";
            string? evidenceUri = null;
            DateTimeOffset requestedAt = default;
            ReturnRequestInfo? latest = null;

            foreach (var log in group)
            {
                if (string.IsNullOrWhiteSpace(log.NewValue)) continue;
                try
                {
                    using var doc = JsonDocument.Parse(log.NewValue);
                    var root = doc.RootElement;

                    if (log.ActionType == ReturnRequestAction)
                    {
                        reason = GetStr(root, "reason") ?? reason;
                        evidenceUri = GetStr(root, "evidenceUri") ?? evidenceUri;
                        requestedAt = log.OccurredAt;
                        latest = new ReturnRequestInfo(
                            "Pending",
                            reason,
                            evidenceUri,
                            requestedAt);
                    }
                    else if (log.ActionType == ReturnRejectAction)
                    {
                        reason = GetStr(root, "reason") ?? reason;
                        evidenceUri = GetStr(root, "evidenceUri") ?? evidenceUri;
                        if (requestedAt == default) requestedAt = log.OccurredAt;
                        var opNote = GetStr(root, "operatorNote");
                        var opEvidence = GetStr(root, "operatorEvidenceUri");
                        latest = new ReturnRequestInfo(
                            "Rejected",
                            reason,
                            evidenceUri,
                            requestedAt,
                            log.OccurredAt,
                            opNote,
                            opEvidence);
                    }
                    else if (log.ActionType == ReturnAction)
                    {
                        reason = GetStr(root, "reason") ?? reason;
                        evidenceUri = GetStr(root, "evidenceUri") ?? evidenceUri;
                        if (requestedAt == default) requestedAt = log.OccurredAt;
                        var opNote = GetStr(root, "operatorNote");
                        var refundAmt = GetLong(root, "refundAmount");
                        var refundInstId = GetLong(root, "refundInstructionId");
                        latest = new ReturnRequestInfo(
                            "Approved",
                            reason,
                            evidenceUri,
                            requestedAt,
                            log.OccurredAt,
                            opNote,
                            null,
                            refundAmt,
                            refundInstId);
                    }
                }
                catch (JsonException)
                {
                    // Bỏ qua bản ghi JSON không hợp lệ
                }
            }

            if (latest is not null)
                result[group.Key] = latest;
        }

        return result;
    }

    public Task<ReturnOrderResponse> ReturnAsync(string orderNo, ReturnOrderRequest req, CancellationToken ct)
        => db.InTransactionAsync(() => ReturnInsideAsync(orderNo, req, ct), ct);

    public Task<ReturnOrderResponse> ApproveByOperatorAsync(string orderNo, ApproveReturnRequest req, CancellationToken ct)
        => db.InTransactionAsync(() => ApproveByOperatorInsideAsync(orderNo, req, ct), ct);

    public Task<ReturnRequestInfo> RejectByOperatorAsync(string orderNo, RejectReturnRequest req, CancellationToken ct)
        => db.InTransactionAsync(() => RejectByOperatorInsideAsync(orderNo, req, ct), ct);

    private async Task<ReturnOrderResponse> ReturnInsideAsync(string orderNo, ReturnOrderRequest req, CancellationToken ct)
    {
        var reason = (req.Reason ?? "").Trim();
        if (reason.Length is < 10 or > 300)
            throw new BusinessRuleException("order.return_reason_required",
                "Lý do trả hàng cần từ 10 đến 300 ký tự.");

        var evidenceUri = string.IsNullOrWhiteSpace(req.EvidenceUri) ? null : req.EvidenceUri.Trim();
        if (req.RequireApproval && string.IsNullOrWhiteSpace(evidenceUri))
            throw new BusinessRuleException("order.return_evidence_required",
                "Vui lòng đính kèm hình ảnh hoặc video mở thùng làm bằng chứng khi yêu cầu trả hàng.");

        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);

        var order = await db.SalesOrders.AsNoTracking()
                        .Include(o => o.PaymentRequests)
                        .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("order.not_found", "Không tìm thấy đơn hàng.");
        if (order.CustomerId != me.UserId)
            throw new ForbiddenException("order.not_owner", "Đơn hàng này không phải của bạn.");

        var block = await BlockAsync(order, now, ct);
        if (block is not null)
            throw new BusinessRuleException(block.Value.Code, block.Value.Message) { Details = block.Value.Details };

        var (refundAmount, accountId) = await ResolvePaidAccountAsync(order, ct);

        if (req.RequireApproval)
        {
            var existing = await GetReturnRequestByOrderIdAsync(order.OrderId, ct);
            if (existing?.Status == "Pending")
                throw new ConflictException("order.return_already_requested",
                    "Đơn hàng này đang có yêu cầu trả hàng chờ hộ nuôi xác nhận.");

            await audit.WriteAsync("sales_order", order.OrderId, ReturnRequestAction,
                new { status = order.Status },
                new
                {
                    status = "ReturnRequested",
                    reason,
                    evidenceUri,
                    expectedRefundAmount = (long)refundAmount,
                }, now, ct);

            var reqInfo = new ReturnRequestInfo("Pending", reason, evidenceUri, now);
            return new ReturnOrderResponse(order.OrderNo, "ReturnRequested", (long)refundAmount, 0, reqInfo);
        }

        return await ExecuteFinalizeReturnAsync(order, reason, evidenceUri, null, refundAmount, accountId, now, ct);
    }

    private async Task<ReturnOrderResponse> ApproveByOperatorInsideAsync(
        string orderNo, ApproveReturnRequest req, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);

        var order = await db.SalesOrders.AsNoTracking()
                        .Include(o => o.Batch)
                        .Include(o => o.PaymentRequests)
                        .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("pack.order_not_found", "Không tìm thấy đơn hàng.");
        if (order.Batch.OperatorId != operatorId)
            throw new ForbiddenException("pack.order_forbidden", "Đơn này không thuộc hộ nuôi của bạn.");

        var existing = await GetReturnRequestByOrderIdAsync(order.OrderId, ct);
        var reason = !string.IsNullOrWhiteSpace(existing?.Reason)
            ? existing.Reason
            : "Hộ nuôi xác nhận đồng ý trả hàng";
        var evidenceUri = existing?.EvidenceUri;
        var operatorNote = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();

        var block = await BlockAsync(order, now, ct);
        if (block is not null)
            throw new BusinessRuleException(block.Value.Code, block.Value.Message) { Details = block.Value.Details };

        var (refundAmount, accountId) = await ResolvePaidAccountAsync(order, ct);
        return await ExecuteFinalizeReturnAsync(order, reason, evidenceUri, operatorNote, refundAmount, accountId, now, ct);
    }

    private async Task<ReturnRequestInfo> RejectByOperatorInsideAsync(
        string orderNo, RejectReturnRequest req, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var rejectReason = (req.Reason ?? "").Trim();
        if (rejectReason.Length is < 5 or > 500)
            throw new BusinessRuleException("order.reject_reason_required",
                "Lý do từ chối trả hàng cần từ 5 đến 500 ký tự.");

        var now = AuditChain.Timestamp(clock.GetUtcNow());
        await audit.LockAsync(ct);

        var order = await db.SalesOrders.AsNoTracking()
                        .Include(o => o.Batch)
                        .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                    ?? throw new NotFoundException("pack.order_not_found", "Không tìm thấy đơn hàng.");
        if (order.Batch.OperatorId != operatorId)
            throw new ForbiddenException("pack.order_forbidden", "Đơn này không thuộc hộ nuôi của bạn.");

        var existing = await GetReturnRequestByOrderIdAsync(order.OrderId, ct);
        if (existing is null || existing.Status != "Pending")
            throw new BusinessRuleException("order.return_not_pending",
                "Đơn hàng hiện không có yêu cầu trả hàng nào đang chờ duyệt.");

        var opEvidence = string.IsNullOrWhiteSpace(req.EvidenceUri) ? null : req.EvidenceUri.Trim();

        await audit.WriteAsync("sales_order", order.OrderId, ReturnRejectAction,
            new { status = "ReturnRequested" },
            new
            {
                status = "Rejected",
                reason = existing.Reason,
                evidenceUri = existing.EvidenceUri,
                operatorNote = rejectReason,
                operatorEvidenceUri = opEvidence,
            }, now, ct);

        return new ReturnRequestInfo(
            "Rejected",
            existing.Reason,
            existing.EvidenceUri,
            existing.RequestedAt,
            now,
            rejectReason,
            opEvidence);
    }

    private async Task<ReturnOrderResponse> ExecuteFinalizeReturnAsync(
        SalesOrder order,
        string reason,
        string? evidenceUri,
        string? operatorNote,
        decimal refundAmount,
        long accountId,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var previousStatus = order.Status;

        var changed = await db.SalesOrders
            .Where(o => o.OrderId == order.OrderId
                        && (o.Status == "Shipping"
                            || (o.Status == "Delivered" && o.ReturnWindowEndsAt != null && o.ReturnWindowEndsAt > now)))
            .ExecuteUpdateAsync(s => s
                .SetProperty(o => o.Status, "Returned")
                .SetProperty(o => o.UpdatedAt, now), ct);
        if (changed == 0)
            throw new ConflictException("order.status_changed",
                "Trạng thái đơn vừa thay đổi, hãy tải lại rồi thử lại.");

        var note = $"Hoàn tiền trả hàng đơn {order.OrderNo}: {reason}";
        var instruction = await refunds.CreateRefundAsync(accountId, refundAmount, null, order.OrderId, note, now, ct);

        await audit.WriteAsync("sales_order", order.OrderId, ReturnAction,
            new { status = previousStatus },
            new
            {
                status = "Returned",
                reason,
                evidenceUri,
                operatorNote,
                refundAmount = (long)refundAmount,
                refundInstructionId = instruction.InstructionId,
            }, now, ct);

        var reqInfo = new ReturnRequestInfo(
            "Approved",
            reason,
            evidenceUri,
            now,
            now,
            operatorNote,
            null,
            (long)refundAmount,
            instruction.InstructionId);

        return new ReturnOrderResponse(order.OrderNo, "Returned", (long)refundAmount, instruction.InstructionId, reqInfo);
    }

    private async Task<(decimal RefundAmount, long BatchAccountId)> ResolvePaidAccountAsync(SalesOrder order, CancellationToken ct)
    {
        if (order.PaymentRequests.Count == 0)
        {
            order = await db.SalesOrders.AsNoTracking().Include(o => o.PaymentRequests)
                .SingleAsync(o => o.OrderId == order.OrderId, ct);
        }
        var paid = order.PaymentRequests.Where(r => r.Status == "Paid").ToList();
        if (paid.Count > 0)
            return (paid.Sum(r => r.Amount), paid[0].BatchAccountId);

        if (order.PaidAt is not null && order.TotalAmount > 0)
        {
            var accountId = await db.BatchAccounts.AsNoTracking()
                .Where(a => a.BatchId == order.BatchId)
                .Select(a => (long?)a.BatchAccountId)
                .FirstOrDefaultAsync(ct);
            if (accountId is not null)
                return (order.TotalAmount, accountId.Value);
        }

        return (0m, 0L);
    }

    private async Task<(string Code, string Message, object? Details)?> BlockAsync(
        SalesOrder order, DateTimeOffset now, CancellationToken ct)
    {
        if (order.Status == "Returned")
            return ("order.already_returned", "Đơn này đã được trả trước đó.", new { order.OrderNo, order.Status });
        if (order.Status is not ("Delivered" or "Shipping"))
            return ("order.return_not_delivered",
                "Chỉ trả được đơn đang giao hoặc đã giao, trong hạn đổi trả.",
                new { order.OrderNo, order.Status });
        if (order.Status == "Delivered" && (order.ReturnWindowEndsAt is null || now >= order.ReturnWindowEndsAt))
            return ("order.return_window_closed", "Đã hết hạn trả hàng của đơn này.",
                new { order.OrderNo, order.ReturnWindowEndsAt });
        if (order.Status == "Shipping" && order.ReturnWindowEndsAt is not null && now >= order.ReturnWindowEndsAt)
            return ("order.return_window_closed", "Đã hết hạn trả hàng của đơn này.",
                new { order.OrderNo, order.ReturnWindowEndsAt });

        var blockingComplaint = await db.Complaints.AsNoTracking()
            .AnyAsync(c => c.OrderId == order.OrderId && c.Status != "Rejected", ct);
        if (blockingComplaint)
            return ("order.return_blocked_by_complaint",
                "Đơn đang có khiếu nại chưa kết thúc bằng bác bỏ, không trả hàng chồng lên khiếu nại.",
                new { order.OrderNo });

        var (refundAmount, accountId) = await ResolvePaidAccountAsync(order, ct);
        if (refundAmount <= 0 || accountId == 0)
            return ("order.return_nothing_paid", "Đơn chưa có khoản thu nào đã thanh toán nên không hoàn được.",
                new { order.OrderNo });

        var accountOpen = await db.BatchAccounts.AsNoTracking()
            .AnyAsync(a => a.BatchAccountId == accountId && a.Status == "Open", ct);
        if (!accountOpen)
            return ("order.return_batch_account_closed",
                "Tài khoản lô không còn mở nên không lập được lệnh hoàn.",
                new { order.OrderNo, order.BatchId });

        var settled = await db.Settlements.AsNoTracking()
            .AnyAsync(s => s.BatchId == order.BatchId && SettledStatuses.Contains(s.Status), ct);
        if (settled)
            return ("order.return_batch_settled",
                "Lô đã quyết toán nên không trả hàng và hoàn tiền từ đơn này.",
                new { order.OrderNo, order.BatchId });

        return null;
    }

    private static string? GetStr(JsonElement root, string prop)
        => root.TryGetProperty(prop, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

    private static long? GetLong(JsonElement root, string prop)
        => root.TryGetProperty(prop, out var el) && el.ValueKind == JsonValueKind.Number && el.TryGetInt64(out var v) ? v : null;
}

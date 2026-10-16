using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Orders;

public sealed class ComplaintService(
    AppDbContext db,
    ICurrentUser me,
    IAuditLog audit,
    RefundService refunds,
    TimeProvider clock)
{
    public const int DefaultEscalateHours = 24;

    public async Task<ComplaintDetailResponse> SubmitAsync(string orderNo, CreateComplaintRequest req, CancellationToken ct)
    {
        var customerId = me.UserId;
        var now = AuditChain.Timestamp(clock.GetUtcNow());

        if (!ComplaintTypes.IsValid(req.ComplaintType))
            throw new BusinessRuleException(ComplaintErrors.InvalidType, "Loại khiếu nại không hợp lệ.")
            { Details = new { complaintType = req.ComplaintType, allowed = ComplaintTypes.All } };

        return await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);

            var order = await db.SalesOrders
                .Include(o => o.Batch).ThenInclude(b => b.Operator)
                .Include(o => o.Customer)
                .SingleOrDefaultAsync(o => o.OrderNo == orderNo, ct)
                ?? throw new NotFoundException(ComplaintErrors.OrderNotFound, "Không tìm thấy đơn hàng.");

            if (order.CustomerId != customerId)
                throw new ForbiddenException(ComplaintErrors.OrderNotOwner, "Đơn hàng này không thuộc tài khoản của bạn.");

            if (order.Status is "PendingPayment" or "DepositPaid" or "Paid" or "Packed")
                throw new BusinessRuleException(ComplaintErrors.OrderNotEligible,
                    "Đơn hàng chưa giao đến nơi. Bạn có thể huỷ đơn nếu chưa đóng gói, hoặc gửi khiếu nại sau khi nhận hàng.");

            if (order.Status is "Cancelled" or "Returned")
                throw new BusinessRuleException(ComplaintErrors.OrderNotEligible, "Đơn hàng đã được huỷ hoặc đã hoàn trả trước đó.");

            if (order.Status is "Delivered" or "Completed")
            {
                if (order.ReturnWindowEndsAt is { } deadline && deadline < now)
                    throw new BusinessRuleException(ComplaintErrors.OrderNotEligible,
                        "Đã quá thời hạn 72 giờ đổi trả/khiếu nại kể từ lúc giao hàng.");
            }

            var hasActive = await db.Complaints.AnyAsync(c =>
                c.OrderId == order.OrderId &&
                (c.Status == ComplaintStatuses.Open ||
                 c.Status == ComplaintStatuses.OperatorResponded ||
                 c.Status == ComplaintStatuses.Escalated), ct);

            if (hasActive)
                throw new BusinessRuleException(ComplaintErrors.AlreadyHasActive, "Đơn hàng này đang có khiếu nại đang chờ xử lý.");

            var complaint = new Complaint
            {
                OrderId = order.OrderId,
                ComplaintType = req.ComplaintType,
                Description = req.Description.Trim(),
                EvidenceUri = string.IsNullOrWhiteSpace(req.EvidenceUri) ? null : req.EvidenceUri.Trim(),
                Status = ComplaintStatuses.Open,
                OpenedAt = now,
                CreatedAt = now,
                UpdatedAt = now,
            };

            db.Complaints.Add(complaint);
            await db.SaveChangesAsync(ct);

            await audit.WriteAsync("complaint", complaint.ComplaintId, "create", null,
                new { complaintId = complaint.ComplaintId, orderNo = order.OrderNo, type = complaint.ComplaintType }, now, ct);

            return ToDetail(complaint, order);
        }, ct);
    }

    public async Task<ComplaintDetailResponse> RespondAsync(long complaintId, RespondComplaintRequest req, CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        var now = AuditChain.Timestamp(clock.GetUtcNow());

        return await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);

            var complaint = await db.Complaints
                .Include(c => c.Order).ThenInclude(o => o.Batch).ThenInclude(b => b.Operator)
                .Include(c => c.Order).ThenInclude(o => o.Customer)
                .Include(c => c.ResolvedByNavigation)
                .SingleOrDefaultAsync(c => c.ComplaintId == complaintId, ct)
                ?? throw new NotFoundException(ComplaintErrors.NotFound, "Không tìm thấy khiếu nại.");

            if (complaint.Order.Batch.OperatorId != operatorId)
                throw new ForbiddenException(ComplaintErrors.OperatorForbidden, "Bạn không có quyền giải trình khiếu nại của hộ nuôi khác.");

            if (complaint.Status is not (ComplaintStatuses.Open or ComplaintStatuses.Escalated))
                throw new BusinessRuleException(ComplaintErrors.CannotRespond, "Khiếu nại này đã được phản hồi hoặc đã được xử lý xong.");

            complaint.OperatorResponse = req.Response.Trim();
            complaint.OperatorEvidenceUri = string.IsNullOrWhiteSpace(req.EvidenceUri) ? null : req.EvidenceUri.Trim();
            complaint.RespondedAt = now;
            complaint.Status = ComplaintStatuses.OperatorResponded;
            complaint.UpdatedAt = now;

            await db.SaveChangesAsync(ct);

            await audit.WriteAsync("complaint", complaint.ComplaintId, "operator_respond", null,
                new { complaintId = complaint.ComplaintId, operatorId, response = complaint.OperatorResponse }, now, ct);

            return ToDetail(complaint, complaint.Order);
        }, ct);
    }

    public async Task<ComplaintDetailResponse> ResolveAsync(long complaintId, ResolveComplaintRequest req, CancellationToken ct)
    {
        var adminId = me.UserId;
        var now = AuditChain.Timestamp(clock.GetUtcNow());

        if (!ComplaintResolutions.IsValid(req.Resolution) && req.Resolution != ComplaintStatuses.Rejected)
            throw new BusinessRuleException(ComplaintErrors.InvalidResolution, "Kết quả xử lý khiếu nại không hợp lệ.")
            { Details = new { resolution = req.Resolution, allowed = ComplaintResolutions.All } };

        return await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);

            var complaint = await db.Complaints
                .Include(c => c.Order).ThenInclude(o => o.Batch).ThenInclude(b => b.Operator)
                .Include(c => c.Order).ThenInclude(o => o.Batch).ThenInclude(b => b.BatchAccount)
                .Include(c => c.Order).ThenInclude(o => o.Customer)
                .Include(c => c.ResolvedByNavigation)
                .SingleOrDefaultAsync(c => c.ComplaintId == complaintId, ct)
                ?? throw new NotFoundException(ComplaintErrors.NotFound, "Không tìm thấy khiếu nại.");

            if (complaint.Status is ComplaintStatuses.Resolved or ComplaintStatuses.Rejected)
                throw new BusinessRuleException(ComplaintErrors.AlreadyResolved, "Khiếu nại này đã được xử lý giải quyết trước đó.");

            var order = complaint.Order;

            if (req.Resolution == ComplaintResolutions.Refund)
            {
                if (!req.RefundAmount.HasValue || req.RefundAmount.Value <= 0 || req.RefundAmount.Value > order.TotalAmount)
                    throw new BusinessRuleException(ComplaintErrors.RefundAmountInvalid,
                        $"Số tiền hoàn phải lớn hơn 0 và không vượt quá tổng giá trị đơn ({order.TotalAmount:N0} đ).")
                    { Details = new { refundAmount = req.RefundAmount, orderTotal = order.TotalAmount } };

                var batchAccountId = order.Batch.BatchAccount?.BatchAccountId
                    ?? throw new BusinessRuleException("complaint.no_batch_account", "Lô nuôi chưa có tài khoản thanh toán.");
                await refunds.CreateRefundAsync(batchAccountId, req.RefundAmount.Value,
                    contributionId: null, orderId: order.OrderId,
                    note: $"Hoàn tiền khiếu nại #{complaint.ComplaintId}: {req.AdminNotes ?? req.Resolution}",
                    now, ct);

                complaint.Resolution = ComplaintResolutions.Refund;
                complaint.RefundAmount = req.RefundAmount.Value;
                complaint.Status = ComplaintStatuses.Resolved;

                if (req.RefundAmount.Value >= order.TotalAmount)
                {
                    order.Status = "Returned";
                    order.UpdatedAt = now;
                }
            }
            else if (req.Resolution == ComplaintStatuses.Rejected || req.Resolution == ComplaintResolutions.NoAction)
            {
                complaint.Status = ComplaintStatuses.Rejected;
                complaint.Resolution = ComplaintResolutions.NoAction;
                complaint.RefundAmount = null;
            }
            else
            {
                complaint.Status = ComplaintStatuses.Resolved;
                complaint.Resolution = req.Resolution;
                complaint.RefundAmount = null;
            }

            complaint.ResolvedBy = adminId;
            complaint.ResolvedAt = now;
            complaint.AdminNotes = string.IsNullOrWhiteSpace(req.AdminNotes) ? null : req.AdminNotes.Trim();
            complaint.UpdatedAt = now;

            await db.SaveChangesAsync(ct);

            await audit.WriteAsync("complaint", complaint.ComplaintId, "resolve", null,
                new { complaintId = complaint.ComplaintId, resolution = complaint.Resolution, refundAmount = complaint.RefundAmount, adminId },
                now, ct);

            return ToDetail(complaint, order);
        }, ct);
    }

    public async Task<int> EscalateOverdueAsync(CancellationToken ct)
    {
        var now = AuditChain.Timestamp(clock.GetUtcNow());
        var threshold = now.AddHours(-DefaultEscalateHours);

        return await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);

            var overdue = await db.Complaints
                .Where(c => c.Status == ComplaintStatuses.Open && c.OpenedAt <= threshold)
                .ToListAsync(ct);

            if (overdue.Count == 0) return 0;

            foreach (var c in overdue)
            {
                c.Status = ComplaintStatuses.Escalated;
                c.EscalatedAt = now;
                c.UpdatedAt = now;
                await audit.WriteAsync("complaint", c.ComplaintId, "escalate", null,
                    new { complaintId = c.ComplaintId, openedAt = c.OpenedAt, threshold }, now, ct);
            }

            await db.SaveChangesAsync(ct);
            return overdue.Count;
        }, ct);
    }

    public async Task<ComplaintDetailResponse> GetByIdAsync(long complaintId, CancellationToken ct)
    {
        var complaint = await db.Complaints
            .Include(c => c.Order).ThenInclude(o => o.Batch).ThenInclude(b => b.Operator)
            .Include(c => c.Order).ThenInclude(o => o.Customer)
            .Include(c => c.ResolvedByNavigation)
            .SingleOrDefaultAsync(c => c.ComplaintId == complaintId, ct)
            ?? throw new NotFoundException(ComplaintErrors.NotFound, "Không tìm thấy khiếu nại.");

        if (me.IsInRole(Roles.PlatformAdmin))
            return ToDetail(complaint, complaint.Order);

        if (me.IsInRole(Roles.OperatorMember) && complaint.Order.Batch.OperatorId == me.OperatorId)
            return ToDetail(complaint, complaint.Order);

        if (complaint.Order.CustomerId == me.UserId)
            return ToDetail(complaint, complaint.Order);

        throw new ForbiddenException("complaint.forbidden", "Bạn không có quyền xem khiếu nại này.");
    }

    public async Task<ComplaintDetailResponse?> GetByOrderNoAsync(string orderNo, CancellationToken ct)
    {
        var complaint = await db.Complaints
            .Include(c => c.Order).ThenInclude(o => o.Batch).ThenInclude(b => b.Operator)
            .Include(c => c.Order).ThenInclude(o => o.Customer)
            .Include(c => c.ResolvedByNavigation)
            .Where(c => c.Order.OrderNo == orderNo)
            .OrderByDescending(c => c.ComplaintId)
            .FirstOrDefaultAsync(ct);

        if (complaint == null) return null;

        if (me.IsInRole(Roles.PlatformAdmin))
            return ToDetail(complaint, complaint.Order);

        if (me.IsInRole(Roles.OperatorMember) && complaint.Order.Batch.OperatorId == me.OperatorId)
            return ToDetail(complaint, complaint.Order);

        if (complaint.Order.CustomerId == me.UserId)
            return ToDetail(complaint, complaint.Order);

        throw new ForbiddenException("complaint.forbidden", "Bạn không có quyền xem khiếu nại này.");
    }

    public async Task<PagedList<ComplaintSummaryResponse>> ListForAdminAsync(string? status, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.Complaints.AsNoTracking().Include(c => c.Order).ThenInclude(o => o.Batch).AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var parts = status.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            query = query.Where(c => parts.Contains(c.Status));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(c => c.OpenedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => ToSummary(c, c.Order))
            .ToListAsync(ct);

        return new PagedList<ComplaintSummaryResponse>(items, total, page, pageSize);
    }

    public async Task<List<ComplaintSummaryResponse>> ListForOperatorAsync(CancellationToken ct)
    {
        var operatorId = me.RequireOperatorId();
        return await db.Complaints.AsNoTracking()
            .Include(c => c.Order).ThenInclude(o => o.Batch)
            .Where(c => c.Order.Batch.OperatorId == operatorId)
            .OrderByDescending(c => c.OpenedAt)
            .Select(c => ToSummary(c, c.Order))
            .ToListAsync(ct);
    }

    public async Task<List<ComplaintSummaryResponse>> ListForCustomerAsync(CancellationToken ct)
    {
        var customerId = me.UserId;
        return await db.Complaints.AsNoTracking()
            .Include(c => c.Order).ThenInclude(o => o.Batch)
            .Where(c => c.Order.CustomerId == customerId)
            .OrderByDescending(c => c.OpenedAt)
            .Select(c => ToSummary(c, c.Order))
            .ToListAsync(ct);
    }

    private static ComplaintDetailResponse ToDetail(Complaint c, SalesOrder o) => new(
        ComplaintId: c.ComplaintId,
        OrderId: c.OrderId,
        OrderNo: o.OrderNo,
        BatchCode: o.Batch?.BatchCode ?? string.Empty,
        FarmName: o.Batch?.Operator?.LegalName ?? string.Empty,
        CustomerName: o.Customer?.FullName ?? o.RecipientName,
        CustomerEmail: o.Customer?.Email ?? string.Empty,
        TotalAmount: o.TotalAmount,
        ComplaintType: c.ComplaintType,
        Description: c.Description,
        EvidenceUri: c.EvidenceUri,
        Status: c.Status,
        OperatorResponse: c.OperatorResponse,
        OperatorEvidenceUri: c.OperatorEvidenceUri,
        RespondedAt: c.RespondedAt,
        EscalatedAt: c.EscalatedAt,
        Resolution: c.Resolution,
        RefundAmount: c.RefundAmount,
        AdminNotes: c.AdminNotes,
        ResolvedBy: c.ResolvedBy,
        ResolvedByName: c.ResolvedByNavigation?.FullName,
        OpenedAt: c.OpenedAt,
        ResolvedAt: c.ResolvedAt,
        CreatedAt: c.CreatedAt,
        UpdatedAt: c.UpdatedAt
    );

    private static ComplaintSummaryResponse ToSummary(Complaint c, SalesOrder o) => new(
        ComplaintId: c.ComplaintId,
        OrderId: c.OrderId,
        OrderNo: o.OrderNo,
        BatchCode: o.Batch?.BatchCode ?? string.Empty,
        CustomerName: o.RecipientName,
        ComplaintType: c.ComplaintType,
        Status: c.Status,
        TotalAmount: o.TotalAmount,
        Description: c.Description,
        OpenedAt: c.OpenedAt,
        RespondedAt: c.RespondedAt,
        EscalatedAt: c.EscalatedAt,
        ResolvedAt: c.ResolvedAt,
        Resolution: c.Resolution,
        RefundAmount: c.RefundAmount
    );
}

public sealed record PagedList<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

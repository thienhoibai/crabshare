using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Funding;

/// <summary>
/// Tiền góp vốn về tài khoản lô (webhook TH-06): khoản góp đang giữ chỗ chuyển sang Confirmed (UC12, TL-17 §6.1 bước 7).
/// Chạy bên trong transaction của webhook; khoản góp không còn Reserved (đã hết hạn/huỷ mà webhook vẫn khớp được, hoặc lô đã
/// đóng) thì chỉ ghi audit để admin đối soát, không tự sửa trạng thái.
/// </summary>
public sealed class ContributionPaymentHandler(AppDbContext db, IAuditLog audit, ILogger<ContributionPaymentHandler> log) : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.Contribution;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var contribution = request.ContributionId is { } id
            ? await db.Contributions.SingleOrDefaultAsync(c => c.ContributionId == id, ct)
            : null;
        if (contribution is null)
        {
            log.LogError("Khoản thu {PaymentRequestId} (Contribution) đã Paid nhưng không có khoản góp #{ContributionId}",
                request.PaymentRequestId, request.ContributionId);
            return;
        }

        if (contribution.Status != "Reserved")
        {
            await audit.WriteAsync("contribution", contribution.ContributionId, "payment_after_close",
                new { contribution.Status }, new { request.PaymentRequestId, request.ReferenceCode, amount = (long)request.Amount, paidAt }, paidAt, ct);
            return;
        }

        contribution.Status = "Confirmed";
        contribution.ConfirmedAt = paidAt;
        contribution.UpdatedAt = paidAt;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("contribution", contribution.ContributionId, "confirm", new { status = "Reserved" },
            new { status = "Confirmed", confirmedAt = paidAt, request.PaymentRequestId, request.ReferenceCode, amount = (long)request.Amount }, paidAt, ct);
    }
}

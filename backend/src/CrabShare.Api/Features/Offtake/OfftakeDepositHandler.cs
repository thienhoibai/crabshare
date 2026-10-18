using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Offtake;

/// <summary>Cọc bao tiêu về (webhook TH-06): deposit_status Pending → Held. Không đổi status cam kết, không tạo đơn.</summary>
public sealed class OfftakeDepositHandler(AppDbContext db, IAuditLog audit, ILogger<OfftakeDepositHandler> log)
    : IPaymentPurposeHandler
{
    public string Purpose => PaymentPurposes.OfftakeDeposit;

    public async Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct)
    {
        var offtake = request.OfftakeId is { } id
            ? await db.OfftakeCommitments.SingleOrDefaultAsync(o => o.OfftakeId == id, ct)
            : null;
        if (offtake is null)
        {
            log.LogError("Khoản thu {PaymentRequestId} (OfftakeDeposit) đã Paid nhưng không có offtake #{OfftakeId}",
                request.PaymentRequestId, request.OfftakeId);
            return;
        }

        var received = new { request.PaymentRequestId, request.ReferenceCode, amount = (long)request.Amount, paidAt };
        if (offtake.DepositStatus != "Pending" || offtake.Status == "Cancelled")
        {
            await audit.WriteAsync("offtake_commitment", offtake.OfftakeId, "deposit_after_close",
                new { offtake.Status, offtake.DepositStatus }, received, paidAt, ct);
            return;
        }

        offtake.DepositStatus = "Held";
        offtake.UpdatedAt = paidAt;
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("offtake_commitment", offtake.OfftakeId, OfftakeService.DepositHeldAction,
            new { depositStatus = "Pending" },
            new { depositStatus = "Held", received.PaymentRequestId, received.ReferenceCode, received.amount },
            paidAt, ct);
    }
}

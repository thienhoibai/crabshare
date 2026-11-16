using System.Linq.Expressions;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Payments;

/// <summary>Danh sách lệnh chi cho admin đối soát (UC40): lọc theo loại, trạng thái, lô. Mới nhất trước, tối đa 200 dòng.</summary>
public sealed class PaymentInstructionQueryService(AppDbContext db)
{
    private const int MaxRows = 200;

    /// <summary>Một lệnh chi cho web; dùng chung với PayoutSendService (trả về lệnh vừa gửi).</summary>
    public static readonly Expression<Func<PaymentInstruction, PaymentInstructionResponse>> Projection = i => new PaymentInstructionResponse(
        i.InstructionId, i.InstructionType, (long)i.Amount, i.Status, i.BatchAccount.Batch.BatchCode,
        i.ContributionId != null ? i.Contribution!.Investor.User.FullName
            : i.OrderId != null ? i.Order!.RecipientName
            : i.SettlementLineId != null ? i.SettlementLine!.Investor.User.FullName
            : i.TrancheId != null ? i.BatchAccount.Batch.Operator.LegalName
            : null,
        i.ContributionId, i.OrderId, i.TrancheId, i.Tranche != null ? i.Tranche.TrancheNo : null, i.SettlementLineId,
        i.BeneficiaryNote, i.CreatedAt, i.SentAt, i.CompletedAt);

    public async Task<IReadOnlyList<PaymentInstructionResponse>> ListAsync(PaymentInstructionQuery query, CancellationToken ct)
    {
        var rows = db.PaymentInstructions.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(query.Type)) rows = rows.Where(i => i.InstructionType == query.Type);
        if (!string.IsNullOrWhiteSpace(query.Status)) rows = rows.Where(i => i.Status == query.Status);
        if (!string.IsNullOrWhiteSpace(query.BatchCode)) rows = rows.Where(i => i.BatchAccount.Batch.BatchCode == query.BatchCode);
        return await rows.OrderByDescending(i => i.InstructionId).Take(MaxRows).Select(Projection).ToListAsync(ct);
    }
}

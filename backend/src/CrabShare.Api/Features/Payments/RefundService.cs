using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// Tạo lệnh hoàn tiền (payment_instruction loại Refund, trạng thái Created) từ tài khoản của lô. Dùng chung cho:
/// tiền đến sau hạn (TH-06), huỷ đơn đã trả (NH-07), khiếu nại (NH-11), lô huỷ vì thiếu vốn (TH-07).
/// Gọi BÊN TRONG transaction của module; hàm tự SaveChanges và ghi audit. Admin gửi lệnh đi ở TH-10.
/// </summary>
public sealed class RefundService(AppDbContext db, IAuditLog audit)
{
    /// <param name="contributionId">Khoản góp được hoàn (hoặc null).</param>
    /// <param name="orderId">Đơn hàng được hoàn (hoặc null).</param>
    /// <param name="note">Lý do, hiện cho admin lúc đối soát.</param>
    public async Task<PaymentInstruction> CreateRefundAsync(long batchAccountId, decimal amount, long? contributionId, long? orderId,
        string note, DateTimeOffset now, CancellationToken ct)
    {
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount), amount, "Số tiền hoàn phải lớn hơn 0.");
        var instruction = new PaymentInstruction
        {
            BatchAccountId = batchAccountId,
            InstructionType = "Refund",
            Amount = amount,
            ContributionId = contributionId,
            OrderId = orderId,
            BeneficiaryNote = note.Length > 200 ? note[..200] : note,
            Status = "Created",
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.PaymentInstructions.Add(instruction);
        await db.SaveChangesAsync(ct);
        await audit.WriteAsync("payment_instruction", instruction.InstructionId, "create", null,
            new { type = "Refund", amount = (long)amount, contributionId, orderId, note }, now, ct);
        return instruction;
    }
}

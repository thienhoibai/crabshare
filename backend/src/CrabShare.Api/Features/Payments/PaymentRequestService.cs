using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// Sinh yêu cầu thu tiền VietQR động vào tài khoản chuyên dùng của lô (TL-10, BR-66). Bản tối thiểu của TH-05:
/// mới có thu tiền đơn hàng. Hàm chỉ thêm bản ghi vào DbContext, không lưu — module gọi tự SaveChanges trong
/// transaction của mình, để yêu cầu thu tiền không bao giờ tồn tại tách rời khỏi nghĩa vụ của nó.
/// </summary>
public sealed class PaymentRequestService(AppDbContext db, IPaymentGateway gateway, TimeProvider clock)
{
    /// <param name="referenceCode">Mã đối chiếu tối đa 13 ký tự, nằm trong nội dung chuyển khoản.</param>
    /// <param name="expiresAt">Mã QR hết hiệu lực cùng lúc với giữ chỗ tồn kho, không sống lâu hơn (BR-59, TL-28 §8).</param>
    public async Task<VietQrPayment> CreateForOrderAsync(SalesOrder order, long batchAccountId, string batchAccountNo,
        decimal amount, string referenceCode, DateTimeOffset expiresAt, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        db.PaymentRequests.Add(new PaymentRequest
        {
            ReferenceCode = referenceCode,
            BatchAccountId = batchAccountId,
            Purpose = "OrderPayment",
            Amount = amount,
            Order = order,
            ExpiresAt = expiresAt,
            Status = "Pending",
            CreatedAt = now,
            UpdatedAt = now,
        });
        return await gateway.CreateVietQrAsync(new VietQrRequest(batchAccountNo, amount, referenceCode, expiresAt), ct);
    }
}

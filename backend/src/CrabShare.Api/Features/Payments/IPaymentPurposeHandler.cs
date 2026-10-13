using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// Việc phải làm khi một yêu cầu thu tiền chuyển sang Paid, tách theo <see cref="PaymentRequest.Purpose"/> (TH-06).
/// Mỗi module tự cài cho mục đích của mình và đăng ký trong FeatureRegistry:
/// Funding → contribution Confirmed · Orders → đơn Paid (NH-06) · Offtake → cọc Held (NH-14).
/// Handler được gọi BÊN TRONG transaction của webhook, sau khi payment_request đã đổi sang Paid, nên không tự mở transaction
/// và không SaveChanges riêng (webhook lưu chung). Chưa có handler thì khoản thu vẫn Paid, module xử lý sau.
/// </summary>
public interface IPaymentPurposeHandler
{
    /// <summary>Một giá trị của <see cref="PaymentPurposes"/>.</summary>
    string Purpose { get; }

    /// <param name="request">Yêu cầu thu tiền vừa đổi sang Paid (đã tải ContributionId / OrderId / OfftakeId).</param>
    /// <param name="paidAt">Thời điểm ghi nhận tiền về (giờ máy chủ, đã làm tròn theo AuditChain).</param>
    Task OnPaidAsync(PaymentRequest request, DateTimeOffset paidAt, CancellationToken ct);
}

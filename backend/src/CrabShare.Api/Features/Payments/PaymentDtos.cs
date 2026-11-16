using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Features.Payments;

/// <summary>
/// Mục đích thu tiền (ck_payment_request_purpose) và tiền tố của mã đối chiếu, để nhìn nội dung chuyển khoản là biết
/// khoản gì khi phải đối soát tay.
/// </summary>
public static class PaymentPurposes
{
    public const string Contribution = "Contribution";
    public const string OrderPayment = "OrderPayment";
    public const string PreOrderDeposit = "PreOrderDeposit";
    public const string PreOrderBalance = "PreOrderBalance";
    public const string OfftakeDeposit = "OfftakeDeposit";
    public const string OfftakePayment = "OfftakePayment";

    private static readonly Dictionary<string, string> Prefixes = new()
    {
        [Contribution] = "GV",    // góp vốn
        [OrderPayment] = "OD",    // trùng tiền tố mã đơn (Orders/OrderNumber)
        [PreOrderDeposit] = "DC", // cọc đơn đặt trước
        [PreOrderBalance] = "DT", // phần còn lại của đơn đặt trước
        [OfftakeDeposit] = "BT",  // cọc bao tiêu
        [OfftakePayment] = "BH",  // tiền hàng bao tiêu
    };

    public static string Prefix(string purpose) => Prefixes.TryGetValue(purpose, out var prefix)
        ? prefix
        : throw new ArgumentException($"Mục đích thu tiền không hợp lệ: {purpose}", nameof(purpose));
}

/// <summary>Nghĩa vụ mà khoản thu gắn vào: đúng một trong ba (ck_payment_request_target).</summary>
public sealed class PaymentTarget
{
    private readonly Action<PaymentRequest> apply;

    private PaymentTarget(Action<PaymentRequest> apply) => this.apply = apply;

    public static PaymentTarget ForContribution(long contributionId) => new(r => r.ContributionId = contributionId);

    /// <summary>Đơn có thể chưa lưu: checkout lưu đơn và yêu cầu thu tiền trong cùng một lần SaveChanges.</summary>
    public static PaymentTarget ForOrder(SalesOrder order) => new(r =>
    {
        if (order.OrderId > 0) r.OrderId = order.OrderId;
        else r.Order = order;
    });

    public static PaymentTarget ForOfftake(long offtakeId) => new(r => r.OfftakeId = offtakeId);

    internal void ApplyTo(PaymentRequest request) => apply(request);
}

/// <summary>Yêu cầu thu tiền vừa thêm vào DbContext (chưa lưu) kèm nội dung QR từ cổng thanh toán.</summary>
public sealed record CreatedPaymentRequest(PaymentRequest Request, VietQrPayment Qr);

/// <summary>
/// Một yêu cầu chuyển khoản cho web và app (component VietQrBox). Tiền là số nguyên đồng.
/// QrContent chỉ có khi yêu cầu còn chờ thanh toán; yêu cầu Pending đã quá hạn trả về Expired (job TH-07 sẽ đổi hẳn trong CSDL).
/// Số tài khoản chỉ để hiện ở bước "chuyển khoản thủ công", không hiện cạnh mã QR (TL-10 §6.1).
/// </summary>
public sealed record PaymentRequestResponse(
    long PaymentRequestId, string Purpose, string Status, string BatchCode, string ReferenceCode, long Amount,
    string? QrContent, DateTimeOffset ExpiresAt, string ProviderName, string AccountNo);

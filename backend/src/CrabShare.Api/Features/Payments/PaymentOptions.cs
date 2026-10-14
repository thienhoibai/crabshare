namespace CrabShare.Api.Features.Payments;

/// <summary>Mục "Payments" trong appsettings.json.</summary>
public sealed class PaymentOptions
{
    public const string Section = "Payments";

    /// <summary>
    /// Khoá HMAC-SHA256 mà trung gian thanh toán dùng ký thân webhook (header X-Signature, hex chữ thường).
    /// Bản giả lập đặt trong appsettings.Development.json; khi có sandbox thật thì lấy từ biến môi trường / secret.
    /// </summary>
    public string WebhookSecret { get; set; } = "";
}

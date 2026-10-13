using System.Security.Cryptography;
using System.Text;

namespace CrabShare.Api.Features.Payments;

/// <summary>Chữ ký HMAC-SHA256 của thân webhook (hex chữ thường) mà trung gian thanh toán giả lập gửi kèm ở header X-Signature.</summary>
public static class WebhookSignature
{
    public const string Header = "X-Signature";

    public static string Compute(string secret, string body)
        => Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(body))).ToLowerInvariant();

    /// <summary>So sánh thời gian cố định để không lộ chữ ký qua thời gian phản hồi.</summary>
    public static bool Verify(string secret, string body, string? signature)
    {
        if (string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(signature)) return false;
        var expected = Encoding.ASCII.GetBytes(Compute(secret, body));
        var actual = Encoding.ASCII.GetBytes(signature.Trim().ToLowerInvariant());
        return expected.Length == actual.Length && CryptographicOperations.FixedTimeEquals(expected, actual);
    }
}

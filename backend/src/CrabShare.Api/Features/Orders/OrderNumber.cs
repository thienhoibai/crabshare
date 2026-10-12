using System.Security.Cryptography;

namespace CrabShare.Api.Features.Orders;

/// <summary>
/// Mã đơn, đồng thời là mã đối chiếu trong nội dung chuyển khoản. Trường orderId của VietQR tối đa 13 ký tự (TL-29 §2),
/// mà batch_code dài tới 20 nên không ghép mã lô vào được. Dùng "OD" + 11 ký tự Crockford base32 (không có I, L, O, U
/// để khách khỏi gõ nhầm).
/// </summary>
public static class OrderNumber
{
    public const int Length = 13;
    public const string Prefix = "OD";
    public const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    public static string New() =>
        Prefix + new string(RandomNumberGenerator.GetItems<char>(Alphabet, Length - Prefix.Length));
}

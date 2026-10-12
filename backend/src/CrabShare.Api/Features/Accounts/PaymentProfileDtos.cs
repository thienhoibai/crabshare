using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Accounts;

public sealed class PayoutAccountRequest
{
    [Required, StringLength(20), RegularExpression(@"^[A-Za-z0-9_-]+$", ErrorMessage = "Mã ngân hàng chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới.")]
    public string BankCode { get; set; } = "";
    [Required, StringLength(30), RegularExpression(@"^[0-9]{4,30}$", ErrorMessage = "Số tài khoản cần từ 4 đến 30 chữ số.")]
    public string AccountNo { get; set; } = "";
    [Required, StringLength(150)]
    public string AccountHolderName { get; set; } = "";
}

public sealed record PayoutAccountResponse(long PayoutAccountId, string BankCode, string AccountNo,
    string AccountHolderName, string NameMatchStatus, string Status, DateTimeOffset UpdatedAt);

public sealed record PayoutProfileResponse(string OwnerType, string ExpectedHolderName, PayoutAccountResponse? Account);

public sealed class AddressRequest
{
    [Required, StringLength(150)]
    public string RecipientName { get; set; } = "";
    [Required, RegularExpression(@"^(0[0-9]{9}|\+84[0-9]{9})$", ErrorMessage = "Số điện thoại cần 10 chữ số bắt đầu bằng 0, hoặc dạng +84.")]
    public string RecipientPhone { get; set; } = "";
    [Required, StringLength(300)]
    public string AddressLine { get; set; } = "";
    [Required, StringLength(100)]
    public string Province { get; set; } = "";
    public bool IsDefault { get; set; }
}

public sealed record AddressResponse(long AddressId, string RecipientName, string RecipientPhone,
    string AddressLine, string Province, bool IsDefault, DateTimeOffset CreatedAt);

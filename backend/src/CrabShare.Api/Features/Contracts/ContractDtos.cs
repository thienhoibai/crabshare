namespace CrabShare.Api.Features.Contracts;

// Tiền là số nguyên đồng (long). Không có trường lợi suất kỳ vọng (TL-05 §8, BR-49).

/// <summary>Trạng thái và vai trò ký dùng chung (khớp CHECK trong CSDL).</summary>
public static class ContractStatuses
{
    public const string Draft = "Draft";
    public const string OperatorSigned = "OperatorSigned";
    public const string FullySigned = "FullySigned";
    public const string Void = "Void";

    public const string DigitalSignature = "DigitalSignature";
    public const string OfflineUpload = "OfflineUpload";

    public const string Operator = "Operator";
    public const string Investor = "Investor";
}

public sealed record ContractSignatureResponse(string Role, byte Order, string SignerName, DateTimeOffset SignedAt, string SignedHash, string? ProviderReference);

/// <param name="CurrentHash">Mã băm của file hiện hành: bản nháp, bản sau chữ ký người nuôi, hoặc bản cuối.</param>
/// <param name="NextSigner">Ai ký tiếp: Operator (chủ hộ nuôi) → Investor; null khi đã đủ hoặc đã huỷ.</param>
/// <param name="CanSign">Người đang xem có được bấm ký ngay bây giờ không.</param>
/// <param name="LegalNotice">Cảnh báo bản demo: mẫu chưa rà soát pháp lý.</param>
public sealed record ContractResponse(
    long ContractId, string ContractNo, string Status, string SigningMethod,
    string BatchCode, string BatchTitle, string OperatorName, string InvestorName,
    long ContributionId, long Amount, string ContributionStatus, string TemplateVersion,
    string DraftHash, string CurrentHash, string? FinalHash, DateTimeOffset? FullySignedAt, DateTimeOffset CreatedAt,
    IReadOnlyList<ContractSignatureResponse> Signatures, string? NextSigner, bool CanSign, string LegalNotice);

/// <summary>Một dòng trong danh sách hợp đồng (người nuôi, nhà đầu tư, admin).</summary>
public sealed record ContractSummary(
    long ContractId, string ContractNo, string Status, string SigningMethod, string BatchCode, string BatchTitle,
    string InvestorName, long Amount, string ContributionStatus, string? NextSigner, DateTimeOffset CreatedAt, DateTimeOffset? FullySignedAt);

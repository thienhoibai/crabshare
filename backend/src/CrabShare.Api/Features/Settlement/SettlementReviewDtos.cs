using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Settlement;

/// <summary>Công bố bảng quyết toán (UC37): mở cửa sổ góp ý (TL-14 Bước 3; CSDL bắt buộc ≥ 7 ngày).</summary>
public sealed class ProposeSettlementRequest
{
    [Range(7, 14, ErrorMessage = "Cửa sổ góp ý từ 7 đến 14 ngày.")]
    public int FeedbackDays { get; set; } = 7;
}

/// <summary>Góp ý của nhà đầu tư trong hạn (UC36): phải kèm căn cứ (TL-14 Bước 3).</summary>
public sealed class SettlementFeedbackRequest
{
    [Required, StringLength(1000, MinimumLength = 10, ErrorMessage = "Góp ý cần từ 10 đến 1.000 ký tự và nêu rõ căn cứ.")]
    public string Content { get; set; } = "";
}

/// <summary>Admin trả lời góp ý. <see cref="Unresolved"/> = hai bên chưa thống nhất: vẫn chốt được bảng, kèm ghi chú công khai (TL-14 Bước 4).</summary>
public sealed class AnswerFeedbackRequest
{
    [Required, StringLength(1000, MinimumLength = 5, ErrorMessage = "Câu trả lời cần từ 5 đến 1.000 ký tự.")]
    public string Response { get; set; } = "";

    public bool Unresolved { get; set; }
}

/// <summary>Một bảng quyết toán trong danh sách của nhà đầu tư hoặc người nuôi (chỉ bảng đã công bố).</summary>
/// <param name="MyNetPayout">Số thực nhận của tôi (nhà đầu tư); null với người nuôi.</param>
public sealed record SettlementSummary(
    long SettlementId, string BatchCode, string BatchTitle, string Status, short RevisionNo, long RevenuePool,
    long? MyNetPayout, DateTimeOffset? FeedbackDeadline, bool FeedbackOpen, int OpenFeedback);

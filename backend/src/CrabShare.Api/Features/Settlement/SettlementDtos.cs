using System.ComponentModel.DataAnnotations;

namespace CrabShare.Api.Features.Settlement;

// Tiền là số nguyên đồng (long). Không có trường lợi suất kỳ vọng (TL-05 §8, BR-49): bảng quyết toán chỉ ghi số tiền thật.

/// <summary>Tính (hoặc tính lại) bảng quyết toán nháp.</summary>
public sealed class CalculateSettlementRequest
{
    /// <summary>Tỷ lệ khấu trừ thuế người nuôi khai thay trên phần chia dương (TL-07); 0 = người nuôi chưa khai.</summary>
    [Range(typeof(decimal), "0", "35", ErrorMessage = "Tỷ lệ khấu trừ phải từ 0 đến 35%.")]
    public decimal TaxWithholdingPct { get; set; }
}

/// <param name="IsMine">Dòng của người đang xem (nhà đầu tư chỉ thấy dòng của mình).</param>
/// <param name="PayoutStatus">Trạng thái lệnh chi trả của dòng này sau khi duyệt (TH-14).</param>
public sealed record SettlementLineResponse(
    long SettlementLineId, long InvestorId, string InvestorName, long CapitalReturn, long ProfitShare, long TaxWithheld, long NetPayout,
    bool IsMine, string? PayoutStatus);

/// <param name="Status">Open, Answered, Withdrawn, Unresolved.</param>
public sealed record SettlementFeedbackResponse(
    long FeedbackId, string AuthorName, string Content, string Status, string? Response, DateTimeOffset CreatedAt, DateTimeOffset? RespondedAt, bool IsMine);

/// <param name="Status">Draft, Proposed, Disputed, Approved, PaidOut, Closed.</param>
/// <param name="OrderRevenue">Nguồn doanh thu hiện tại theo v_batch_actual_revenue (đơn Completed, cọc bị mất, hoàn tiền khiếu nại).</param>
/// <param name="Distributable">Phần chia cho nhà đầu tư: Pool − thù lao (Pool dương) hoặc Pool (âm).</param>
/// <param name="UncoveredLoss">Lỗ vượt tổng vốn của mọi nhà đầu tư; không nhà đầu tư nào chịu (TL-13 §6.2).</param>
/// <param name="ReconciliationDifference">Phần chia − tổng dòng (theo v_settlement_reconciliation); khác 0 chỉ khi có lỗ vượt vốn.</param>
/// <param name="TaxNotice">Ai khai và nộp thuế (TL-07): số khấu trừ trên bảng là số tham khảo.</param>
public sealed record SettlementResponse(
    long SettlementId, string BatchCode, string BatchTitle, string OperatorName, string BatchStatus, string Status, short RevisionNo,
    long OrderRevenue, long ForfeitedDeposits, long ComplaintRefunds, long ActualRevenue, long LockedStandardCost, long RevenuePool,
    decimal OperatorSharePct, long OperatorRemuneration, long Distributable, long DepreciationAmount, long TaxTotal, long UncoveredLoss,
    long ReconciliationDifference, long TotalCapital, long TotalNetPayout, int InvestorCount,
    DateTimeOffset? ProposedAt, DateTimeOffset? FeedbackDeadline, DateTimeOffset? ApprovedAt, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    IReadOnlyList<SettlementLineResponse> Lines, IReadOnlyList<SettlementFeedbackResponse> Feedback, string TaxNotice);

/// <summary>Một lô ở giai đoạn thu hoạch / quyết toán cho AdminFinance, kèm bảng quyết toán nếu đã tính.</summary>
public sealed record AdminSettlementSummary(
    string BatchCode, string BatchTitle, string OperatorName, string BatchStatus, long? SettlementId, string? Status, short? RevisionNo,
    long? ActualRevenue, long? RevenuePool, DateTimeOffset? FeedbackDeadline, int OpenFeedback, DateTimeOffset? UpdatedAt);

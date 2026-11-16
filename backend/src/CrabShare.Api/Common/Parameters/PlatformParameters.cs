using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Common.Parameters;

/// <summary>Khoá tham số nền tảng (BR-217). Giá trị lưu trong bảng platform_parameter, mỗi lần đổi là một dòng mới có ngày hiệu lực.</summary>
public static class ParamKeys
{
    public const string PlatformFeeRatePct = "PlatformFeeRatePct";
    public const string MinContributionVnd = "MinContributionVnd";
    public const string ContributionHoldMinutes = "ContributionHoldMinutes";
    public const string OrderHoldMinutes = "OrderHoldMinutes";
    public const string DepositRatePct = "DepositRatePct";
    public const string MinOrderCrabs = "MinOrderCrabs";
    public const string MinPreorderRatioPct = "MinPreorderRatioPct";
    public const string ReturnWindowHours = "ReturnWindowHours";
    public const string BalancePaymentHours = "BalancePaymentHours";
    public const string ClaimResponseHours = "ClaimResponseHours";
    public const string SettlementFeedbackDays = "SettlementFeedbackDays";
    public const string EvidenceRiskThreshold = "EvidenceRiskThreshold";
    public const string CaptureRequestHours = "CaptureRequestHours";
    public const string DeviceOfflineMinutes = "DeviceOfflineMinutes";
    public const string MassMortalityPct = "MassMortalityPct";
    public const string MassMortalityWindowHours = "MassMortalityWindowHours";
    public const string AiConfidenceThreshold = "AiConfidenceThreshold";
    public const string CalibrationPeriodDays = "CalibrationPeriodDays";

    /// <summary>Mỗi khoá kèm khoảng giá trị hợp lệ, để Admin không nhập nhầm đơn vị.</summary>
    public static readonly IReadOnlyDictionary<string, (decimal Min, decimal Max, string Label)> Known = new Dictionary<string, (decimal, decimal, string)>
    {
        [PlatformFeeRatePct] = (0, 20, "Tỷ lệ phí nền tảng (% doanh thu thực thu, lô P)"),
        [MinContributionVnd] = (1, 10_000_000_000, "Mức góp tối thiểu (đồng)"),
        [ContributionHoldMinutes] = (1, 1440, "Thời gian giữ chỗ góp vốn (phút)"),
        [OrderHoldMinutes] = (1, 1440, "Thời gian giữ đơn chờ cọc (phút)"),
        [DepositRatePct] = (1, 100, "Tỷ lệ cọc (%)"),
        [MinOrderCrabs] = (1, 100_000, "Số con quy đổi tối thiểu mỗi đơn"),
        [MinPreorderRatioPct] = (0, 100, "Tỷ lệ đặt trước tối thiểu để mở Lô (%)"),
        [ReturnWindowHours] = (1, 720, "Hạn đổi trả (giờ)"),
        [BalancePaymentHours] = (1, 720, "Hạn trả phần còn lại (giờ)"),
        [ClaimResponseHours] = (1, 720, "Hạn người nuôi xử lý khiếu nại (giờ)"),
        [SettlementFeedbackDays] = (1, 60, "Hạn phản hồi quyết toán (ngày)"),
        [EvidenceRiskThreshold] = (1, 100, "Ngưỡng điểm rủi ro bằng chứng"),
        [CaptureRequestHours] = (1, 72, "Hạn trả lời yêu cầu chụp (giờ)"),
        [DeviceOfflineMinutes] = (1, 10_080, "Thời gian mất kết nối của thiết bị (phút)"),
        [MassMortalityPct] = (1, 100, "Ngưỡng chết hàng loạt (% số hộp)"),
        [MassMortalityWindowHours] = (1, 168, "Khung giờ tính chết hàng loạt"),
        [AiConfidenceThreshold] = (0, 1, "Ngưỡng tin cậy của AI đo mai"),
        [CalibrationPeriodDays] = (1, 365, "Kỳ hiệu chuẩn thiết bị (ngày)"),
    };
}

/// <summary>Đọc tham số nền tảng theo ngày hiệu lực (BR-217, BR-218). Lô đang chạy đọc theo thời điểm Lô mở gọi vốn.</summary>
public sealed class PlatformParameters(AppDbContext db, TimeProvider clock)
{
    public async Task<decimal> GetAsync(string key, DateTimeOffset? at = null, CancellationToken ct = default)
    {
        var moment = at ?? clock.GetUtcNow();
        var value = await db.PlatformParameters.AsNoTracking()
            .Where(p => p.ParamKey == key && p.EffectiveFrom <= moment)
            .OrderByDescending(p => p.EffectiveFrom).Select(p => (decimal?)p.Value).FirstOrDefaultAsync(ct);
        return value ?? throw new BusinessRuleException("parameter.missing", $"Chưa cấu hình tham số {key}.");
    }

    public async Task<int> GetIntAsync(string key, DateTimeOffset? at = null, CancellationToken ct = default)
        => (int)decimal.Truncate(await GetAsync(key, at, ct));

    public async Task<long> GetVndAsync(string key, DateTimeOffset? at = null, CancellationToken ct = default)
        => (long)decimal.Truncate(await GetAsync(key, at, ct));

    /// <summary>Mọi khoá có hiệu lực tại một thời điểm.</summary>
    public async Task<IReadOnlyDictionary<string, decimal>> SnapshotAsync(DateTimeOffset? at = null, CancellationToken ct = default)
    {
        var moment = at ?? clock.GetUtcNow();
        var rows = await db.PlatformParameters.AsNoTracking().Where(p => p.EffectiveFrom <= moment)
            .Select(p => new { p.ParamKey, p.EffectiveFrom, p.Value }).ToListAsync(ct);
        return rows.GroupBy(r => r.ParamKey)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(r => r.EffectiveFrom).First().Value);
    }
}

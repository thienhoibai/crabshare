namespace CrabShare.Api.Features.Funding;

/// <summary>appsettings "Funding" (TL-17).</summary>
public sealed class FundingOptions
{
    /// <summary>Thời gian giữ chỗ một khoản góp trước khi tự hết hạn.</summary>
    public int ReservationMinutes { get; set; } = 30;
}

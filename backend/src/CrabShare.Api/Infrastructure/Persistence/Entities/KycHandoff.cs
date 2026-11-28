namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>Phiên ngắn hạn nối trang KYC trên web với app; chỉ lưu hash mã tham chiếu.</summary>
public partial class KycHandoff : UserRecord
{
    public long UserId { get; set; }
    public string TokenHash { get; set; } = null!;
    public string Status { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ClaimedAt { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }
    public virtual AppUser User { get; set; } = null!;
}

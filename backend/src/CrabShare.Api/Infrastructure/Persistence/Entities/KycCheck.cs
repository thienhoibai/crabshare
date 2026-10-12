using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Kết quả từng lần xác minh danh tính. Chỉ lưu kết quả, không lưu ảnh CCCD hay khuôn mặt
/// </summary>
public partial class KycCheck
{
    public long KycCheckId { get; set; }

    public long UserId { get; set; }

    /// <summary>
    /// Giá trị: OtpDeclaration, EkycIdFace, BankNameMatch
    /// </summary>
    public string CheckType { get; set; } = null!;

    public string? ProviderRef { get; set; }

    /// <summary>
    /// Bắt buộc với EkycIdFace
    /// </summary>
    public DateTimeOffset? ConsentAt { get; set; }

    /// <summary>
    /// Giá trị: Pending, Passed, Failed, ExceptionApproved
    /// </summary>
    public string Result { get; set; } = null!;

    public string? FailureReason { get; set; }

    public long? ReviewedBy { get; set; }

    public DateTimeOffset CheckedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual AppUser? ReviewedByNavigation { get; set; }

    public virtual AppUser User { get; set; } = null!;
}

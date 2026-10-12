using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Kết luận của Kiểm định viên cho bằng chứng bị gắn cờ; không xét lô mình có góp vốn
/// </summary>
public partial class EvidenceReview
{
    public long EvidenceReviewId { get; set; }

    public long EvidenceId { get; set; }

    public long ReviewerId { get; set; }

    /// <summary>
    /// Giá trị: Pass, Fail, NeedMoreEvidence
    /// </summary>
    public string Verdict { get; set; } = null!;

    public string? Note { get; set; }

    public DateTimeOffset ReviewedAt { get; set; }

    public virtual Evidence Evidence { get; set; } = null!;

    public virtual AppUser Reviewer { get; set; } = null!;
}

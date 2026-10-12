using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Phiên bản bảng Standard Cost của lô; đúng một bản bị khoá khi mở gọi vốn
/// </summary>
public partial class StandardCostVersion
{
    public long CostVersionId { get; set; }

    public long BatchId { get; set; }

    public short VersionNo { get; set; }

    /// <summary>
    /// Giá trị: Draft, Submitted, Approved, Locked, Superseded
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset? SubmittedAt { get; set; }

    public long? ApprovedBy { get; set; }

    public DateTimeOffset? ApprovedAt { get; set; }

    public DateTimeOffset? LockedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual AppUser? ApprovedByNavigation { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual ICollection<StandardCostItem> StandardCostItems { get; set; } = new List<StandardCostItem>();
}

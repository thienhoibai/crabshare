using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Tem truy xuất in tại chỗ khi thu hoạch; mỗi con cua có tối đa một tem đang hiệu lực
/// </summary>
public partial class CrabTag
{
    public long TagId { get; set; }

    public long CrabItemId { get; set; }

    /// <summary>
    /// Mã in trên tem và nằm trong QR; sinh ngẫu nhiên, không đoán được
    /// </summary>
    public string TagCode { get; set; } = null!;

    /// <summary>
    /// Giá trị: Printed, Active, Void
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset PrintedAt { get; set; }

    public long PrintedBy { get; set; }

    public DateTimeOffset? ActivatedAt { get; set; }

    /// <summary>
    /// Ảnh xác nhận lúc thu hoạch thấy cả con cua và tem
    /// </summary>
    public long? ActivationEvidenceId { get; set; }

    public DateTimeOffset? VoidedAt { get; set; }

    public string? VoidReason { get; set; }

    public virtual Evidence? ActivationEvidence { get; set; }

    public virtual CrabItem CrabItem { get; set; } = null!;

    public virtual ICollection<CrabItemEvent> CrabItemEvents { get; set; } = new List<CrabItemEvent>();

    public virtual AppUser PrintedByNavigation { get; set; } = null!;

    public virtual ICollection<TagScan> TagScans { get; set; } = new List<TagScan>();
}

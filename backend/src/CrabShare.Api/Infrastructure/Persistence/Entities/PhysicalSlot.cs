using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Hộp nuôi (slot) của người nuôi, nhận diện bằng số hộp in trên nhãn dán lên hộp; dãy, kệ, tầng, cột là tuỳ chọn
/// </summary>
public partial class PhysicalSlot
{
    public long SlotId { get; set; }

    public long OperatorId { get; set; }

    /// <summary>
    /// Số hộp do người nuôi đánh và in nhãn, ví dụ 0001; duy nhất trong một trại
    /// </summary>
    public string SlotCode { get; set; } = null!;

    /// <summary>
    /// Dãy (tuỳ chọn)
    /// </summary>
    public string? RowCode { get; set; }

    /// <summary>
    /// Số kệ (tuỳ chọn)
    /// </summary>
    public short? RackNo { get; set; }

    /// <summary>
    /// Tầng trên kệ (tuỳ chọn)
    /// </summary>
    public short? TierNo { get; set; }

    /// <summary>
    /// Cột trên tầng (tuỳ chọn)
    /// </summary>
    public short? ColumnNo { get; set; }

    /// <summary>
    /// Giá trị: Available, Occupied, Maintenance
    /// </summary>
    public string Status { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public virtual ICollection<CaptureRequest> CaptureRequests { get; set; } = new List<CaptureRequest>();

    public virtual ICollection<Evidence> Evidences { get; set; } = new List<Evidence>();

    public virtual Operator Operator { get; set; } = null!;

    public virtual SlotAllocation? SlotAllocation { get; set; }
}

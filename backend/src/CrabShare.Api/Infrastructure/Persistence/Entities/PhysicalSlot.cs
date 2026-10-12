using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Hộp nuôi vật lý (slot) của người nuôi; vị trí lấy từ sơ đồ cơ sở: dãy, kệ, tầng, cột
/// </summary>
public partial class PhysicalSlot
{
    public long SlotId { get; set; }

    public long OperatorId { get; set; }

    /// <summary>
    /// Mã vị trí ô sinh từ sơ đồ cơ sở, ví dụ A-03-12; duy nhất trong một trại
    /// </summary>
    public string SlotCode { get; set; } = null!;

    /// <summary>
    /// Dãy trên sơ đồ cơ sở
    /// </summary>
    public string? RowCode { get; set; }

    /// <summary>
    /// Số kệ trên sơ đồ cơ sở
    /// </summary>
    public short? RackNo { get; set; }

    /// <summary>
    /// Tầng trên kệ
    /// </summary>
    public short? TierNo { get; set; }

    /// <summary>
    /// Cột trên tầng
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

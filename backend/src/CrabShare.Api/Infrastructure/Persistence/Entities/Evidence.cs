using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Ảnh/video bằng chứng nuôi: chụp trực tiếp trong ứng dụng, nhận qua API hệ thống trại, hoặc chứng từ tải lên
/// </summary>
public partial class Evidence
{
    public long EvidenceId { get; set; }

    public long BatchId { get; set; }

    public long? SlotEventId { get; set; }

    public long? TrancheId { get; set; }

    /// <summary>
    /// Ô người nuôi chọn trên sơ đồ khi chụp
    /// </summary>
    public long? SlotId { get; set; }

    /// <summary>
    /// Yêu cầu chụp đột xuất mà ảnh này đáp ứng
    /// </summary>
    public long? CaptureRequestId { get; set; }

    /// <summary>
    /// Giá trị: Photo, Video, Invoice
    /// </summary>
    public string MediaType { get; set; } = null!;

    public string FileUri { get; set; } = null!;

    public string Sha256 { get; set; } = null!;

    public string? PerceptualHash { get; set; }

    public DateTimeOffset? CapturedAt { get; set; }

    public DateTimeOffset ReceivedAt { get; set; }

    /// <summary>
    /// Vị trí lúc chụp
    /// </summary>
    public decimal? Latitude { get; set; }

    public decimal? Longitude { get; set; }

    /// <summary>
    /// Giá trị: FarmApi, InAppCapture (chụp trực tiếp, không chọn từ thư viện), DocumentUpload (chỉ cho chứng từ)
    /// </summary>
    public string Source { get; set; } = null!;

    /// <summary>
    /// Kết quả nhận diện do đối tác trả về
    /// </summary>
    public string? PartnerLabel { get; set; }

    public decimal? RiskScore { get; set; }

    /// <summary>
    /// Giá trị: Accepted, Watch (hiện cảnh báo cho nhà đầu tư), Flagged (chờ Kiểm định viên), Rejected
    /// </summary>
    public string ReviewStatus { get; set; } = null!;

    /// <summary>
    /// Giải trình của người nuôi khi bằng chứng bị gắn cờ
    /// </summary>
    public string? Explanation { get; set; }

    public DateTimeOffset? ExplainedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Batch Batch { get; set; } = null!;

    public virtual CaptureRequest? CaptureRequest { get; set; }

    public virtual ICollection<CrabItemEvent> CrabItemEvents { get; set; } = new List<CrabItemEvent>();

    public virtual ICollection<CrabTag> CrabTags { get; set; } = new List<CrabTag>();

    public virtual ICollection<EvidenceDetection> EvidenceDetections { get; set; } = new List<EvidenceDetection>();

    public virtual ICollection<EvidenceReview> EvidenceReviews { get; set; } = new List<EvidenceReview>();

    public virtual PhysicalSlot? Slot { get; set; }

    public virtual SlotEvent? SlotEvent { get; set; }

    public virtual DisbursementTranche? Tranche { get; set; }
}

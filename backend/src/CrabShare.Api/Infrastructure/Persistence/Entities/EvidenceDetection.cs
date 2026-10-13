using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Kết quả mô hình nhận diện cua trên một ảnh; chỉ là một tín hiệu trong điểm rủi ro, không tự từ chối bằng chứng
/// </summary>
public partial class EvidenceDetection
{
    public long DetectionId { get; set; }

    public long EvidenceId { get; set; }

    /// <summary>
    /// Phiên bản mô hình đã chạy, để truy lại kết quả
    /// </summary>
    public string ModelVersion { get; set; } = null!;

    public bool? CrabDetected { get; set; }

    /// <summary>
    /// Độ tin cậy từ 0 tới 1
    /// </summary>
    public decimal? Confidence { get; set; }

    public string? BboxJson { get; set; }

    public DateTimeOffset DetectedAt { get; set; }

    public virtual Evidence Evidence { get; set; } = null!;
}

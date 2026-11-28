using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>Bảng gộp evidence_record (V049): ảnh bằng chứng (Evidence), kết quả nhận diện (Detection), lượt duyệt ảnh (Review) và yêu cầu chụp (CaptureRequest) nằm chung một bảng, phân biệt bằng cột record_type.</summary>
[Table("evidence_record")]
public abstract class EvidenceRecord
{
    [Key, Column("evidence_record_id")] public long EvidenceRecordId { get; set; }
}

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>Bảng gộp care_record (V053): nhật ký chăm sóc hằng ngày (Log) và cảnh báo (Alert) nằm chung một bảng, phân biệt bằng cột record_type.</summary>
[Table("care_record")]
public abstract class CareRecord
{
    [Key, Column("care_record_id")] public long CareRecordId { get; set; }
}

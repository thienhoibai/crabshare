using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>Bảng gộp settlement_record (V051): bảng quyết toán (Settlement), dòng chia cho nhà đầu tư (Line) và phản hồi (Feedback) nằm chung một bảng, phân biệt bằng cột record_type.</summary>
[Table("settlement_record")]
public abstract class SettlementRecord
{
    [Key, Column("settlement_record_id")] public long SettlementRecordId { get; set; }
}

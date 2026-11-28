using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>Bảng gộp contract_record (V048): hợp đồng góp vốn (Contract), mẫu hợp đồng (Template), chữ ký (Signature), công bố rủi ro (RiskDisclosure), xác nhận rủi ro (RiskAcknowledgement) và cam kết bao tiêu (Offtake) nằm chung một bảng, phân biệt bằng cột record_type.</summary>
[Table("contract_record")]
public abstract class ContractRecord
{
    [Key, Column("contract_record_id")] public long ContractRecordId { get; set; }
}

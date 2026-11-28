using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>Bảng gộp user_record (V045): vai trò (Role), địa chỉ nhận hàng (Address), lần xác minh eKYC (KycCheck), phiên handoff eKYC (KycHandoff) và tài khoản nhận tiền (PayoutAccount) của người dùng nằm chung một bảng, phân biệt bằng cột record_type.</summary>
[Table("user_record")]
public abstract class UserRecord
{
    [Key, Column("user_record_id")] public long UserRecordId { get; set; }
}

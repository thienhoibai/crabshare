using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Vai trò của tài khoản (một người có thể vừa là nhà đầu tư vừa là khách hàng)
/// </summary>
public partial class AppUserRole
{
    public long UserId { get; set; }

    /// <summary>
    /// Giá trị: Investor, Customer, OperatorMember, PlatformAdmin, EvidenceReviewer (quyền Kiểm định viên, không phải tác nhân mới)
    /// </summary>
    public string RoleCode { get; set; } = null!;

    public DateTimeOffset GrantedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual AppUser User { get; set; } = null!;
}

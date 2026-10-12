using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Tài khoản thuộc tổ chức người nuôi (chủ, nhân viên)
/// </summary>
public partial class OperatorMember
{
    /// <summary>
    /// PK + FK; mỗi tài khoản thuộc tối đa một người nuôi
    /// </summary>
    public long UserId { get; set; }

    public long OperatorId { get; set; }

    /// <summary>
    /// Giá trị: Owner, Staff
    /// </summary>
    public string MemberRole { get; set; } = null!;

    public DateTimeOffset JoinedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Operator Operator { get; set; } = null!;

    public virtual AppUser User { get; set; } = null!;
}

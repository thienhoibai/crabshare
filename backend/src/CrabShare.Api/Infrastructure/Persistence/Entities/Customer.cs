using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Khách mua trên gian hàng (kế thừa User)
/// </summary>
public partial class Customer
{
    /// <summary>
    /// PK + FK tới app_user
    /// </summary>
    public long UserId { get; set; }

    public string? DisplayName { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual CustomerAddress? CustomerAddress { get; set; }

    public virtual AppUser User { get; set; } = null!;
}

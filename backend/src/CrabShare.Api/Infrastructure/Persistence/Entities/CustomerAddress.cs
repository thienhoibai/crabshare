using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Địa chỉ nhận hàng của khách (thuộc tính đa trị)
/// </summary>
public partial class CustomerAddress
{
    public long AddressId { get; set; }

    public long CustomerId { get; set; }

    public string RecipientName { get; set; } = null!;

    public string RecipientPhone { get; set; } = null!;

    public string AddressLine { get; set; } = null!;

    public string Province { get; set; } = null!;

    public bool IsDefault { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual Customer Customer { get; set; } = null!;
}

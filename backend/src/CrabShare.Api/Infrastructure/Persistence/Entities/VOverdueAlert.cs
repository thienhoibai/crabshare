using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VOverdueAlert
{
    public long AlertId { get; set; }

    public long BatchId { get; set; }

    public string BatchCode { get; set; } = null!;

    public string AlertType { get; set; } = null!;

    public string Severity { get; set; } = null!;

    public DateTimeOffset RaisedAt { get; set; }

    public DateTimeOffset AckDeadline { get; set; }

    public int? MinutesOverdue { get; set; }
}

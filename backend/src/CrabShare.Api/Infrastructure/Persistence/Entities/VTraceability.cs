using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class VTraceability
{
    public string TagCode { get; set; } = null!;

    public string TagStatus { get; set; } = null!;

    public Guid ItemUuid { get; set; }

    public short? WeightG { get; set; }

    public string? GradeCode { get; set; }

    public string? GradeName { get; set; }

    public string ItemStatus { get; set; } = null!;

    public string BatchCode { get; set; } = null!;

    public string CrabType { get; set; } = null!;

    public DateTimeOffset StockedAt { get; set; }

    public DateTimeOffset? HarvestedAt { get; set; }

    public string OperatorName { get; set; } = null!;

    public string FarmAddress { get; set; } = null!;

    public string SlotCode { get; set; } = null!;

    public DateTimeOffset AllocatedAt { get; set; }

    public int? MoltCount { get; set; }

    public int? EvidenceCount { get; set; }

    public string? HarvestPhotoUri { get; set; }

    public int? ScanCount { get; set; }

    public string? OrderNo { get; set; }
}

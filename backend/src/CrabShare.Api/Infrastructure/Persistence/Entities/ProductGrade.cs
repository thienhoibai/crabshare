using System;
using System.Collections.Generic;

namespace CrabShare.Api.Infrastructure.Persistence.Entities;

/// <summary>
/// Danh mục phân loại cua theo kích cỡ, chất lượng
/// </summary>
public partial class ProductGrade
{
    public long GradeId { get; set; }

    public string GradeCode { get; set; } = null!;

    public string GradeName { get; set; } = null!;

    public short? MinWeightG { get; set; }

    public short? MaxWeightG { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public virtual ICollection<CrabItem> CrabItems { get; set; } = new List<CrabItem>();

    public virtual ICollection<OfftakeCommitment> OfftakeCommitments { get; set; } = new List<OfftakeCommitment>();

    public virtual ICollection<ProductListing> ProductListings { get; set; } = new List<ProductListing>();
}

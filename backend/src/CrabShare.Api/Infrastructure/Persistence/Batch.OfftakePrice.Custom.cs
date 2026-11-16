namespace CrabShare.Api.Infrastructure.Persistence.Entities;

public partial class Batch
{
    public virtual ICollection<BatchOfftakePrice> BatchOfftakePrices { get; set; } = new List<BatchOfftakePrice>();
}

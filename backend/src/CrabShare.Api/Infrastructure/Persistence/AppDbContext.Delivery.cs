using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<InventoryAllocation> InventoryAllocations => Set<InventoryAllocation>();
    public DbSet<Shipment> Shipments => Set<Shipment>();
    public DbSet<ShipmentLine> ShipmentLines => Set<ShipmentLine>();
    public DbSet<DeliveryAcceptance> DeliveryAcceptances => Set<DeliveryAcceptance>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<CustomerClaim> CustomerClaims => Set<CustomerClaim>();
    public DbSet<OrderRating> OrderRatings => Set<OrderRating>();
    public DbSet<RevenueLine> RevenueLines => Set<RevenueLine>();

    private static void ConfigureDelivery(ModelBuilder model)
    {
        model.Entity<InventoryAllocation>().ToTable("inventory_allocation");
        model.Entity<Shipment>().ToTable("shipment");
        model.Entity<Shipment>().HasMany(s => s.Lines).WithOne().HasForeignKey(l => l.ShipmentId);
        model.Entity<ShipmentLine>().ToTable("shipment_line");
        model.Entity<DeliveryAcceptance>().ToTable("delivery_acceptance");
        model.Entity<Invoice>().ToTable("invoice");
        model.Entity<CustomerClaim>().ToTable("claim");
        model.Entity<OrderRating>().ToTable("order_rating");
        // revenue_line có trigger chỉ ghi thêm: không dùng OUTPUT khi ghi.
        model.Entity<RevenueLine>().ToTable("revenue_line", t => t.UseSqlOutputClause(false));
    }
}

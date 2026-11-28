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
        // sales_record gộp dòng đơn hàng, khiếu nại, đánh giá và dòng doanh thu (V050). Dòng doanh thu có trigger chỉ ghi thêm: không dùng OUTPUT.
        var salesRecord = model.Entity<SalesRecord>();
        salesRecord.ToTable(t => t.UseSqlOutputClause(false));
        salesRecord.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        salesRecord.HasDiscriminator<string>("record_type")
            .HasValue<SalesOrderLine>("Line").HasValue<CustomerClaim>("Claim").HasValue<OrderRating>("Rating").HasValue<RevenueLine>("Revenue");
        // delivery_record gộp đợt giao, dòng đợt giao, chuyến hàng, dòng chuyến hàng, biên bản nhận và hoá đơn (V039).
        var delivery = model.Entity<DeliveryRecord>();
        delivery.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        delivery.HasDiscriminator<string>("record_type")
            .HasValue<DeliveryTranche>("Tranche").HasValue<DeliveryTrancheLine>("TrancheLine").HasValue<Shipment>("Shipment")
            .HasValue<ShipmentLine>("ShipmentLine").HasValue<DeliveryAcceptance>("Acceptance").HasValue<Invoice>("Invoice");
        model.Entity<DeliveryTranche>().HasMany(t => t.Lines).WithOne().HasForeignKey(l => l.TrancheId);
        model.Entity<Shipment>().HasMany(s => s.Lines).WithOne().HasForeignKey(l => l.ShipmentId);
    }
}

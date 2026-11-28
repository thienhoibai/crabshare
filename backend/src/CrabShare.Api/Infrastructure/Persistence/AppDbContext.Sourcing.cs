using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

public partial class AppDbContext
{
    public DbSet<ProcurementOrder> ProcurementOrders => Set<ProcurementOrder>();
    public DbSet<SupplyLot> SupplyLots => Set<SupplyLot>();
    public DbSet<GoodsReceipt> GoodsReceipts => Set<GoodsReceipt>();
    public DbSet<CrabUnit> CrabUnits => Set<CrabUnit>();
    public DbSet<QcAssignment> QcAssignments => Set<QcAssignment>();
    public DbSet<QcInspection> QcInspections => Set<QcInspection>();
    public DbSet<InventoryEvent> InventoryEvents => Set<InventoryEvent>();
    public DbSet<HoldingOperation> HoldingOperations => Set<HoldingOperation>();
    public DbSet<BoxAssignment> BoxAssignments => Set<BoxAssignment>();

    private static void ConfigureSourcing(ModelBuilder model)
    {
        // supply_record gộp đơn mua, lô cua nhập và phiếu nhận (V040).
        var supply = model.Entity<SupplyRecord>();
        supply.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        supply.HasDiscriminator<string>("record_type")
            .HasValue<ProcurementOrder>("ProcurementOrder").HasValue<SupplyLot>("SupplyLot").HasValue<GoodsReceipt>("GoodsReceipt");
        model.Entity<CrabUnit>().ToTable("crab_unit");
        // qc_record gộp phân công, phiếu kiểm phẩm và báo cáo thăm trại (V041). Phiếu kiểm phẩm có trigger chỉ ghi thêm: không dùng OUTPUT.
        var qc = model.Entity<QcRecord>();
        qc.ToTable(t => t.UseSqlOutputClause(false));
        qc.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        qc.HasDiscriminator<string>("record_type")
            .HasValue<QcAssignment>("Assignment").HasValue<QcInspection>("Inspection").HasValue<SiteVisitReport>("SiteVisitReport");
        // inventory_record gộp sự kiện tồn, xếp hộp và phân bổ cho đơn (V042). Sự kiện tồn có trigger chỉ ghi thêm: không dùng OUTPUT.
        var inventory = model.Entity<InventoryRecord>();
        inventory.ToTable(t => t.UseSqlOutputClause(false));
        inventory.Property<string>("record_type").HasMaxLength(30).IsUnicode(false);
        inventory.HasDiscriminator<string>("record_type")
            .HasValue<InventoryEvent>("Event").HasValue<BoxAssignment>("BoxAssignment").HasValue<InventoryAllocation>("Allocation");
    }
}

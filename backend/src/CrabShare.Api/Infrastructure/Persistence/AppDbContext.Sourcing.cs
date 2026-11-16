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
        model.Entity<ProcurementOrder>().ToTable("procurement_order");
        model.Entity<SupplyLot>().ToTable("supply_lot");
        model.Entity<GoodsReceipt>().ToTable("goods_receipt");
        model.Entity<CrabUnit>().ToTable("crab_unit");
        model.Entity<QcAssignment>().ToTable("qc_assignment");
        // Hai bảng chỉ ghi thêm (trigger): EF không được dùng OUTPUT khi chèn.
        model.Entity<QcInspection>().ToTable("qc_inspection", t => t.UseSqlOutputClause(false));
        model.Entity<InventoryEvent>().ToTable("inventory_event", t => t.UseSqlOutputClause(false));
        model.Entity<HoldingOperation>().ToTable("holding_operation");
        model.Entity<BoxAssignment>().ToTable("box_assignment");
    }
}

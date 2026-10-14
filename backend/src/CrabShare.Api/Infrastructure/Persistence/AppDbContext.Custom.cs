using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

/// <summary>
/// Phần cấu hình viết tay của AppDbContext.
/// AppDbContext.cs và thư mục Entities/ được SINH TỰ ĐỘNG từ CSDL (database-first) — KHÔNG sửa tay hai chỗ đó,
/// vì lần scaffold sau sẽ ghi đè. Cấu hình thêm (query filter, converter...) đặt ở file này.
/// Cách sinh lại: xem database/README.md, mục "Đổi lược đồ".
/// </summary>
public partial class AppDbContext
{
    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        ConfigureBatchReview(modelBuilder);
        // Ví dụ: modelBuilder.Entity<Entities.Batch>().HasQueryFilter(b => b.Status != "Cancelled");

        // Hai người đổi giá cùng lúc: lần lưu sau bị từ chối thay vì ghi "giá cũ" sai vào lịch sử giá
        modelBuilder.Entity<Entities.ProductListing>().Property(l => l.UpdatedAt).IsConcurrencyToken();

        // Scaffold hiểu nhầm index unique có filter thành quan hệ 1:1.
        // Một khách có nhiều địa chỉ; chỉ địa chỉ mặc định mới unique.
        var addresses = modelBuilder.Entity<Entities.CustomerAddress>();
        var scaffoldedRelation = addresses.Metadata.FindNavigation(nameof(Entities.CustomerAddress.Customer))!.ForeignKey;
        addresses.Metadata.RemoveForeignKey(scaffoldedRelation);
        modelBuilder.Entity<Entities.Customer>().Ignore(c => c.CustomerAddress);
        addresses.HasOne(a => a.Customer).WithMany()
            .HasForeignKey(a => a.CustomerId).HasConstraintName("fk_customer_address_customer_id");

        // Chỉ phiên bản Locked là unique theo batch_id; một lô có nhiều phiên bản chi phí.
        var costs = modelBuilder.Entity<Entities.StandardCostVersion>();
        var costRelation = costs.Metadata.FindNavigation(nameof(Entities.StandardCostVersion.Batch))!.ForeignKey;
        costs.Metadata.RemoveForeignKey(costRelation);
        modelBuilder.Entity<Entities.Batch>().Ignore(b => b.StandardCostVersion);
        costs.HasOne(c => c.Batch).WithMany().HasForeignKey(c => c.BatchId)
            .HasConstraintName("fk_standard_cost_version_batch_id");
    }
}

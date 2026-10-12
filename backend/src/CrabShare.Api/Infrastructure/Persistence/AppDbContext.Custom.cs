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
    }
}

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
    }
}

using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

/// <summary>
/// Dữ liệu demo cho môi trường Development: tài khoản mỗi vai trò, một người nuôi đã duyệt và 60 hộp đã đánh số.
/// Chỉ chạy khi Seed:Enabled = true và bảng app_user còn trống. Danh sách tài khoản: xem backend/README.md.
/// Dữ liệu demo của từng tính năng (lô, đơn hàng...) do người làm tính năng đó bổ sung vào đây.
/// </summary>
public static class DevDataSeeder
{
    /// <summary>Mật khẩu chung của mọi tài khoản demo (chỉ dùng ở máy dev).</summary>
    public const string DemoPassword = "CrabShare@2026";

    public static async Task SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(DevDataSeeder));
        if (!config.GetValue<bool>("Seed:Enabled")) return;

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (!await db.Database.CanConnectAsync())
        {
            logger.LogWarning("Không kết nối được CSDL — bỏ qua seed. Chạy DbMigrator trước (xem database/README.md).");
            return;
        }
        if (await db.AppUsers.AnyAsync()) return;

        var now = DateTimeOffset.UtcNow;
        var hasher = new PasswordHasher<AppUser>();

        AppUser NewUser(string email, string fullName, params string[] roles)
        {
            var u = new AppUser { Email = email, FullName = fullName, Status = "Active", CreatedAt = now, UpdatedAt = now };
            u.PasswordHash = hasher.HashPassword(u, DemoPassword);
            foreach (var r in roles) u.AppUserRoles.Add(new AppUserRole { RoleCode = r, GrantedAt = now, CreatedAt = now });
            db.AppUsers.Add(u);
            return u;
        }

        var admin = NewUser("admin@crabshare.local", "Quản trị nền tảng", Roles.PlatformAdmin);
        NewUser("reviewer@crabshare.local", "Kiểm định viên", Roles.EvidenceReviewer);

        var owner = NewUser("operator@crabshare.local", "Trần Văn Nuôi", Roles.OperatorMember);
        var staff = NewUser("staff@crabshare.local", "Lê Thị Trại", Roles.OperatorMember);

        var investor1 = NewUser("investor1@crabshare.local", "Nguyễn Minh Đầu Tư", Roles.Investor, Roles.Customer);
        var investor2 = NewUser("investor2@crabshare.local", "Phạm Thu Góp Vốn", Roles.Investor, Roles.Customer);
        var buyer = NewUser("customer@crabshare.local", "Võ Khách Hàng", Roles.Customer);

        foreach (var inv in new[] { investor1, investor2 })
            inv.Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = now, CreatedAt = now };
        investor1.Customer = new Customer { DisplayName = investor1.FullName, CreatedAt = now };
        investor2.Customer = new Customer { DisplayName = investor2.FullName, CreatedAt = now };
        buyer.Customer = new Customer { DisplayName = buyer.FullName, CreatedAt = now };

        await db.SaveChangesAsync();

        var farm = new Operator
        {
            LegalName = "HTX Nuôi cua Năm Căn",
            TaxCode = "2001234567",
            BusinessRegNo = "61-HTX-0001",
            FarmAddress = "Ấp Hàng Vịnh, Năm Căn, Cà Mau",
            ApprovedSlotCapacity = 2000,
            Status = "Approved",
            SubmittedAt = now.AddDays(-30),
            ApprovedAt = now.AddDays(-25),
            ApprovedBy = admin.UserId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        farm.OperatorMembers.Add(new OperatorMember { UserId = owner.UserId, MemberRole = "Owner", JoinedAt = now, CreatedAt = now });
        farm.OperatorMembers.Add(new OperatorMember { UserId = staff.UserId, MemberRole = "Staff", JoinedAt = now, CreatedAt = now });

        // Hộp đánh số 001–060: chỉ cần số hộp; dãy/kệ/tầng/cột là tuỳ chọn (Phiếu v1.2)
        for (var i = 1; i <= 60; i++)
            farm.PhysicalSlots.Add(new PhysicalSlot { SlotCode = i.ToString("000"), Status = "Available", CreatedAt = now, UpdatedAt = now });

        db.Operators.Add(farm);
        await db.SaveChangesAsync();
        logger.LogInformation("Đã seed dữ liệu demo: 7 tài khoản, 1 người nuôi, 60 hộp.");
    }
}

using System.Diagnostics;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

/// <summary>
/// Dữ liệu demo cho môi trường Development: tài khoản mỗi vai trò, một người nuôi đã duyệt với 1.500 hộp đánh số,
/// rồi 5 lô ở đủ các giai đoạn (DemoLifecycleSeeder). Danh sách đầy đủ: database/README.md.
/// Chỉ chạy khi Seed:Enabled = true và bảng app_user còn trống (chạy DbMigrator --reset để seed lại).
/// Cần thêm dữ liệu mẫu cho tính năng của mình thì bổ sung vào đây (PR riêng).
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

        var started = Stopwatch.GetTimestamp();
        var now = DateTimeOffset.UtcNow;
        var hasher = new PasswordHasher<AppUser>();

        AppUser NewUser(string email, string fullName, string? phone, params string[] roles)
        {
            var u = new AppUser { Email = email, FullName = fullName, Phone = phone, Status = "Active", CreatedAt = now.AddDays(-200), UpdatedAt = now };
            u.PasswordHash = hasher.HashPassword(u, DemoPassword);
            foreach (var r in roles) u.AppUserRoles.Add(new AppUserRole { RoleCode = r, GrantedAt = u.CreatedAt, CreatedAt = u.CreatedAt });
            db.AppUsers.Add(u);
            return u;
        }

        var admin = NewUser("admin@crabshare.local", "Quản trị nền tảng", null, Roles.PlatformAdmin);
        NewUser("reviewer@crabshare.local", "Kiểm định viên", null, Roles.EvidenceReviewer);

        var owner = NewUser("operator@crabshare.local", "Trần Văn Nuôi", "0913000111", Roles.OperatorMember);
        var staff = NewUser("staff@crabshare.local", "Lê Thị Trại", "0913000222", Roles.OperatorMember);

        var investors = new[]
        {
            NewUser("investor1@crabshare.local", "Nguyễn Minh Đầu Tư", "0912345678", Roles.Investor, Roles.Customer),
            NewUser("investor2@crabshare.local", "Phạm Thu Góp Vốn", "0987654321", Roles.Investor, Roles.Customer),
            NewUser("investor3@crabshare.local", "Lê Văn Vốn", "0903111222", Roles.Investor, Roles.Customer),
            NewUser("investor4@crabshare.local", "Hoàng Thị Hợp Tác", "0938222333", Roles.Investor, Roles.Customer),
        };
        var buyer = NewUser("customer@crabshare.local", "Võ Khách Hàng", "0901234567", Roles.Customer);

        foreach (var inv in investors)
        {
            inv.Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = now.AddDays(-190), CreatedAt = inv.CreatedAt };
            inv.Customer = new Customer { DisplayName = inv.FullName, CreatedAt = inv.CreatedAt };
        }
        buyer.Customer = new Customer { DisplayName = buyer.FullName, CreatedAt = buyer.CreatedAt };

        var buyerAddress = new CustomerAddress
        {
            Customer = buyer.Customer, RecipientName = buyer.FullName, RecipientPhone = "0901234567",
            AddressLine = "12 Nguyễn Huệ, phường Sài Gòn", Province = "TP. Hồ Chí Minh", IsDefault = true, CreatedAt = buyer.CreatedAt,
        };
        var investorAddress = new CustomerAddress
        {
            Customer = investors[0].Customer!, RecipientName = investors[0].FullName, RecipientPhone = "0912345678",
            AddressLine = "45 Trần Phú, phường Ninh Kiều", Province = "Cần Thơ", IsDefault = true, CreatedAt = investors[0].CreatedAt,
        };
        db.CustomerAddresses.AddRange(buyerAddress, investorAddress);

        // Tài khoản nhận tiền đã khớp tên (dùng khi chi trả quyết toán)
        string[] banks = ["VCB", "TCB", "MB", "ACB"];
        for (var i = 0; i < investors.Length; i++)
            db.PayoutAccounts.Add(new PayoutAccount
            {
                OwnerUser = investors[i], BankCode = banks[i], AccountNo = $"10{i + 1}2026{i + 1:0000}",
                AccountHolderName = investors[i].FullName.ToUpperInvariant(), NameMatchStatus = "Matched", Status = "Active",
                CreatedAt = now.AddDays(-185), UpdatedAt = now,
            });

        await db.SaveChangesAsync();

        var farm = new Operator
        {
            LegalName = "HTX Nuôi cua Năm Căn",
            TaxCode = "2001234567",
            BusinessRegNo = "61-HTX-0001",
            FarmAddress = "Ấp Hàng Vịnh, Năm Căn, Cà Mau",
            ApprovedSlotCapacity = 2000,
            Status = "Approved",
            SubmittedAt = now.AddDays(-195),
            ApprovedAt = now.AddDays(-190),
            ApprovedBy = admin.UserId,
            CreatedAt = now.AddDays(-196),
            UpdatedAt = now,
        };
        farm.OperatorMembers.Add(new OperatorMember { UserId = owner.UserId, MemberRole = "Owner", JoinedAt = farm.CreatedAt, CreatedAt = farm.CreatedAt });
        farm.OperatorMembers.Add(new OperatorMember { UserId = staff.UserId, MemberRole = "Staff", JoinedAt = farm.CreatedAt, CreatedAt = farm.CreatedAt });

        // Hộp đánh số 0001–1700, mỗi lô một dải riêng: chỉ cần số hộp; dãy/kệ/tầng/cột là tuỳ chọn (Phiếu v1.2)
        for (var i = 1; i <= 1700; i++)
            farm.PhysicalSlots.Add(new PhysicalSlot { SlotCode = i.ToString("0000"), Status = "Available", CreatedAt = farm.CreatedAt, UpdatedAt = now });

        var farmPayout = new PayoutAccount
        {
            OwnerOperator = farm, BankCode = "VCB", AccountNo = "0011004567890", AccountHolderName = "HTX NUOI CUA NAM CAN",
            NameMatchStatus = "Matched", Status = "Active", CreatedAt = farm.CreatedAt, UpdatedAt = now,
        };
        db.Operators.Add(farm);
        db.PayoutAccounts.Add(farmPayout);
        await db.SaveChangesAsync();

        var people = new DemoLifecycleSeeder.People(admin, owner, staff, investors,
            [new(buyer, buyerAddress), new(investors[0], investorAddress)], farm, farmPayout);
        await DemoLifecycleSeeder.SeedAsync(db, people, now);

        logger.LogInformation("Đã seed dữ liệu demo sau {Seconds:N1} giây: 9 tài khoản, 1 người nuôi, 1.700 hộp, 5 lô (database/README.md).",
            Stopwatch.GetElapsedTime(started).TotalSeconds);
    }
}

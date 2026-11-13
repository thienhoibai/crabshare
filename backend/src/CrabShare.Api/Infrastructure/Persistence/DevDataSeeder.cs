using System.Diagnostics;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure.Persistence;

/// <summary>
/// Dữ liệu demo: tài khoản mỗi vai trò, một người nuôi đã duyệt với 1.700 hộp đánh số,
/// rồi 6 lô ở đủ các giai đoạn (DemoLifecycleSeeder) và phần Business Rule v1.5 (Br15DemoSeeder). Danh sách đầy đủ: database/README.md.
/// Có hai cách chạy:
///   1. Development, Seed:Enabled = true, bảng app_user còn trống (chạy DbMigrator --reset để seed lại).
///   2. Bổ sung lên một CSDL đã có tài khoản (Seed:DemoTopUp = true, môi trường nào cũng được): dùng lại các tài khoản mẫu
///      và hộ nuôi mẫu đang có, thêm phần còn thiếu, không xoá gì. Chỉ chạy khi chưa có Lô nào và làm trong một giao dịch.
///      Đây là thao tác của người quản hạ tầng, xem docs/deploy.md.
/// Cần thêm dữ liệu mẫu cho tính năng của mình thì bổ sung vào đây (PR riêng).
/// </summary>
public static class DevDataSeeder
{
    /// <summary>Mật khẩu chung của mọi tài khoản demo do seeder tạo ra.</summary>
    public const string DemoPassword = "CrabShare@2026";

    public static async Task SeedAsync(IServiceProvider services, bool topUp = false)
    {
        using var scope = services.CreateScope();
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(DevDataSeeder));
        if (!topUp && !config.GetValue<bool>("Seed:Enabled")) return;

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (!await db.Database.CanConnectAsync())
        {
            logger.LogWarning("Không kết nối được CSDL — bỏ qua seed. Chạy DbMigrator trước (xem database/README.md).");
            return;
        }

        if (topUp)
        {
            if (await db.Batches.AnyAsync())
            {
                logger.LogInformation("CSDL đã có Lô nên không bổ sung dữ liệu demo. Hãy gỡ cấu hình Seed:DemoTopUp.");
                return;
            }
            try
            {
                // Một giao dịch cho cả khối: lỗi ở đâu thì hoàn tác hết, CSDL giữ nguyên như trước khi chạy.
                await db.InTransactionAsync(() => BuildAsync(db, scope.ServiceProvider, logger, reuseExisting: true));
            }
            catch (Exception e)
            {
                logger.LogError(e, "Bổ sung dữ liệu demo thất bại. Đã hoàn tác, CSDL không thay đổi.");
            }
            return;
        }

        if (await db.AppUsers.AnyAsync()) return;
        await BuildAsync(db, scope.ServiceProvider, logger, reuseExisting: false);
    }

    private static async Task BuildAsync(AppDbContext db, IServiceProvider services, ILogger logger, bool reuseExisting)
    {
        var started = Stopwatch.GetTimestamp();
        var now = DateTimeOffset.UtcNow;
        var hasher = new PasswordHasher<AppUser>();
        // Tài khoản mẫu đã có sẵn trong CSDL: giữ nguyên mật khẩu và hồ sơ, chỉ bổ sung phần còn thiếu.
        var reused = new HashSet<AppUser>();

        async Task<AppUser> UserAsync(string email, string fullName, string? phone, params string[] roles)
        {
            var u = reuseExisting
                ? await db.AppUsers.Include(x => x.AppUserRoles).Include(x => x.Investor).Include(x => x.Customer).SingleOrDefaultAsync(x => x.Email == email)
                : null;
            if (u is null)
            {
                u = new AppUser { Email = email, FullName = fullName, Phone = phone, Status = "Active", CreatedAt = now.AddDays(-200), UpdatedAt = now };
                u.PasswordHash = hasher.HashPassword(u, DemoPassword);
                db.AppUsers.Add(u);
            }
            else reused.Add(u);
            foreach (var r in roles)
                if (u.AppUserRoles.All(x => x.RoleCode != r))
                    u.AppUserRoles.Add(new AppUserRole { RoleCode = r, GrantedAt = u.CreatedAt, CreatedAt = u.CreatedAt });
            return u;
        }

        var admin = await UserAsync("admin@crabshare.local", "Quản trị nền tảng", null, Roles.PlatformAdmin);
        await UserAsync("reviewer@crabshare.local", "Kiểm định viên", null, Roles.EvidenceReviewer);

        var owner = await UserAsync("operator@crabshare.local", "Trần Văn Nuôi", "0913000111", Roles.OperatorMember);
        var staff = await UserAsync("staff@crabshare.local", "Lê Thị Trại", "0913000222", Roles.OperatorMember);

        var investors = new[]
        {
            await UserAsync("investor1@crabshare.local", "Nguyễn Minh Đầu Tư", "0912345678", Roles.Investor, Roles.Customer),
            await UserAsync("investor2@crabshare.local", "Phạm Thu Góp Vốn", "0987654321", Roles.Investor, Roles.Customer),
            await UserAsync("investor3@crabshare.local", "Lê Văn Vốn", "0903111222", Roles.Investor, Roles.Customer),
            await UserAsync("investor4@crabshare.local", "Hoàng Thị Hợp Tác", "0938222333", Roles.Investor, Roles.Customer),
        };
        var buyer = await UserAsync("customer@crabshare.local", "Võ Khách Hàng", "0901234567", Roles.Customer);

        foreach (var inv in investors)
        {
            inv.Investor ??= new Investor { InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = now.AddDays(-190), CreatedAt = inv.CreatedAt };
            if (inv.Investor.VerificationStatus != "Verified")
            {
                inv.Investor.VerificationStatus = "Verified";
                inv.Investor.VerifiedAt ??= now.AddDays(-190);
            }
            inv.Customer ??= new Customer { DisplayName = inv.FullName, CreatedAt = inv.CreatedAt };
        }
        buyer.Customer ??= new Customer { DisplayName = buyer.FullName, CreatedAt = buyer.CreatedAt };

        async Task<CustomerAddress> AddressAsync(AppUser user, string phone, string line, string province)
        {
            var found = reused.Contains(user)
                ? await db.CustomerAddresses.FirstOrDefaultAsync(a => a.CustomerId == user.UserId && a.IsDefault)
                : null;
            if (found is not null) return found;
            var address = new CustomerAddress
            {
                Customer = user.Customer!, RecipientName = user.FullName, RecipientPhone = phone,
                AddressLine = line, Province = province, IsDefault = true, CreatedAt = user.CreatedAt,
            };
            db.CustomerAddresses.Add(address);
            return address;
        }

        var buyerAddress = await AddressAsync(buyer, "0901234567", "12 Nguyễn Huệ, phường Sài Gòn", "TP. Hồ Chí Minh");
        var investorAddress = await AddressAsync(investors[0], "0912345678", "45 Trần Phú, phường Ninh Kiều", "Cần Thơ");

        // Tài khoản nhận tiền đã khớp tên (dùng khi chi trả quyết toán)
        string[] banks = ["VCB", "TCB", "MB", "ACB"];
        for (var i = 0; i < investors.Length; i++)
        {
            var investor = investors[i];
            if (reused.Contains(investor) && await db.PayoutAccounts.AnyAsync(a => a.OwnerUserId == investor.UserId && a.Status == "Active")) continue;
            db.PayoutAccounts.Add(new PayoutAccount
            {
                OwnerUser = investor, BankCode = banks[i], AccountNo = $"10{i + 1}2026{i + 1:0000}",
                AccountHolderName = investor.FullName.ToUpperInvariant(), NameMatchStatus = "Matched", Status = "Active",
                CreatedAt = now.AddDays(-185), UpdatedAt = now,
            });
        }

        await db.SaveChangesAsync();

        var farm = reused.Contains(owner)
            ? await db.Operators.Include(o => o.OperatorMembers).Include(o => o.PhysicalSlots)
                .FirstOrDefaultAsync(o => o.OperatorMembers.Any(m => m.UserId == owner.UserId))
            : null;
        PayoutAccount? farmPayout = null;
        if (farm is null)
        {
            farm = new Operator
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
            db.Operators.Add(farm);
        }
        else
        {
            // Hộ nuôi mẫu đã có: giữ nguyên hồ sơ, chỉ bổ sung nhân viên, sức chứa và hộp còn thiếu.
            if (farm.OperatorMembers.All(m => m.UserId != staff.UserId))
                farm.OperatorMembers.Add(new OperatorMember { UserId = staff.UserId, MemberRole = "Staff", JoinedAt = now, CreatedAt = now });
            if (farm.ApprovedSlotCapacity < 2000) farm.ApprovedSlotCapacity = 2000;
            // Mã hộp kiểu cũ ngắn hơn 4 chữ số ("001") đổi sang 4 chữ số: danh sách xếp theo mã phải khớp thứ tự 0001–1700 mà seeder dùng.
            foreach (var slot in farm.PhysicalSlots)
                if (slot.SlotCode.Length < 4 && int.TryParse(slot.SlotCode, out var number))
                {
                    slot.SlotCode = number.ToString("0000");
                    slot.UpdatedAt = now;
                }
            farmPayout = await db.PayoutAccounts.FirstOrDefaultAsync(a => a.OwnerOperatorId == farm.OperatorId && a.Status == "Active");
        }

        // Hộp đánh số 0001–1700, mỗi lô một dải riêng: chỉ cần số hộp; dãy/kệ/tầng/cột là tuỳ chọn (Phiếu v1.2)
        var codes = farm.PhysicalSlots.Select(s => s.SlotCode).ToHashSet();
        for (var i = 1; i <= 1700; i++)
        {
            var code = i.ToString("0000");
            if (!codes.Contains(code))
                farm.PhysicalSlots.Add(new PhysicalSlot { SlotCode = code, Status = "Available", CreatedAt = farm.CreatedAt, UpdatedAt = now });
        }

        if (farmPayout is null)
        {
            farmPayout = new PayoutAccount
            {
                OwnerOperator = farm, BankCode = "VCB", AccountNo = "0011004567890", AccountHolderName = "HTX NUOI CUA NAM CAN",
                NameMatchStatus = "Matched", Status = "Active", CreatedAt = farm.CreatedAt, UpdatedAt = now,
            };
            db.PayoutAccounts.Add(farmPayout);
        }
        await db.SaveChangesAsync();

        var people = new DemoLifecycleSeeder.People(admin, owner, staff, investors,
            [new(buyer, buyerAddress), new(investors[0], investorAddress)], farm, farmPayout);
        await DemoLifecycleSeeder.SeedAsync(db, people, now);
        // Business Rule v1.5: đối tác, Nhân viên kiểm phẩm, lô P đang nuôi có thiết bị IoT, lô T nhận đặt trước.
        await Br15DemoSeeder.SeedAsync(db, services.GetRequiredService<Features.Parties.PartyDirectory>(), people, buyer, now, logger);

        logger.LogInformation(
            "Đã seed dữ liệu demo sau {Seconds:N1} giây (dùng lại {Reused} tài khoản mẫu có sẵn): 1 người nuôi, 1.740 hộp, 8 lô (database/README.md).",
            Stopwatch.GetElapsedTime(started).TotalSeconds, reused.Count);
    }
}

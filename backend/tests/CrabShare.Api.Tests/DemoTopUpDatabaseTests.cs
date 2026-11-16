using System.Text.RegularExpressions;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

/// <summary>
/// CSDL đã có người dùng thật và các tài khoản mẫu kiểu cũ (hộ nuôi mẫu với 60 hộp mã 3 chữ số, chưa có Lô nào),
/// rồi bật Seed:DemoTopUp — giống lúc bổ sung dữ liệu demo lên môi trường đang chạy (docs/deploy.md).
/// </summary>
public sealed class DemoTopUpFixture : IAsyncLifetime
{
    public const string OwnPassword = "mat-khau-rieng-cua-ho-nuoi";
    public const string RealUserEmail = "nguoi.that@example.test";

    private readonly string databaseName = $"CrabShareTopUpTests_{Guid.NewGuid():N}";
    private const string Master = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
    private string ConnectionString => new SqlConnectionStringBuilder(Master) { InitialCatalog = databaseName }.ConnectionString;
    private WebApplicationFactory<Program> factory = null!;

    public string OwnerHashBefore { get; private set; } = "";

    public AppDbContext OpenDb() => new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(ConnectionString).Options);

    public IServiceProvider Services => factory.Services;

    public async Task InitializeAsync()
    {
        await using (var master = new SqlConnection(Master))
        {
            await master.OpenAsync();
            await new SqlCommand($"CREATE DATABASE [{databaseName}]", master).ExecuteNonQueryAsync();
        }
        await using (var connection = new SqlConnection(ConnectionString))
        {
            await connection.OpenAsync();
            foreach (var file in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Migrations"), "V*.sql").Order())
            foreach (var batch in Regex.Split(await File.ReadAllTextAsync(file), @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
                if (!string.IsNullOrWhiteSpace(batch))
                    await new SqlCommand(batch, connection) { CommandTimeout = 60 }.ExecuteNonQueryAsync();
        }

        await using (var db = OpenDb())
        {
            var now = DateTimeOffset.UtcNow.AddDays(-30);
            var hasher = new PasswordHasher<AppUser>();
            AppUser User(string email, string name, string password, params string[] roles)
            {
                var u = new AppUser { Email = email, FullName = name, Status = "Active", CreatedAt = now, UpdatedAt = now };
                u.PasswordHash = hasher.HashPassword(u, password);
                foreach (var r in roles) u.AppUserRoles.Add(new AppUserRole { RoleCode = r, GrantedAt = now, CreatedAt = now });
                db.AppUsers.Add(u);
                return u;
            }

            var admin = User("admin@crabshare.local", "Quản trị nền tảng", DevDataSeeder.DemoPassword, Roles.PlatformAdmin);
            var owner = User("operator@crabshare.local", "Trần Văn Nuôi", OwnPassword, Roles.OperatorMember);
            var investor = User("investor1@crabshare.local", "Nguyễn Minh Đầu Tư", DevDataSeeder.DemoPassword, Roles.Investor, Roles.Customer);
            investor.Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Unverified", CreatedAt = now };
            investor.Customer = new Customer { DisplayName = investor.FullName, CreatedAt = now };
            var real = User(RealUserEmail, "Người Dùng Thật", "mat-khau-cua-nguoi-that", Roles.Customer);
            real.Customer = new Customer { DisplayName = real.FullName, CreatedAt = now };
            await db.SaveChangesAsync();
            OwnerHashBefore = owner.PasswordHash;

            var farm = new Operator
            {
                LegalName = "HTX Nuôi cua Năm Căn", TaxCode = "2001234567", BusinessRegNo = "61-HTX-0001",
                FarmAddress = "Ấp Hàng Vịnh, Năm Căn, Cà Mau", ApprovedSlotCapacity = 60, Status = "Approved",
                SubmittedAt = now, ApprovedAt = now, ApprovedBy = admin.UserId, CreatedAt = now, UpdatedAt = now,
            };
            farm.OperatorMembers.Add(new OperatorMember { UserId = owner.UserId, MemberRole = "Owner", JoinedAt = now, CreatedAt = now });
            for (var i = 1; i <= 60; i++)
                farm.PhysicalSlots.Add(new PhysicalSlot { SlotCode = i.ToString("000"), Status = "Available", CreatedAt = now, UpdatedAt = now });
            db.Operators.Add(farm);
            await db.SaveChangesAsync();
        }

        // Seed:Enabled tắt, chỉ bật bổ sung: seeder chạy nền sau khi API khởi động
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseSetting("Security:AuthIpPermitLimit", "10000")
            .UseSetting("Seed:Enabled", "false")
            .UseSetting("Seed:DemoTopUp", "true")
            .UseSetting("ConnectionStrings:Default", ConnectionString));
        factory.CreateClient().Dispose();

        for (var i = 0; i < 180; i++)
        {
            await using var db = OpenDb();
            if (await db.Batches.AnyAsync()) return;
            await Task.Delay(1000);
        }
        throw new TimeoutException("Bổ sung dữ liệu demo không xong sau 3 phút");
    }

    public async Task DisposeAsync()
    {
        await factory.DisposeAsync();
        SqlConnection.ClearAllPools();
        await using var master = new SqlConnection(Master);
        await master.OpenAsync();
        await new SqlCommand($"ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{databaseName}]", master).ExecuteNonQueryAsync();
    }
}

[Trait("Category", "Database")]
public class DemoTopUpDatabaseTests(DemoTopUpFixture fixture) : IClassFixture<DemoTopUpFixture>
{
    [Fact]
    public async Task All_demo_batches_arrive_next_to_the_existing_accounts()
    {
        await using var db = fixture.OpenDb();

        Assert.Equal(8, await db.Batches.CountAsync());
        Assert.Equal(1, await db.Operators.CountAsync());
        // 4 tài khoản có sẵn + 6 tài khoản mẫu còn thiếu + 2 nhân viên kiểm phẩm
        Assert.Equal(12, await db.AppUsers.CountAsync());
        Assert.True(await db.AppUsers.AnyAsync(u => u.Email == DemoTopUpFixture.RealUserEmail));
        Assert.Equal(2, await db.AppUserRoles.CountAsync(r => r.RoleCode == Roles.QcInspector));
    }

    [Fact]
    public async Task Existing_sample_accounts_keep_their_password_and_gain_what_the_demo_needs()
    {
        await using var db = fixture.OpenDb();

        var owner = await db.AppUsers.SingleAsync(u => u.Email == "operator@crabshare.local");
        Assert.Equal(fixture.OwnerHashBefore, owner.PasswordHash);

        var investor = await db.AppUsers.Include(u => u.Investor).SingleAsync(u => u.Email == "investor1@crabshare.local");
        Assert.Equal("Verified", investor.Investor!.VerificationStatus);
        Assert.True(await db.PayoutAccounts.AnyAsync(a => a.OwnerUserId == investor.UserId && a.Status == "Active"));
        Assert.True(await db.CustomerAddresses.AnyAsync(a => a.CustomerId == investor.UserId && a.IsDefault));
    }

    [Fact]
    public async Task Old_three_digit_box_codes_become_four_digits_and_the_range_is_complete()
    {
        await using var db = fixture.OpenDb();

        var codes = await db.PhysicalSlots.Select(s => s.SlotCode).ToListAsync();
        Assert.Equal(1740, codes.Count);
        Assert.All(codes, code => Assert.Equal(4, code.Length));
        Assert.Equal(Enumerable.Range(1, 1740).Select(i => i.ToString("0000")), codes.Order());
        Assert.Equal(1, await db.Operators.CountAsync(o => o.ApprovedSlotCapacity >= 2000));
    }

    [Fact]
    public async Task Running_the_top_up_again_adds_nothing()
    {
        await DevDataSeeder.SeedAsync(fixture.Services, topUp: true);

        await using var db = fixture.OpenDb();
        Assert.Equal(8, await db.Batches.CountAsync());
        Assert.Equal(12, await db.AppUsers.CountAsync());
        Assert.Equal(1740, await db.PhysicalSlots.CountAsync());
    }
}

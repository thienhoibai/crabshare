using System.Text.RegularExpressions;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

/// <summary>CSDL trống tạo từ migration rồi bật Seed:Enabled — giống "DbMigrator --reset rồi chạy API" trên máy dev.</summary>
public sealed class DemoSeedFixture : IAsyncLifetime
{
    private readonly string databaseName = $"CrabShareSeedTests_{Guid.NewGuid():N}";
    private const string Master = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
    private string ConnectionString => new SqlConnectionStringBuilder(Master) { InitialCatalog = databaseName }.ConnectionString;
    private WebApplicationFactory<Program> factory = null!;

    public AppDbContext OpenDb() => new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(ConnectionString).Options);

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
        // Khởi động API ở Development với Seed bật → DevDataSeeder chạy trên CSDL trống
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseSetting("Security:AuthIpPermitLimit", "10000")
            .UseSetting("Seed:Enabled", "true")
            .UseSetting("ConnectionStrings:Default", ConnectionString));
        factory.CreateClient().Dispose();
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
public class DemoSeedDatabaseTests(DemoSeedFixture fixture) : IClassFixture<DemoSeedFixture>
{
    [Fact]
    public async Task Every_demo_batch_retains_its_standard_cost_and_items()
    {
        await using var db = fixture.OpenDb();
        Assert.Equal(6, await db.StandardCostVersions.CountAsync());
        Assert.False(await db.StandardCostVersions.AnyAsync(v => !v.StandardCostItems.Any(i => i.Category == "MortalityReserve")));
    }

    [Fact]
    public async Task Co_du_6_lo_o_5_giai_doan()
    {
        await using var db = fixture.OpenDb();

        var statuses = await db.Batches.OrderBy(b => b.BatchCode).Select(b => b.BatchCode + "=" + b.Status).ToListAsync();

        Assert.Equal(new[] { "CS-2605-01=Settlement", "CS-2609-04=Harvesting", "CS-2610-01=InProduction", "CS-2610-02=Funding", "CS-2610-03=Funding", "CS-2611-01=PendingApproval" }, statuses);
    }

    [Fact]
    public async Task Lo_dang_nuoi_co_1180_con_trong_hop_0001_den_1200()
    {
        await using var db = fixture.OpenDb();

        var growing = await db.CrabItems.Where(c => c.Batch.BatchCode == "CS-2610-01" && c.Status == "Growing")
            .Select(c => c.SlotAllocation.Slot.SlotCode).ToListAsync();

        Assert.Equal(1180, growing.Count);
        Assert.All(growing, code => Assert.InRange(int.Parse(code), 1, 1200));
        Assert.Equal(30, await db.ProductionLogs.CountAsync(l => l.Batch.BatchCode == "CS-2610-01"));
    }

    [Fact]
    public async Task Tien_va_ton_kho_khop_nhau()
    {
        await using var db = fixture.OpenDb();

        // Mỗi khoản góp đã xác nhận có yêu cầu thanh toán đã trả và giao dịch ngân hàng khớp
        Assert.False(await db.Contributions.AnyAsync(c => c.Status == "Confirmed"
            && !c.PaymentRequests.Any(r => r.Status == "Paid" && r.ProviderTransactions.Any(t => t.MatchStatus == "Matched"))));
        // Vốn đã chốt = tổng capital_share
        Assert.False(await db.Batches.AnyAsync(b => b.TotalConfirmedCapital != null && b.TotalConfirmedCapital != b.CapitalShares.Sum(s => s.ConfirmedAmount)));
        // Tồn niêm yết = tổng khối lượng cua còn trong kho của đúng hạng đó
        var listings = await db.ProductListings.Select(l => new
        {
            l.StockQtyKg,
            InStockGrams = db.CrabItems.Where(c => c.BatchId == l.BatchId && c.GradeId == l.GradeId && c.Status == "InStock").Sum(c => (int?)c.WeightG) ?? 0,
        }).ToListAsync();
        Assert.NotEmpty(listings);
        Assert.All(listings, l => Assert.Equal(l.InStockGrams / 1000m, l.StockQtyKg));
        // Mọi tem đang hiệu lực đều có ảnh kích hoạt
        Assert.False(await db.CrabTags.AnyAsync(t => t.Status == "Active" && t.ActivationEvidenceId == null));
    }

    [Fact]
    public async Task Lo_gop_von_dang_mo_va_con_cho_de_giu_cho()
    {
        await using var db = fixture.OpenDb();

        var batch = await db.Batches.SingleAsync(b => b.BatchCode == "CS-2610-03");
        var confirmed = await db.Contributions.Where(c => c.BatchId == batch.BatchId && c.Status == "Confirmed").SumAsync(c => c.Amount);

        Assert.Equal(50_000_000, confirmed);
        Assert.True(batch.FundingDeadline > DateTimeOffset.UtcNow);
        Assert.NotNull(await db.BatchAccounts.SingleOrDefaultAsync(a => a.BatchId == batch.BatchId && a.Status == "Open"));
    }
}

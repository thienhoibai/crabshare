using System.Text.RegularExpressions;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[CollectionDefinition("OrderDatabase", DisableParallelization = true)]
public sealed class OrderDatabaseCollection;

/// <summary>CSDL test riêng cho đặt hàng (LocalDB), tạo và xoá theo vòng đời fixture. Không chạy trong CI.</summary>
public sealed class OrderDatabaseFixture : IAsyncLifetime
{
    private readonly string _databaseName = "CrabShareOrderTests_" + Guid.NewGuid().ToString("N");
    private const string MasterConnection = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
    private int _sequence;
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await using var master = new SqlConnection(MasterConnection);
        await master.OpenAsync();
        await using (var command = new SqlCommand($"CREATE DATABASE [{_databaseName}]", master))
            await command.ExecuteNonQueryAsync();
        var connectionString = new SqlConnectionStringBuilder(MasterConnection) { InitialCatalog = _databaseName }.ConnectionString;
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        foreach (var path in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Migrations"), "V*.sql").Order())
        {
            foreach (var batch in Regex.Split(await File.ReadAllTextAsync(path), @"^\s*GO\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(batch)) continue;
                await using var command = new SqlCommand(batch, connection);
                await command.ExecuteNonQueryAsync();
            }
        }
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseSetting("Seed:Enabled", "false")
            .UseSetting("ConnectionStrings:Default", connectionString)
            .ConfigureTestServices(KycControllerTests.AddTestAuth));
    }

    public HttpClient Client(long customerId)
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", customerId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", Roles.Customer);
        return client;
    }

    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> query)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private int Next() => Interlocked.Increment(ref _sequence);

    public async Task<(long CustomerId, long AddressId)> CreateCustomerAsync()
    {
        var n = Next();
        var now = DateTimeOffset.UtcNow;
        var user = new AppUser
        {
            Email = $"buyer-{n}-{Guid.NewGuid():N}@test.local", FullName = $"Khách {n}", PasswordHash = "test-only",
            Status = "Active", CreatedAt = now, UpdatedAt = now,
            Customer = new Customer { DisplayName = $"Khách {n}", CreatedAt = now },
        };
        return await WithDbAsync(async db =>
        {
            db.AppUsers.Add(user);
            await db.SaveChangesAsync();
            var address = new CustomerAddress
            {
                CustomerId = user.UserId, RecipientName = $"Người nhận {n}", RecipientPhone = "0900000000",
                AddressLine = $"{n} Đường Test", Province = "Cà Mau", IsDefault = true, CreatedAt = now,
            };
            db.CustomerAddresses.Add(address);
            await db.SaveChangesAsync();
            return (user.UserId, address.AddressId);
        });
    }

    /// <summary>Một niêm yết hàng tươi L1 của một lô riêng đang thu hoạch, có tài khoản chuyên dùng đã mở.</summary>
    public async Task<long> CreateListingAsync(decimal stockKg, string status = "Published", long pricePerKg = 400_000,
        string accountStatus = "Open")
    {
        var n = Next();
        var now = DateTimeOffset.UtcNow;
        return await WithDbAsync(async db =>
        {
            var gradeId = await db.ProductGrades.Where(g => g.GradeCode == "L1").Select(g => g.GradeId).SingleAsync();
            var batch = new Batch
            {
                BatchCode = $"BT-ORD-{n:D5}", CrabType = "FatteningMudCrab", Title = $"Lô test {n}",
                SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 120, RestockCutoffDays = 30,
                MinViableCapital = 10_000_000, TargetCapital = 20_000_000, MaxCapital = 30_000_000, MinContribution = 1_000_000,
                OperatorSharePct = 7, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15,
                Status = "Harvesting", CreatedAt = now, UpdatedAt = now,
                Operator = new Operator
                {
                    LegalName = $"Trại test {n}", TaxCode = $"9{n:D9}", BusinessRegNo = $"REG-{n:D6}", FarmAddress = "Năm Căn, Cà Mau",
                    ApprovedSlotCapacity = 100, Status = "Approved", CreatedAt = now, UpdatedAt = now,
                },
                BatchAccount = new BatchAccount
                {
                    ProviderName = "Sandbox", ProviderAccountNo = $"VA{n:D10}", Status = accountStatus,
                    OpenedAt = now, CreatedAt = now, UpdatedAt = now,
                },
            };
            var listing = new ProductListing
            {
                Batch = batch, GradeId = gradeId, Title = $"Cua thịt L1 — lô {batch.BatchCode}", StorageType = "Fresh",
                CurrentPricePerKg = pricePerKg, StockQtyKg = stockKg, ReservedQtyKg = 0, Status = status,
                PublishedAt = status == "Draft" ? null : now, CreatedAt = now, UpdatedAt = now,
            };
            // Như CatalogService.CreateAsync: mọi niêm yết có bản ghi giá Initial để checkout chụp phiên bản giá.
            listing.PriceHistories.Add(new PriceHistory
            {
                PricePerKg = pricePerKg, EffectiveFrom = now, ReasonCode = "Initial", CreatedAt = now,
                ChangedByNavigation = PriceSetter(n, now),
            });
            db.ProductListings.Add(listing);
            await db.SaveChangesAsync();
            return listing.ListingId;
        });
    }

    /// <summary>Đổi giá như PATCH /api/listings/{id}/price: thêm bản ghi lịch sử và cập nhật giá hiện tại cùng một lần lưu.</summary>
    public async Task<long> ChangePriceAsync(long listingId, long pricePerKg)
    {
        var n = Next();
        var now = DateTimeOffset.UtcNow;
        return await WithDbAsync(async db =>
        {
            var listing = await db.ProductListings.SingleAsync(l => l.ListingId == listingId);
            var revision = new PriceHistory
            {
                PricePerKg = pricePerKg, PreviousPricePerKg = listing.CurrentPricePerKg, EffectiveFrom = now,
                ReasonCode = "Market", CreatedAt = now, ChangedByNavigation = PriceSetter(n, now),
            };
            listing.PriceHistories.Add(revision);
            listing.CurrentPricePerKg = pricePerKg;
            listing.UpdatedAt = now;
            await db.SaveChangesAsync();
            return revision.PriceHistoryId;
        });
    }

    private static AppUser PriceSetter(int n, DateTimeOffset now) => new()
    {
        Email = $"seller-{n}-{Guid.NewGuid():N}@test.local", FullName = $"Người nuôi {n}", PasswordHash = "test-only",
        Status = "Active", CreatedAt = now, UpdatedAt = now,
    };

    public HttpClient OperatorClient(long userId, long operatorId)
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", Roles.OperatorMember);
        client.DefaultRequestHeaders.Add("X-Test-Operator", operatorId.ToString());
        return client;
    }

    public async Task DisposeAsync()
    {
        if (Factory is not null) await Factory.DisposeAsync();
        SqlConnection.ClearAllPools();
        await using var master = new SqlConnection(MasterConnection);
        await master.OpenAsync();
        await using var command = new SqlCommand($"IF DB_ID('{_databaseName}') IS NOT NULL BEGIN ALTER DATABASE [{_databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_databaseName}]; END", master);
        await command.ExecuteNonQueryAsync();
    }
}

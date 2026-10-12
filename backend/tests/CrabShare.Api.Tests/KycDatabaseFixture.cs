using System.Text.RegularExpressions;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

/// <summary>Chỉ tạo/xoá CSDL test riêng, không chạm CrabShareDev. Các test Database không chạy trong CI.</summary>
public sealed class KycDatabaseFixture : IAsyncLifetime
{
    private readonly string _databaseName = "CrabShareKycTests_" + Guid.NewGuid().ToString("N");
    private const string MasterConnection = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public string StorageRoot { get; } = Path.Combine(Path.GetTempPath(), "CrabShareKycTests", Guid.NewGuid().ToString("N"));

    public async Task InitializeAsync()
    {
        await using var master = new SqlConnection(MasterConnection);
        await master.OpenAsync();
        await using (var command = new SqlCommand($"CREATE DATABASE [{_databaseName}]", master))
            await command.ExecuteNonQueryAsync();
        var builder = new SqlConnectionStringBuilder(MasterConnection) { InitialCatalog = _databaseName };
        var connectionString = builder.ConnectionString;
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
            .UseSetting("Storage:RootPath", StorageRoot)
            .ConfigureTestServices(KycControllerTests.AddTestAuth));
    }

    public async Task<long> CreateInvestorAsync(string status = "Unverified")
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTimeOffset.UtcNow;
        var user = new AppUser
        {
            Email = $"kyc-{Guid.NewGuid():N}@test.local", FullName = "KYC Test", PasswordHash = "test-only",
            Status = "Active", CreatedAt = now, UpdatedAt = now,
            Investor = new Investor
            {
                InvestorKind = "Individual", VerificationStatus = status,
                VerifiedAt = status == "Verified" ? now : null, CreatedAt = now,
            },
        };
        db.AppUsers.Add(user);
        await db.SaveChangesAsync();
        return user.UserId;
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

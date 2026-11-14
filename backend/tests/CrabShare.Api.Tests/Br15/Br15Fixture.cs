using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Tests.Br15;

/// <summary>Đăng nhập giả cho test: X-Test-User, X-Test-Roles (nhiều vai trò, cách nhau dấu phẩy), X-Test-Operator.</summary>
public sealed class Br15TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Br15Test";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("X-Test-User", out var userId)) return Task.FromResult(AuthenticateResult.NoResult());
        var claims = new List<Claim> { new("sub", userId.ToString()) };
        foreach (var role in Request.Headers["X-Test-Roles"].ToString().Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            claims.Add(new Claim(AuthSetup.RoleClaim, role));
        if (Request.Headers.TryGetValue("X-Test-Operator", out var op) && !string.IsNullOrWhiteSpace(op))
            claims.Add(new Claim(CurrentUser.OperatorIdClaim, op.ToString()));
        var identity = new ClaimsIdentity(claims, SchemeName, "name", AuthSetup.RoleClaim);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}

/// <summary>
/// CSDL LocalDB riêng cho các test theo Business Rule v1.5, dựng từ mọi file migration.
/// Có sẵn một Admin, các hàm tạo người dùng, hộ nuôi đã duyệt (có trại kèm toạ độ) và client đã đăng nhập.
/// </summary>
public class Br15Fixture : IAsyncLifetime
{
    private readonly string databaseName = $"CrabShareBr15Tests_{Guid.NewGuid():N}";
    private const string Master = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
    private readonly string storageRoot = Path.Combine(Path.GetTempPath(), $"crabshare-br15-tests-{Guid.NewGuid():N}");
    private int sequence;

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public string ConnectionString => new SqlConnectionStringBuilder(Master) { InitialCatalog = databaseName }.ConnectionString;
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public long AdminId { get; private set; }

    public AppDbContext OpenDb() => new(new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(ConnectionString).Options);

    /// <summary>Cấu hình thêm cho từng bộ test (ví dụ thay đồng hồ, tắt job).</summary>
    protected virtual void Configure(IWebHostBuilder builder) { }

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
                    await new SqlCommand(batch, connection) { CommandTimeout = 120 }.ExecuteNonQueryAsync();
        }
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("Security:AuthIpPermitLimit", "10000")
                .UseSetting("Seed:Enabled", "false")
                .UseSetting("Storage:Provider", "Local")
                .UseSetting("Storage:RootPath", storageRoot)
                .UseSetting("ConnectionStrings:Default", ConnectionString)
                .ConfigureTestServices(services => services.AddAuthentication(o =>
                {
                    o.DefaultAuthenticateScheme = Br15TestAuthHandler.SchemeName;
                    o.DefaultChallengeScheme = Br15TestAuthHandler.SchemeName;
                    o.DefaultForbidScheme = Br15TestAuthHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, Br15TestAuthHandler>(Br15TestAuthHandler.SchemeName, _ => { }));
            Configure(b);
        });
        AdminId = await CreateUserAsync("Admin", Roles.PlatformAdmin);
    }

    public async Task DisposeAsync()
    {
        if (Factory is not null) await Factory.DisposeAsync();
        if (Directory.Exists(storageRoot)) Directory.Delete(storageRoot, recursive: true);
        SqlConnection.ClearAllPools();
        await using var master = new SqlConnection(Master);
        await master.OpenAsync();
        await new SqlCommand($"ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{databaseName}]", master).ExecuteNonQueryAsync();
    }

    public int Next() => Interlocked.Increment(ref sequence);

    public HttpClient Client(long userId, params string[] roles) => Client(userId, null, roles);

    public HttpClient Client(long userId, long? operatorId, params string[] roles)
    {
        var client = Factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Roles", string.Join(',', roles));
        if (operatorId is { } op) client.DefaultRequestHeaders.Add("X-Test-Operator", op.ToString());
        return client;
    }

    public HttpClient Admin() => Client(AdminId, Roles.PlatformAdmin);

    /// <summary>Tạo tài khoản kèm đối tác cá nhân và các vai trò cho trước.</summary>
    public async Task<long> CreateUserAsync(string name, params string[] roles)
    {
        var n = Next();
        var now = DateTimeOffset.UtcNow;
        await using var db = OpenDb();
        var party = new Party
        {
            LegalName = $"{name} {n}", PartyType = "Individual", VerificationStatus = "Verified", VerifiedAt = now,
            RegisteredAt = now, CreatedAt = now, UpdatedAt = now,
        };
        db.Parties.Add(party);
        await db.SaveChangesAsync();
        var user = new AppUser
        {
            Email = $"u{n}-{Guid.NewGuid():N}@test.local", FullName = $"{name} {n}", PasswordHash = "test-only", Status = "Active",
            CreatedAt = now, UpdatedAt = now, PartyId = party.PartyId,
        };
        foreach (var role in roles) user.AppUserRoles.Add(new AppUserRole { RoleCode = role, GrantedAt = now, CreatedAt = now });
        if (roles.Contains(Roles.Investor))
        {
            user.Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Verified", VerifiedAt = now, CreatedAt = now };
            db.PartnerRoles.Add(new PartnerRole { PartyId = party.PartyId, RoleType = "Investor", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
        }
        if (roles.Contains(Roles.Customer) || roles.Contains(Roles.Investor))
        {
            user.Customer = new Customer { DisplayName = user.FullName, CustomerType = "Restaurant", CreatedAt = now };
            db.PartnerRoles.Add(new PartnerRole { PartyId = party.PartyId, RoleType = "Customer", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
        }
        db.AppUsers.Add(user);
        await db.SaveChangesAsync();
        return user.UserId;
    }

    public async Task<long> PartyIdOfUserAsync(long userId)
    {
        await using var db = OpenDb();
        return await db.AppUsers.Where(u => u.UserId == userId).Select(u => u.PartyId!.Value).SingleAsync();
    }

    public sealed record Farmer(long UserId, long OperatorId, long PartyId, long FarmSiteId)
    {
        public HttpClient Client(Br15Fixture f) => f.Client(UserId, OperatorId, Roles.OperatorMember, Roles.Customer);
    }

    /// <summary>Hộ nuôi đã duyệt: đối tác hộ kinh doanh, vai trò người nuôi đang hoạt động, trại có toạ độ ở Cà Mau.</summary>
    public async Task<Farmer> CreateFarmerAsync(int slots = 0)
    {
        var n = Next();
        var userId = await CreateUserAsync("Chủ hộ", Roles.OperatorMember, Roles.Customer);
        var now = DateTimeOffset.UtcNow;
        await using var db = OpenDb();
        var user = await db.AppUsers.SingleAsync(u => u.UserId == userId);
        var party = await db.Parties.SingleAsync(p => p.PartyId == user.PartyId);
        party.LegalName = $"Hộ nuôi cua {n}";
        party.PartyType = "Household";
        party.RegistrationNo = $"HKD{n:D6}{Random.Shared.Next(1000, 9999)}";
        party.Representative = user.FullName;
        db.PartnerRoles.Add(new PartnerRole { PartyId = party.PartyId, RoleType = "Farmer", Status = "Active", ValidFrom = now, CreatedAt = now, UpdatedAt = now });
        var site = new PartySite
        {
            PartyId = party.PartyId, SiteCode = "TRAI-01", SiteType = "Farm", Name = party.LegalName, AddressLine = "Năm Căn, Cà Mau",
            Province = "Cà Mau", Latitude = 8.7600m, Longitude = 105.0500m, IsDefault = true, Status = "Active", CreatedAt = now, UpdatedAt = now,
        };
        db.PartySites.Add(site);
        var farm = new Operator
        {
            LegalName = party.LegalName, TaxCode = $"{n:D4}{Random.Shared.Next(100000, 999999)}", BusinessRegNo = $"REG-{n}",
            FarmAddress = "Năm Căn, Cà Mau", ApprovedSlotCapacity = Math.Max(slots, 2000), Status = "Approved",
            SubmittedAt = now, ApprovedAt = now, CreatedAt = now, UpdatedAt = now, PartyId = party.PartyId,
        };
        farm.OperatorMembers.Add(new OperatorMember { UserId = userId, MemberRole = "Owner", JoinedAt = now, CreatedAt = now });
        db.Operators.Add(farm);
        await db.SaveChangesAsync();
        for (var i = 1; i <= slots; i++)
            db.PhysicalSlots.Add(new PhysicalSlot
            {
                OperatorId = farm.OperatorId, SlotCode = i.ToString("D4"), RowCode = "A", RackNo = 1, TierNo = (short)((i - 1) / 10 % 4 + 1),
                ColumnNo = (short)((i - 1) % 10 + 1), Status = "Available", CreatedAt = now, UpdatedAt = now,
            });
        await db.SaveChangesAsync();
        return new Farmer(userId, farm.OperatorId, party.PartyId, site.SiteId);
    }

    public static async Task<string?> ErrorCode(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(body)) return null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
        }
        catch (JsonException) { return null; }
    }

    public static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
            throw new Xunit.Sdk.XunitException($"{(int)response.StatusCode} {response.ReasonPhrase}: {text}");
        return JsonDocument.Parse(text).RootElement.Clone();
    }

    public static Task<HttpResponseMessage> PostJson(HttpClient client, string url, object body) => client.PostAsJsonAsync(url, body, Json);
}

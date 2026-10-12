using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

/// <summary>CSDL riêng cho test góp vốn (tạo từ migration, có sẵn RD-2026-01 của V002) + một người nuôi đã duyệt.</summary>
public sealed class FundingDatabaseFixture : IAsyncLifetime
{
    private readonly string databaseName = $"CrabShareFundingTests_{Guid.NewGuid():N}";
    private const string Master = "Server=(localdb)\\MSSQLLocalDB;Database=master;Trusted_Connection=True;TrustServerCertificate=True";
    private string ConnectionString => new SqlConnectionStringBuilder(Master) { InitialCatalog = databaseName }.ConnectionString;
    public WebApplicationFactory<Program> Factory { get; private set; } = null!;
    public long OperatorId { get; private set; }

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
        await using (var db = OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            var farm = new Operator
            {
                LegalName = "HTX Test góp vốn", TaxCode = "0300000001", BusinessRegNo = "TEST-0001", FarmAddress = "Cà Mau",
                ApprovedSlotCapacity = 500, Status = "Approved", SubmittedAt = now, ApprovedAt = now, CreatedAt = now, UpdatedAt = now,
            };
            db.Operators.Add(farm);
            await db.SaveChangesAsync();
            OperatorId = farm.OperatorId;
        }
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseSetting("Seed:Enabled", "false")
            .UseSetting("ConnectionStrings:Default", ConnectionString));
    }

    public async Task DisposeAsync()
    {
        if (Factory is not null) await Factory.DisposeAsync();
        SqlConnection.ClearAllPools();
        await using var master = new SqlConnection(Master);
        await master.OpenAsync();
        await new SqlCommand($"ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{databaseName}]", master).ExecuteNonQueryAsync();
    }
}

[Trait("Category", "Database")]
public class FundingDatabaseTests(FundingDatabaseFixture fixture) : IClassFixture<FundingDatabaseFixture>
{
    private async Task<(HttpClient Client, long UserId)> InvestorAsync(bool verified = true, bool acknowledged = true)
    {
        var client = fixture.Factory.CreateClient();
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        { email = $"inv-{Guid.NewGuid():N}@test.local", password = "Test-password-123", fullName = "Nhà đầu tư test", role = "Investor" });
        register.EnsureSuccessStatusCode();
        var auth = (await register.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        if (verified)
        {
            await using var db = fixture.OpenDb();
            await db.Investors.Where(i => i.UserId == auth.User.UserId).ExecuteUpdateAsync(s => s
                .SetProperty(i => i.VerificationStatus, "Verified").SetProperty(i => i.VerifiedAt, DateTimeOffset.UtcNow));
        }
        if (acknowledged)
        {
            var rd = (await client.GetFromJsonAsync<RiskDisclosureResponse>("/api/risk-disclosures/active"))!;
            (await client.PostAsJsonAsync("/api/risk-acknowledgements", new { rd.RiskDisclosureId, scrolledToEnd = true })).EnsureSuccessStatusCode();
        }
        return (client, auth.User.UserId);
    }

    private async Task<string> FundingBatchAsync(long maxCapital = 10_000_000, long minContribution = 1_000_000)
    {
        await using var db = fixture.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var code = $"TF-{Guid.NewGuid():N}"[..20];
        db.Batches.Add(new Batch
        {
            BatchCode = code, OperatorId = fixture.OperatorId, CrabType = "FatteningMudCrab", Title = "Lô test góp vốn",
            SeedQuantity = 100, ExpectedOutputKg = 40, CycleDays = 90, RestockCutoffDays = 15,
            MinViableCapital = maxCapital / 2, TargetCapital = maxCapital, MaxCapital = maxCapital, MinContribution = minContribution,
            OperatorSharePct = 7, FrozenStockCapMonths = 4, OfftakePreorderCapPct = 60, OfftakeDepositPct = 15,
            Status = "Funding", FundingOpenAt = now.AddDays(-1), FundingDeadline = now.AddDays(10), CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return code;
    }

    private static Task<HttpResponseMessage> Reserve(HttpClient client, string code, long amount)
        => client.PostAsJsonAsync($"/api/batches/{code}/contributions", new { amount });

    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    [Fact]
    public async Task Ban_cong_bo_rui_ro_doc_tu_file_va_khop_hash()
    {
        var (client, _) = await InvestorAsync(acknowledged: false);

        var rd = (await client.GetFromJsonAsync<RiskDisclosureResponse>("/api/risk-disclosures/active"))!;

        Assert.Equal("RD-2026-01", rd.VersionCode);
        Assert.Contains("RD-2026-01", rd.Content);
        Assert.Null(rd.AcknowledgedAt);
    }

    [Fact]
    public async Task Xac_nhan_khi_chua_cuon_het_thi_422()
    {
        var (client, _) = await InvestorAsync(acknowledged: false);
        var rd = (await client.GetFromJsonAsync<RiskDisclosureResponse>("/api/risk-disclosures/active"))!;

        var response = await client.PostAsJsonAsync("/api/risk-acknowledgements", new { rd.RiskDisclosureId, scrolledToEnd = false });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("funding.must_scroll_to_end", await ErrorCode(response));
    }

    [Fact]
    public async Task Chua_eKYC_thi_422_funding_kyc_required()
    {
        var code = await FundingBatchAsync();
        var (client, _) = await InvestorAsync(verified: false);

        var response = await Reserve(client, code, 2_000_000);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("funding.kyc_required", await ErrorCode(response));
    }

    [Fact]
    public async Task Chua_xac_nhan_rui_ro_thi_422()
    {
        var code = await FundingBatchAsync();
        var (client, _) = await InvestorAsync(acknowledged: false);

        var response = await Reserve(client, code, 2_000_000);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("funding.risk_ack_required", await ErrorCode(response));
    }

    [Fact]
    public async Task Duoi_muc_gop_toi_thieu_thi_422()
    {
        var code = await FundingBatchAsync(minContribution: 1_000_000);
        var (client, _) = await InvestorAsync();

        var response = await Reserve(client, code, 999_999);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("funding.below_min_contribution", await ErrorCode(response));
    }

    [Fact]
    public async Task Giu_cho_thanh_cong_tra_201_co_han_va_ghi_audit()
    {
        var code = await FundingBatchAsync();
        var (client, userId) = await InvestorAsync();

        var response = await Reserve(client, code, 3_000_000);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var contribution = (await response.Content.ReadFromJsonAsync<ContributionResponse>())!;
        Assert.Equal("Reserved", contribution.Status);
        Assert.Equal(TimeSpan.FromMinutes(30), contribution.ExpiresAt - contribution.ReservedAt);
        var funding = (await client.GetFromJsonAsync<FundingBatchResponse>($"/api/funding/batches/{code}"))!;
        Assert.Equal(3_000_000, funding.ReservedCapital);
        Assert.Equal(7_000_000, funding.RemainingCapacity);
        Assert.Equal(contribution.ContributionId, funding.MyActiveReservation?.ContributionId);
        Assert.True(funding.Me.KycVerified && funding.Me.RiskAcknowledged);

        await using var db = fixture.OpenDb();
        var row = await db.AuditLogs.SingleAsync(a => a.EntityType == "contribution" && a.EntityId == contribution.ContributionId);
        Assert.Equal("reserve", row.ActionType);
        Assert.Equal(userId, row.ActorUserId);
        Assert.True(AuditChainVerifier.Verify(await db.AuditLogs.OrderBy(a => a.AuditId).ToListAsync()).IsValid);
    }

    [Fact]
    public async Task Nam_nguoi_giu_cho_cung_luc_khong_vuot_tran()
    {
        var code = await FundingBatchAsync(maxCapital: 10_000_000);
        var investors = new List<HttpClient>();
        for (var i = 0; i < 5; i++) investors.Add((await InvestorAsync()).Client);

        var responses = await Task.WhenAll(investors.Select(c => Reserve(c, code, 3_000_000)));

        Assert.Equal(3, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(2, responses.Count(r => r.StatusCode == HttpStatusCode.UnprocessableEntity));
        await using var db = fixture.OpenDb();
        var reserved = await db.Contributions.Where(c => c.Batch.BatchCode == code && c.Status == "Reserved").SumAsync(c => c.Amount);
        Assert.Equal(9_000_000, reserved);
    }

    [Fact]
    public async Task Huy_giu_cho_tra_lai_suc_chua_va_khong_huy_hai_lan()
    {
        var code = await FundingBatchAsync();
        var (owner, _) = await InvestorAsync();
        var (stranger, _) = await InvestorAsync();
        var contribution = (await (await Reserve(owner, code, 4_000_000)).Content.ReadFromJsonAsync<ContributionResponse>())!;

        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.DeleteAsync($"/api/contributions/{contribution.ContributionId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/contributions/{contribution.ContributionId}")).StatusCode);
        var again = await owner.DeleteAsync($"/api/contributions/{contribution.ContributionId}");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, again.StatusCode);
        Assert.Equal("contribution.not_cancellable", await ErrorCode(again));
        var funding = (await owner.GetFromJsonAsync<FundingBatchResponse>($"/api/funding/batches/{code}"))!;
        Assert.Equal(0, funding.ReservedCapital);
        Assert.Null(funding.MyActiveReservation);
        var mine = (await owner.GetFromJsonAsync<List<ContributionResponse>>("/api/me/contributions"))!;
        Assert.Equal("Expired", Assert.Single(mine).Status);
    }

    [Fact]
    public async Task Moi_nguoi_chi_giu_mot_cho_tai_mot_lo()
    {
        var code = await FundingBatchAsync();
        var (client, _) = await InvestorAsync();
        Assert.Equal(HttpStatusCode.Created, (await Reserve(client, code, 2_000_000)).StatusCode);

        var second = await Reserve(client, code, 2_000_000);

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.Equal("funding.reservation_exists", await ErrorCode(second));
    }

    [Fact]
    public async Task Lo_dang_mo_goi_von_co_trong_danh_sach()
    {
        var code = await FundingBatchAsync();
        var (client, _) = await InvestorAsync();

        var open = (await client.GetFromJsonAsync<List<FundingBatchSummary>>("/api/funding/batches"))!;

        Assert.Contains(open, b => b.BatchCode == code && b.RemainingCapacity == 10_000_000);
    }
}

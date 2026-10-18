using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Features.Offtake;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

public class OfftakeRulesTests
{
    [Theory]
    [InlineData(2_600_000, 15, 390_000)]
    [InlineData(100, 15, 15)]
    public void ComputeDeposit_rounds_away_from_zero(long value, int pct, long expected)
        => Assert.Equal(expected, OfftakeService.ComputeDeposit(value, pct));
}

[Trait("Category", "Database")]
public class OfftakeDatabaseTests(FundingDatabaseFixture fixture) : IClassFixture<FundingDatabaseFixture>
{
    private static async Task<string?> ErrorCode(HttpResponseMessage response)
        => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private static async Task<WebhookResult> SimulateAsync(HttpClient client, string referenceCode)
    {
        using var response = await client.PostAsJsonAsync("/api/dev/payments/simulate", new { referenceCode });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WebhookResult>())!;
    }

    private async Task<(HttpClient Client, long UserId)> InvestorAsync()
    {
        var client = fixture.Factory.CreateClient();
        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = $"inv-offtake-{Guid.NewGuid():N}@test.local",
            password = "Test-password-123",
            fullName = "NĐT Cam Kết Bao Tiêu",
            role = "Investor",
        });
        register.EnsureSuccessStatusCode();
        var auth = (await register.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        await using var db = fixture.OpenDb();
        await db.Investors.Where(i => i.UserId == auth.User.UserId).ExecuteUpdateAsync(s => s
            .SetProperty(i => i.VerificationStatus, "Verified")
            .SetProperty(i => i.VerifiedAt, DateTimeOffset.UtcNow));

        var rd = (await client.GetFromJsonAsync<RiskDisclosureResponse>("/api/risk-disclosures/active"))!;
        (await client.PostAsJsonAsync("/api/risk-acknowledgements", new { rd.RiskDisclosureId, scrolledToEnd = true })).EnsureSuccessStatusCode();

        return (client, auth.User.UserId);
    }

    private async Task<(string BatchCode, long BatchId)> CreateFundingBatchAsync(
        decimal expectedOutputKg = 40m,
        decimal capPct = 60m,
        decimal depositPct = 15m,
        string status = "Funding",
        TimeSpan? deadlineIn = null)
    {
        await using var db = fixture.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var code = $"BT-{Guid.NewGuid():N}"[..20];
        var batch = new Batch
        {
            BatchCode = code,
            OperatorId = fixture.OperatorId,
            CrabType = "FatteningMudCrab",
            Title = "Lô test bao tiêu",
            SeedQuantity = 100,
            ExpectedOutputKg = expectedOutputKg,
            CycleDays = 90,
            RestockCutoffDays = 15,
            MinViableCapital = 5_000_000,
            TargetCapital = 10_000_000,
            MaxCapital = 10_000_000,
            MinContribution = 1_000_000,
            OperatorSharePct = 7,
            FrozenStockCapMonths = 4,
            OfftakePreorderCapPct = capPct,
            OfftakeDepositPct = depositPct,
            Status = status,
            FundingOpenAt = now.AddDays(-1),
            FundingDeadline = now + (deadlineIn ?? TimeSpan.FromDays(10)),
            CreatedAt = now,
            UpdatedAt = now,
            BatchAccount = new BatchAccount
            {
                ProviderName = "Sandbox",
                ProviderAccountNo = "SBX" + code[3..],
                Status = "Open",
                OpenedAt = now,
                CreatedAt = now,
                UpdatedAt = now,
            },
        };
        db.Batches.Add(batch);
        await db.SaveChangesAsync();
        return (code, batch.BatchId);
    }

    private async Task<long> CreateConfirmedContributionAsync(long batchId, long investorId, long amount = 2_000_000)
    {
        await using var db = fixture.OpenDb();
        var now = DateTimeOffset.UtcNow;
        var contribution = new Contribution
        {
            BatchId = batchId,
            InvestorId = investorId,
            Amount = amount,
            Status = "Confirmed",
            ConfirmedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Contributions.Add(contribution);
        await db.SaveChangesAsync();
        return contribution.ContributionId;
    }

    [Fact]
    public async Task Create_returns_201_with_BT_payment_and_pending_deposit()
    {
        var (client, userId) = await InvestorAsync();
        var (code, batchId) = await CreateFundingBatchAsync(expectedOutputKg: 40, depositPct: 15);
        var contributionId = await CreateConfirmedContributionAsync(batchId, userId);

        using var res = await client.PostAsJsonAsync($"/api/batches/{code}/offtake-commitments", new
        {
            contributionId,
            gradeCode = "L1",
            qtyKg = 10m,
            fixedUnitPrice = 260_000L,
        });

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<OfftakeCommitmentResponse>())!;
        Assert.Equal(code, body.BatchCode);
        Assert.Equal(contributionId, body.ContributionId);
        Assert.Equal("L1", body.GradeCode);
        Assert.Equal(10m, body.CommittedQtyKg);
        Assert.Equal(260_000L, body.FixedUnitPrice);
        Assert.Equal(2_600_000L, body.CommitmentValue);
        Assert.Equal(390_000L, body.DepositAmount);
        Assert.Equal("Pending", body.DepositStatus);
        Assert.Equal("PendingHarvest", body.Status);
        Assert.NotNull(body.Payment);
        Assert.StartsWith("BT", body.Payment.ReferenceCode);
        Assert.Equal(390_000L, body.Payment.Amount);

        await using var db = fixture.OpenDb();
        var offtake = await db.OfftakeCommitments.AsNoTracking().SingleAsync(o => o.OfftakeId == body.OfftakeId);
        Assert.Equal("Pending", offtake.DepositStatus);
        Assert.Equal("PendingHarvest", offtake.Status);

        var cap = await db.VBatchCommitmentCaps.AsNoTracking().SingleAsync(v => v.BatchId == batchId);
        Assert.Equal(10m, cap.OfftakeKg);
        Assert.Equal(14m, cap.RemainingKg); // 40 * 60% = 24kg - 10kg = 14kg
    }

    [Fact]
    public async Task Create_related_party_operator_member_returns_422()
    {
        var (client, userId) = await InvestorAsync();
        var (code, batchId) = await CreateFundingBatchAsync();
        var contributionId = await CreateConfirmedContributionAsync(batchId, userId);

        await using (var db = fixture.OpenDb())
        {
            db.OperatorMembers.Add(new OperatorMember
            {
                OperatorId = fixture.OperatorId,
                UserId = userId,
                MemberRole = "Owner",
                JoinedAt = DateTimeOffset.UtcNow,
                CreatedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        using var res = await client.PostAsJsonAsync($"/api/batches/{code}/offtake-commitments", new
        {
            contributionId,
            gradeCode = "L1",
            qtyKg = 5m,
            fixedUnitPrice = 260_000L,
        });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("offtake.related_party", await ErrorCode(res));
    }

    [Fact]
    public async Task Create_cap_exceeded_returns_422_with_details()
    {
        var (client, userId) = await InvestorAsync();
        var (code, batchId) = await CreateFundingBatchAsync(expectedOutputKg: 40m, capPct: 60m); // Cap = 24kg
        var contributionId = await CreateConfirmedContributionAsync(batchId, userId);

        using var res = await client.PostAsJsonAsync($"/api/batches/{code}/offtake-commitments", new
        {
            contributionId,
            gradeCode = "L1",
            qtyKg = 25m, // Vượt trần 24kg
            fixedUnitPrice = 260_000L,
        });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        var json = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("offtake.cap_exceeded", json.GetProperty("code").GetString());
        var details = json.GetProperty("details");
        Assert.Equal(24m, details.GetProperty("remainingKg").GetDecimal());
        Assert.Equal(25m, details.GetProperty("requestedKg").GetDecimal());
        Assert.Equal(24m, details.GetProperty("capKg").GetDecimal());
    }

    [Fact]
    public async Task Create_duplicate_contribution_returns_422()
    {
        var (client, userId) = await InvestorAsync();
        var (code, batchId) = await CreateFundingBatchAsync();
        var contributionId = await CreateConfirmedContributionAsync(batchId, userId);

        using var first = await client.PostAsJsonAsync($"/api/batches/{code}/offtake-commitments", new
        {
            contributionId,
            gradeCode = "L1",
            qtyKg = 5m,
            fixedUnitPrice = 260_000L,
        });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        using var second = await client.PostAsJsonAsync($"/api/batches/{code}/offtake-commitments", new
        {
            contributionId,
            gradeCode = "L2",
            qtyKg = 2m,
            fixedUnitPrice = 250_000L,
        });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, second.StatusCode);
        Assert.Equal("offtake.already_exists", await ErrorCode(second));
    }

    [Fact]
    public async Task Create_on_closed_funding_returns_422()
    {
        var (client, userId) = await InvestorAsync();
        var (code, batchId) = await CreateFundingBatchAsync(status: "InProduction");
        var contributionId = await CreateConfirmedContributionAsync(batchId, userId);

        using var res = await client.PostAsJsonAsync($"/api/batches/{code}/offtake-commitments", new
        {
            contributionId,
            gradeCode = "L1",
            qtyKg = 5m,
            fixedUnitPrice = 260_000L,
        });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Equal("offtake.funding_closed", await ErrorCode(res));
    }

    [Fact]
    public async Task Simulate_BT_sets_deposit_held()
    {
        var (client, userId) = await InvestorAsync();
        var (code, batchId) = await CreateFundingBatchAsync();
        var contributionId = await CreateConfirmedContributionAsync(batchId, userId);

        using var res = await client.PostAsJsonAsync($"/api/batches/{code}/offtake-commitments", new
        {
            contributionId,
            gradeCode = "L1",
            qtyKg = 5m,
            fixedUnitPrice = 260_000L,
        });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<OfftakeCommitmentResponse>())!;

        var sim = await SimulateAsync(client, body.Payment!.ReferenceCode);
        Assert.Equal(WebhookResult.Matched, sim.Outcome);
        Assert.Equal(PaymentPurposes.OfftakeDeposit, sim.Purpose);

        await using var db = fixture.OpenDb();
        var offtake = await db.OfftakeCommitments.AsNoTracking().SingleAsync(o => o.OfftakeId == body.OfftakeId);
        Assert.Equal("Held", offtake.DepositStatus);
        Assert.Equal("PendingHarvest", offtake.Status);

        // Kiểm tra audit
        var audit = await db.AuditLogs.AsNoTracking()
            .Where(a => a.EntityType == "offtake_commitment" && a.EntityId == body.OfftakeId && a.ActionType == OfftakeService.DepositHeldAction)
            .FirstOrDefaultAsync();
        Assert.NotNull(audit);

        // GET mine
        using var mineRes = await client.GetAsync("/api/me/offtake-commitments");
        Assert.Equal(HttpStatusCode.OK, mineRes.StatusCode);
        var mine = (await mineRes.Content.ReadFromJsonAsync<List<OfftakeCommitmentResponse>>())!;
        var mineItem = Assert.Single(mine, o => o.OfftakeId == body.OfftakeId);
        Assert.Equal("Held", mineItem.DepositStatus);
    }

    [Fact]
    public async Task Expire_unpaid_cancels_offtake_and_frees_cap()
    {
        var (client, userId) = await InvestorAsync();
        var (code, batchId) = await CreateFundingBatchAsync(expectedOutputKg: 40m, capPct: 60m); // Cap = 24kg
        var contributionId = await CreateConfirmedContributionAsync(batchId, userId);

        using var res = await client.PostAsJsonAsync($"/api/batches/{code}/offtake-commitments", new
        {
            contributionId,
            gradeCode = "L1",
            qtyKg = 10m,
            fixedUnitPrice = 260_000L,
        });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<OfftakeCommitmentResponse>())!;

        await using (var db = fixture.OpenDb())
        {
            var cap = await db.VBatchCommitmentCaps.AsNoTracking().SingleAsync(v => v.BatchId == batchId);
            Assert.Equal(14m, cap.RemainingKg);

            // Giả lập payment request đã quá hạn
            await db.PaymentRequests
                .Where(p => p.PaymentRequestId == body.Payment!.PaymentRequestId)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-5)));
        }

        // Chạy job hết hạn
        using var scope = fixture.Factory.Services.CreateScope();
        var expiryService = scope.ServiceProvider.GetRequiredService<ReservationExpiryService>();
        var expiredCount = await expiryService.ReleaseExpiredAsync(CancellationToken.None);
        Assert.True(expiredCount >= 1);

        await using (var db = fixture.OpenDb())
        {
            var offtake = await db.OfftakeCommitments.AsNoTracking().SingleAsync(o => o.OfftakeId == body.OfftakeId);
            Assert.Equal("Cancelled", offtake.Status);

            var pay = await db.PaymentRequests.AsNoTracking().SingleAsync(p => p.PaymentRequestId == body.Payment!.PaymentRequestId);
            Assert.Equal("Expired", pay.Status);

            var cap = await db.VBatchCommitmentCaps.AsNoTracking().SingleAsync(v => v.BatchId == batchId);
            Assert.Equal(0m, cap.OfftakeKg);
            Assert.Equal(24m, cap.RemainingKg); // Trần 24kg được giải phóng lại
        }
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Admin;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database"), Collection("KycDatabase")]
public class DashboardDatabaseTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private static int _offset;
    private sealed record Scenario(long Admin, long Owner, long Farm, long Batch, string Code, DateTimeOffset Now);
    private sealed class Clock(DateTimeOffset now) : TimeProvider { public override DateTimeOffset GetUtcNow() => now; }
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action) { await using var scope = fixture.Factory.Services.CreateAsyncScope(); return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>()); }
    private Task<Scenario> Setup() => Db(async db =>
    {
        var now = new DateTimeOffset(2040, 1, 1, 12, 0, 0, TimeSpan.FromHours(7)).AddDays(Interlocked.Add(ref _offset, 10));
        AppUser User(string role) { var u = new AppUser { Email = $"dash-{Guid.NewGuid():N}@test.local", FullName = "Dashboard Test", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now }; u.AppUserRoles.Add(new AppUserRole { RoleCode = role, GrantedAt = now }); return u; }
        var admin = User(Roles.PlatformAdmin); var owner = User(Roles.OperatorMember); var investor = User(Roles.Investor);
        investor.Investor = new Investor { InvestorKind = "Individual", VerificationStatus = "Unverified", CreatedAt = now };
        var farm = new Infrastructure.Persistence.Entities.Operator { LegalName = "Dashboard Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved", CreatedAt = now, UpdatedAt = now };
        owner.OperatorMember = new OperatorMember { Operator = farm, MemberRole = "Owner", JoinedAt = now, CreatedAt = now };
        db.AppUsers.AddRange(admin, owner, investor);
        var batch = new Batch { BatchCode = "D" + Guid.NewGuid().ToString("N")[..15], Title = "Dashboard Batch", Operator = farm, CrabType = "FatteningMudCrab", Status = "InProduction", SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 1000, MaxCapital = 10000, MinContribution = 10, OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakeDepositPct = 10, CreatedAt = now, UpdatedAt = now };
        var midnight = new DateTimeOffset(now.Date, now.Offset);
        foreach (var (status, amount, at) in new[] { ("Confirmed", 20000001m, midnight.AddMinutes(30).ToOffset(TimeSpan.FromHours(-3))), ("Confirmed", 30000000m, midnight.AddHours(1)), ("Reserved", 700m, now), ("Refunded", 900m, now), ("Confirmed", 999m, midnight.AddDays(1)) })
            batch.Contributions.Add(new Contribution { Investor = investor.Investor, Amount = amount, Status = status, ConfirmedAt = status == "Reserved" ? null : at, ReservedAt = at.AddMinutes(-5), ExpiresAt = at.AddHours(1), CreatedAt = at.AddMinutes(-5), UpdatedAt = at });
        db.Batches.Add(batch);
        db.ProductionLogs.Add(new ProductionLog { Batch = batch, LogDate = DateOnly.FromDateTime(now.Date), Ph = 7.5m, WaterTempC = 28, SalinityPpt = 15, FeedKg = 2, Source = "Manual", PlausibilityFlag = "Ok", ReceivedAt = now.AddMinutes(-1), CreatedAt = now });
        var slot = new PhysicalSlot { Operator = farm, SlotCode = "0001", Status = "Occupied", CreatedAt = now, UpdatedAt = now };
        var allocation = new SlotAllocation { Batch = batch, Slot = slot, AllocatedAt = now, CreatedAt = now };
        db.CrabItems.Add(new CrabItem { Batch = batch, SlotAllocation = allocation, ItemUuid = Guid.NewGuid(), Status = "Growing", StockedAt = now, CreatedAt = now, UpdatedAt = now });
        db.CaptureRequests.Add(new CaptureRequest { Batch = batch, Slot = slot, RequestedAt = now.AddMinutes(-10), DueAt = now.AddHours(1), Status = "Open", CreatedAt = now });
        db.Alerts.Add(new Alert { Batch = batch, AlertType = "WaterQuality", Severity = "High", Message = "Dashboard alert", Status = "Escalated", RaisedAt = now.AddHours(-2), AckDeadline = now.AddHours(-1), EscalatedAt = now, CreatedAt = now, UpdatedAt = now });
        var account = new BatchAccount { Batch = batch, ProviderName = "TEST", ProviderAccountNo = Guid.NewGuid().ToString("N"), Status = "Open", CreatedAt = now, UpdatedAt = now };
        db.PaymentInstructions.AddRange(new PaymentInstruction { BatchAccount = account, InstructionType = "Payout", Amount = 25000001, Status = "Succeeded", CompletedAt = now, CreatedAt = now.AddDays(-3), UpdatedAt = now },
            new PaymentInstruction { BatchAccount = account, InstructionType = "Payout", Amount = 30, Status = "Created", CreatedAt = now, UpdatedAt = now },
            new PaymentInstruction { BatchAccount = account, InstructionType = "Refund", Amount = 80, Status = "Succeeded", CompletedAt = now, CreatedAt = now, UpdatedAt = now });
        db.SalesOrders.AddRange(new SalesOrder { Batch = batch, Customer = investor, OrderNo = "OD" + Guid.NewGuid().ToString("N")[..16], OrderType = "Retail", Status = "Completed", TotalAmount = 10000001, RecipientName = "Private Customer", RecipientPhone = "0900000000", ShippingAddress = "PRIVATE", PlacedAt = now.AddDays(-3), CompletedAt = now, CreatedAt = now.AddDays(-3), UpdatedAt = now },
            new SalesOrder { Batch = batch, Customer = investor, OrderNo = "OD" + Guid.NewGuid().ToString("N")[..16], OrderType = "Retail", Status = "Paid", TotalAmount = 50, RecipientName = "Private Customer", RecipientPhone = "0900000000", ShippingAddress = "PRIVATE", PlacedAt = now, PaidAt = now, CreatedAt = now, UpdatedAt = now });
        await db.SaveChangesAsync(); return new Scenario(admin.UserId, owner.UserId, farm.OperatorId, batch.BatchId, batch.BatchCode, now);
    });
    private async Task<HttpResponseMessage> Get(Scenario s, string path, string role = Roles.PlatformAdmin, long? user = null, long? farm = null)
    {
        using var app = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(new Clock(s.Now))));
        using var client = app.CreateClient(); client.DefaultRequestHeaders.Add("X-Test-User", (user ?? s.Admin).ToString()); client.DefaultRequestHeaders.Add("X-Test-Role", role);
        if (farm is not null) client.DefaultRequestHeaders.Add("X-Test-Operator", farm.ToString());
        return await client.GetAsync(path);
    }
    private static string Period(Scenario s) => $"from={s.Now:yyyy-MM-dd}&to={s.Now:yyyy-MM-dd}";
    [Fact]
    public async Task Admin_totals_match_database_sources_and_vietnam_boundaries_without_writing_audit()
    {
        var s = await Setup(); var before = await Db(db => db.AuditLogs.CountAsync());
        var response = await Get(s, "/api/admin/dashboard?" + Period(s)); response.EnsureSuccessStatusCode();
        var data = (await response.Content.ReadFromJsonAsync<AdminDashboardResponse>())!;
        Assert.Equal(50000001, data.ConfirmedCapital); Assert.Equal(2, data.ConfirmedContributions); Assert.Equal(50000001, Assert.Single(data.CapitalByDay).Amount);
        Assert.Equal(10000001, data.CompletedOrderRevenue); Assert.Equal(25000001, data.SucceededPayoutAmount); Assert.Equal(30, Assert.Single(data.PayoutsByStatus).Amount);
        Assert.Equal(await Db(db => db.AppUsers.CountAsync()), data.TotalUsers); Assert.Equal(await Db(db => db.Batches.CountAsync()), data.BatchesByStatus.Sum(b => b.Count));
        Assert.Equal(await Db(db => db.Alerts.CountAsync(a => a.Status == "Escalated")), data.EscalatedAlerts); Assert.Equal(before, await Db(db => db.AuditLogs.CountAsync()));
        Assert.True(response.Headers.CacheControl!.NoStore); Assert.DoesNotContain("PRIVATE", await response.Content.ReadAsStringAsync());
    }
    [Fact]
    public async Task Farm_dashboard_is_scoped_and_rejects_foreign_codes_and_forged_membership()
    {
        var s = await Setup(); var foreign = await Setup();
        var response = await Get(s, "/api/operators/me/dashboard?" + Period(s), Roles.OperatorMember, s.Owner, s.Farm); response.EnsureSuccessStatusCode();
        var data = (await response.Content.ReadFromJsonAsync<OperatorDashboardResponse>())!;
        Assert.Equal(s.Code, Assert.Single(data.Batches).BatchCode); Assert.Equal(1, data.AliveCount); Assert.Equal(1, data.OpenAlerts); Assert.Equal(1, data.PendingCaptureRequests); Assert.Equal(0, data.LogsDueToday); Assert.Equal(1, data.OrdersToPack);
        Assert.Equal(7.5m, Assert.Single(data.EnvironmentByDay).Ph); Assert.Equal(s.Code, Assert.Single(data.RecentLogs).BatchCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Get(s, $"/api/operators/me/dashboard?batchCode={foreign.Code}", Roles.OperatorMember, s.Owner, s.Farm)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Get(s, "/api/operators/me/dashboard", Roles.OperatorMember, s.Owner, foreign.Farm)).StatusCode);
    }
    [Fact]
    public async Task Revoked_database_admin_and_owner_roles_are_denied_even_with_old_claims()
    {
        var s = await Setup(); await Db(async db => { db.AppUserRoles.RemoveRange(await db.AppUserRoles.Where(r => r.UserId == s.Admin || r.UserId == s.Owner).ToListAsync()); await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await Get(s, "/api/admin/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Get(s, "/api/admin/reports/capital.csv")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Get(s, "/api/operators/me/dashboard", Roles.OperatorMember, s.Owner, s.Farm)).StatusCode);
    }
    [Fact]
    public async Task Csv_reports_use_exact_same_totals_and_are_excel_utf8_no_store()
    {
        var s = await Setup();
        foreach (var name in new[] { "capital", "batches", "orders", "payouts" })
        {
            var response = await Get(s, $"/api/admin/reports/{name}.csv?{Period(s)}"); response.EnsureSuccessStatusCode();
            var bytes = await response.Content.ReadAsByteArrayAsync(); Assert.True(bytes.AsSpan().StartsWith(Encoding.UTF8.GetPreamble()));
            Assert.Equal("text/csv", response.Content.Headers.ContentType!.MediaType); Assert.True(response.Headers.CacheControl!.NoStore);
            if (name == "capital") Assert.Contains("50000001", Encoding.UTF8.GetString(bytes));
        }
        Assert.Equal(HttpStatusCode.NotFound, (await Get(s, "/api/admin/reports/unknown.csv")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Get(s, "/api/admin/dashboard?from=2040-12-31&to=2040-01-01")).StatusCode);
    }
}

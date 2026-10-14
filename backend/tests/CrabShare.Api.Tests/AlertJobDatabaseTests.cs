using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CrabShare.Api.Tests;

public partial class AlertDatabaseTests
{
    [Fact]
    public async Task Funding_ready_tranche_overdue_before_stocking_alerts_but_unresolved_schedule_does_not()
    {
        var ready=await SetupFarm(); var waiting=await SetupFarm(); var now=TodayAt(12);
        await Db(async db=> {
            var b=await db.Batches.SingleAsync(b=>b.BatchId==ready.BatchId); b.Status="Funding"; b.CapitalClosedAt=now.AddDays(-2);
            (await db.Batches.SingleAsync(b=>b.BatchId==waiting.BatchId)).Status="Funding";
            db.DisbursementTranches.Add(new DisbursementTranche { BatchId=ready.BatchId,TrancheNo=1,PlannedAmount=1000000,
                PlannedDate=DateOnly.FromDateTime(now.DateTime).AddDays(-1),AnchorCode="FundingReady",OffsetDays=0,UnlockCondition="Đủ vốn và hợp đồng",Status="Planned" });
            db.DisbursementTranches.Add(new DisbursementTranche { BatchId=waiting.BatchId,TrancheNo=1,PlannedAmount=1000000,
                AnchorCode="FundingReady",OffsetDays=0,UnlockCondition="Đủ vốn và hợp đồng",Status="Planned" });
            await db.SaveChangesAsync(); return true;
        });
        await RunJob(now); await RunJob(now);
        Assert.Equal(1,await Db(db=>db.Alerts.CountAsync(a=>a.BatchId==ready.BatchId && a.AlertType=="MilestoneDelay")));
        Assert.False(await Db(db=>db.Alerts.AnyAsync(a=>a.BatchId==waiting.BatchId && a.AlertType=="MilestoneDelay")));
    }
    private sealed class FixedClock(DateTimeOffset value) : TimeProvider { public override DateTimeOffset GetUtcNow() => value; }
    private static DateTimeOffset TodayAt(int hour) => new(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)).Date.AddHours(hour), TimeSpan.FromHours(7));
    private async Task<int> RunJob(DateTimeOffset now)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var clock = new FixedClock(now);
        var service = new AlertService(db, scope.ServiceProvider.GetRequiredService<ICurrentUser>(), clock);
        return await new AlertJob(service, db, Options.Create(new AlertJobOptions()), clock).RunAsync();
    }
    private async Task<long> Admin() => await Db(async db =>
    {
        var user = new AppUser { Email = $"alert-admin-{Guid.NewGuid():N}@test.local", FullName = "Alert Admin", PasswordHash = "test", Status = "Active" };
        user.AppUserRoles.Add(new AppUserRole { RoleCode = Roles.PlatformAdmin, GrantedAt = DateTimeOffset.UtcNow });
        db.AppUsers.Add(user); await db.SaveChangesAsync(); return user.UserId;
    });

    [Fact]
    public async Task Job_escalates_only_overdue_open_alerts_and_is_idempotent()
    {
        var farm = await SetupFarm(); var overdue = await Raise(farm); var future = await Raise(farm, type: AlertType.LowStock);
        var done = await Raise(farm, type: AlertType.Mortality); var now = DateTimeOffset.UtcNow;
        await Db(async db => {
            (await db.Alerts.SingleAsync(a => a.AlertId == overdue.Id)).AckDeadline = now.AddMinutes(-1);
            var acknowledged = await db.Alerts.SingleAsync(a => a.AlertId == done.Id); acknowledged.Status = "Acknowledged"; acknowledged.AckDeadline = now.AddMinutes(-1);
            db.ProductionLogs.Add(new ProductionLog { BatchId = farm.BatchId, LogDate = DateOnly.FromDateTime(now.ToOffset(TimeSpan.FromHours(7)).DateTime), Source = "Manual", PlausibilityFlag = "Ok", ReceivedAt = now });
            await db.SaveChangesAsync(); return true;
        });
        await RunJob(now); await RunJob(now);
        await Db(async db => {
            var row = await db.Alerts.SingleAsync(a => a.AlertId == overdue.Id); Assert.Equal("Escalated", row.Status); Assert.Equal(now.ToUnixTimeMilliseconds(), row.EscalatedAt!.Value.ToUnixTimeMilliseconds());
            Assert.Equal("Open", (await db.Alerts.SingleAsync(a => a.AlertId == future.Id)).Status);
            Assert.Equal("Acknowledged", (await db.Alerts.SingleAsync(a => a.AlertId == done.Id)).Status);
            Assert.Equal(1, await db.AuditLogs.CountAsync(a => a.EntityType == "Alert" && a.EntityId == overdue.Id && a.ActionType == "EscalateAlert")); return true;
        });
        await AssertChain();
    }

    [Fact]
    public async Task Data_silence_uses_Vietnam_day_and_cutoff_and_does_not_repeat_after_resolution_today()
    {
        var farm = await SetupFarm(); var logged = await SetupFarm(); var inactive = await SetupFarm();
        var evening = TodayAt(19); var today = DateOnly.FromDateTime(evening.DateTime);
        await Db(async db => {
            db.ProductionLogs.Add(new ProductionLog { BatchId = logged.BatchId, LogDate = today, Source = "Manual", PlausibilityFlag = "Ok", ReceivedAt = evening });
            (await db.Batches.SingleAsync(b => b.BatchId == inactive.BatchId)).Status = "Closed";
            await db.SaveChangesAsync(); return true;
        });
        await RunJob(TodayAt(17)); Assert.False(await Db(db => db.Alerts.AnyAsync(a => a.BatchId == farm.BatchId && a.AlertType == "DataSilence")));
        await RunJob(evening); await RunJob(evening.AddMinutes(15));
        var alert = await Db(db => db.Alerts.SingleAsync(a => a.BatchId == farm.BatchId && a.AlertType == "DataSilence"));
        Assert.Equal("Open", alert.Status);
        Assert.False(await Db(db => db.Alerts.AnyAsync(a => (a.BatchId == logged.BatchId || a.BatchId == inactive.BatchId) && a.AlertType == "DataSilence")));
        var adminId = await Admin(); using var admin = Client(adminId, Roles.PlatformAdmin);
        (await admin.PostAsJsonAsync($"/api/admin/alerts/{alert.AlertId}/resolve", new { note = "Handled today" })).EnsureSuccessStatusCode();
        await RunJob(evening.AddMinutes(30));
        Assert.Equal(1, await Db(db => db.Alerts.CountAsync(a => a.BatchId == farm.BatchId && a.AlertType == "DataSilence")));
    }

    [Fact]
    public async Task Milestone_delay_ignores_future_requested_and_closed_batches_and_merges_overdue_milestones()
    {
        var farm = await SetupFarm(); var requested = await SetupFarm(); var closed = await SetupFarm(); var now = TodayAt(10); var today = DateOnly.FromDateTime(now.DateTime);
        await Db(async db => {
            foreach (var item in new[] { (farm.BatchId, 1, "Planned", -1), (farm.BatchId, 2, "Planned", -2), (farm.BatchId, 3, "Planned", 1), (requested.BatchId, 1, "Requested", -1), (closed.BatchId, 1, "Planned", -1) })
                db.DisbursementTranches.Add(new DisbursementTranche { BatchId = item.BatchId, TrancheNo = (byte)item.Item2, PlannedAmount = 10, PlannedDate = today.AddDays(item.Item4), UnlockCondition = "Test", Status = item.Item3 });
            (await db.Batches.SingleAsync(b => b.BatchId == closed.BatchId)).Status = "Closed";
            await db.SaveChangesAsync(); return true;
        });
        await RunJob(now); await RunJob(now.AddMinutes(15));
        Assert.Equal(1, await Db(db => db.Alerts.CountAsync(a => a.BatchId == farm.BatchId && a.AlertType == "MilestoneDelay")));
        Assert.False(await Db(db => db.Alerts.AnyAsync(a => (a.BatchId == requested.BatchId || a.BatchId == closed.BatchId) && a.AlertType == "MilestoneDelay")));
        await AssertChain();
    }

    [Fact]
    public async Task Two_concurrent_job_instances_do_not_duplicate_escalation_or_daily_alerts()
    {
        var farm = await SetupFarm(); var alert = await Raise(farm); var now = TodayAt(19);
        await Db(async db => { (await db.Alerts.SingleAsync(a => a.AlertId == alert.Id)).AckDeadline = now.AddMinutes(-1); await db.SaveChangesAsync(); return true; });
        await Task.WhenAll(RunJob(now), RunJob(now));
        Assert.Equal(1, await Db(db => db.Alerts.CountAsync(a => a.BatchId == farm.BatchId && a.AlertType == "DataSilence")));
        Assert.Equal(1, await Db(db => db.AuditLogs.CountAsync(a => a.EntityType == "Alert" && a.EntityId == alert.Id && a.ActionType == "EscalateAlert")));
        await AssertChain();
    }

    [Fact]
    public async Task Admin_filters_pages_and_resolves_without_overwriting_operator_note()
    {
        var farm = await SetupFarm(); var alert = await Raise(farm); var now = DateTimeOffset.UtcNow;
        await Db(async db => { var a = await db.Alerts.SingleAsync(a => a.AlertId == alert.Id); a.Status = "Escalated"; a.EscalatedAt = now; a.ResponseNote = "Farm response"; await db.SaveChangesAsync(); return true; });
        using var client = Client(await Admin(), Roles.PlatformAdmin);
        var page = (await client.GetFromJsonAsync<PagedResult<AlertResponse>>("/api/admin/alerts?q=" + farm.Code + "&severity=High&pageSize=1"))!;
        Assert.Equal(1, page.Total); Assert.Single(page.Items); Assert.Equal("Escalated", page.Items[0].Status);
        var response = await client.PostAsJsonAsync($"/api/admin/alerts/{alert.Id}/resolve", new { note = "  Admin resolved  " }); response.EnsureSuccessStatusCode();
        var resolved = (await response.Content.ReadFromJsonAsync<AlertResponse>())!;
        Assert.Equal("Resolved", resolved.Status); Assert.Equal("Farm response", resolved.ResponseNote); Assert.Equal("Admin resolved", resolved.ResolutionNote);
        Assert.Empty((await client.GetFromJsonAsync<PagedResult<AlertResponse>>("/api/admin/alerts?q=" + farm.Code))!.Items);
        Assert.Equal("Admin resolved", (await client.GetFromJsonAsync<PagedResult<AlertResponse>>("/api/admin/alerts?status=Resolved&q=" + farm.Code))!.Items.Single().ResolutionNote);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/admin/alerts/{alert.Id}/resolve", new { note = "Again" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Client(farm.UserId).PostAsJsonAsync($"/api/alerts/{alert.Id}/acknowledge", new { responseNote = "After resolution" })).StatusCode);
        await AssertChain();
    }

    [Fact]
    public async Task Revoked_admin_role_is_rechecked_from_database()
    {
        var id = await Admin();
        await Db(async db => { db.AppUserRoles.RemoveRange(await db.AppUserRoles.Where(r => r.UserId == id).ToListAsync()); await db.SaveChangesAsync(); return true; });
        Assert.Equal(HttpStatusCode.Forbidden, (await Client(id, Roles.PlatformAdmin).GetAsync("/api/admin/alerts")).StatusCode);
    }
}

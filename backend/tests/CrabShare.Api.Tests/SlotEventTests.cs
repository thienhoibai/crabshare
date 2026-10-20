using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Collection("KycDatabase"), Trait("Category", "Database")]
public partial class SlotEventTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Farm(long UserId, long OperatorId, long BatchId, string Code, long SlotId, string SlotCode, long CrabId, DateTimeOffset StockedAt);
    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private async Task<T> Db<T>(Func<AppDbContext, Task<T>> action)
    {
        await using var scope = fixture.Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }
    private static void Authenticate(HttpClient client, long id, string role = Roles.OperatorMember, long? claimedOperator = null)
    {
        client.DefaultRequestHeaders.Add("X-Test-User", id.ToString(CultureInfo.InvariantCulture));
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        if (claimedOperator is not null) client.DefaultRequestHeaders.Add("X-Test-Operator", claimedOperator.Value.ToString(CultureInfo.InvariantCulture));
    }
    private HttpClient Client(long id, string role = Roles.OperatorMember, long? claimedOperator = null)
    {
        var client = fixture.Factory.CreateClient(); Authenticate(client, id, role, claimedOperator); return client;
    }
    private static AppUser User(string role, DateTimeOffset now)
    {
        var user = new AppUser { Email = $"slot-event-{Guid.NewGuid():N}@test.local", FullName = "Slot Event User", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now };
        user.AppUserRoles.Add(new AppUserRole { RoleCode = role, GrantedAt = now, CreatedAt = now }); return user;
    }
    private Task<Farm> Setup(string status = "InProduction", DateTimeOffset? stockedAt = null, string memberRole = "Owner") => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow; var stocked = stockedAt ?? now.AddDays(-3);
        var owner = User(Roles.OperatorMember, now);
        var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Slot Event Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved", CreatedAt = now, UpdatedAt = now };
        op.OperatorMembers.Add(new OperatorMember { User = owner, MemberRole = memberRole, JoinedAt = now, CreatedAt = now });
        var batch = new Batch { BatchCode = "SE-" + Guid.NewGuid().ToString("N")[..12], Operator = op, CrabType = "FatteningMudCrab", Title = "Slot Event Test", Status = status, SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300, MinContribution = 10, OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, StockedAt = stocked, CreatedAt = now, UpdatedAt = now };
        var slot = new PhysicalSlot { Operator = op, SlotCode = "0001", Status = "Occupied", CreatedAt = stocked, UpdatedAt = stocked };
        var allocation = new SlotAllocation { Batch = batch, Slot = slot, AllocatedAt = stocked, CreatedAt = stocked };
        var crab = new CrabItem { Batch = batch, SlotAllocation = allocation, ItemUuid = Guid.NewGuid(), Status = "Growing", StockedAt = stocked, CreatedAt = stocked, UpdatedAt = stocked };
        db.CrabItems.Add(crab); await db.SaveChangesAsync();
        return new Farm(owner.UserId, op.OperatorId, batch.BatchId, batch.BatchCode, slot.SlotId, slot.SlotCode, crab.CrabItemId, stocked);
    });
    private static string Path(Farm farm) => $"/api/batches/{farm.Code}/slot-events";
    private static string PolicyPath(Farm farm) => $"/api/batches/{farm.Code}/slot-event-policy";
    private static string ContextPath(Farm farm, string? slot = null) => $"/api/batches/{farm.Code}/slot-event-context?slotCode={slot ?? farm.SlotCode}";
    private static Dictionary<string, object?> Input(Farm farm, string type = "Molted", DateTimeOffset? occurredAt = null) => new()
    {
        ["requestId"] = Guid.NewGuid(), ["slotCode"] = farm.SlotCode, ["eventType"] = type,
        ["occurredAt"] = occurredAt ?? DateTimeOffset.UtcNow.AddMinutes(-1), ["quantity"] = 1, ["note"] = "Ghi nhận tại hộp",
    };

    [Fact]
    public async Task Molted_records_event_without_releasing_or_replacing_the_growing_crab()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        using var response = await client.PostAsJsonAsync(Path(farm), Input(farm));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Molted", result.GetProperty("eventType").GetString());
        Assert.Equal(farm.CrabId, result.GetProperty("crabItemId").GetInt64());
        Assert.Equal(farm.UserId, result.GetProperty("actorId").GetInt64());
        Assert.Equal(1, result.GetProperty("aliveCount").GetInt32());
        Assert.Equal("Growing", await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => c.Status).SingleAsync()));
        Assert.Equal("Occupied", await Db(db => db.PhysicalSlots.Where(s => s.SlotId == farm.SlotId).Select(s => s.Status).SingleAsync()));
        Assert.Null(await Db(db => db.SlotAllocations.Where(a => a.SlotId == farm.SlotId).Select(a => a.ReleasedAt).SingleAsync()));
    }
}

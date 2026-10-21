using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests;

[Collection("KycDatabase"), Trait("Category", "Database")]
public partial class HarvestTests(KycDatabaseFixture fixture) : IClassFixture<KycDatabaseFixture>
{
    private sealed record Farm(long UserId, long OperatorId, long BatchId, string Code, long SlotId, string SlotCode, long CrabId, DateTimeOffset StockedAt);
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
        var user = new AppUser { Email = $"harvest-{Guid.NewGuid():N}@test.local", FullName = "Harvest User", PasswordHash = "test", Status = "Active", CreatedAt = now, UpdatedAt = now };
        user.AppUserRoles.Add(new AppUserRole { RoleCode = role, GrantedAt = now, CreatedAt = now }); return user;
    }
    private Task<Farm> Setup(string status = "InProduction", DateTimeOffset? stockedAt = null, string memberRole = "Owner") => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow; var stocked = stockedAt ?? now.AddDays(-3);
        var owner = User(Roles.OperatorMember, now);
        var op = new Infrastructure.Persistence.Entities.Operator { LegalName = "Harvest Farm", TaxCode = Guid.NewGuid().ToString("N")[..14], BusinessRegNo = "TEST", FarmAddress = "Test", Status = "Approved", CreatedAt = now, UpdatedAt = now };
        op.OperatorMembers.Add(new OperatorMember { User = owner, MemberRole = memberRole, JoinedAt = now, CreatedAt = now });
        var batch = new Batch { BatchCode = "HV-" + Guid.NewGuid().ToString("N")[..12], Operator = op, CrabType = "FatteningMudCrab", Title = "Harvest Test", Status = status, SeedQuantity = 100, ExpectedOutputKg = 50, CycleDays = 90, RestockCutoffDays = 10, MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300, MinContribution = 10, OperatorSharePct = 5, FrozenStockCapMonths = 1, OfftakePreorderCapPct = 0, OfftakeDepositPct = 10, StockedAt = stocked, CreatedAt = now, UpdatedAt = now };
        var slot = new PhysicalSlot { Operator = op, SlotCode = "0001", Status = "Occupied", CreatedAt = stocked, UpdatedAt = stocked };
        var allocation = new SlotAllocation { Batch = batch, Slot = slot, AllocatedAt = stocked, CreatedAt = stocked };
        var crab = new CrabItem { Batch = batch, SlotAllocation = allocation, ItemUuid = Guid.NewGuid(), Status = "Growing", StockedAt = stocked, CreatedAt = stocked, UpdatedAt = stocked };
        db.CrabItems.Add(crab); await db.SaveChangesAsync();
        return new Farm(owner.UserId, op.OperatorId, batch.BatchId, batch.BatchCode, slot.SlotId, slot.SlotCode, crab.CrabItemId, stocked);
    });
    private static string StartPath(Farm farm) => $"/api/batches/{farm.Code}/harvests";
    private static object StartInput() => new { requestId = Guid.NewGuid(), name = "Morning", note = "Test" };
    private static Dictionary<string, object?> RecordInput(Farm farm, object? weight = null, string? shell = "HardShell") => new()
    {
        ["requestId"] = Guid.NewGuid(), ["slotCode"] = farm.SlotCode,
        ["expectedCrabItemId"] = farm.CrabId, ["weightG"] = weight ?? 250, ["shellCondition"] = shell,
    };
    private async Task<JsonElement> Start(HttpClient client, Farm farm, object? input = null)
    {
        using var response = await client.PostAsJsonAsync(StartPath(farm), input ?? StartInput());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    private static async Task<JsonElement> Record(HttpClient client, long harvestId, object input)
    {
        using var response = await client.PostAsJsonAsync($"/api/harvests/{harvestId}/crabs", input);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    [Fact]
    public async Task Start_then_record_preserves_crab_identity_and_releases_allocation()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        var before = await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => new { c.ItemUuid, c.SlotAllocationId }).SingleAsync());
        var started = await Start(client, farm);
        var result = await Record(client, started.GetProperty("id").GetInt64(), RecordInput(farm));
        Assert.Equal(farm.CrabId, result.GetProperty("crabItemId").GetInt64());
        Assert.Equal(before.ItemUuid, result.GetProperty("itemUuid").GetGuid());
        Assert.Equal("L3", result.GetProperty("gradeCode").GetString());
        Assert.Equal("Printed", result.GetProperty("tagStatus").GetString());
        Assert.Equal(0.250m, result.GetProperty("totalWeightKg").GetDecimal());
        var after = await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => new { c.ItemUuid, c.SlotAllocationId, c.Status, c.WeightG }).SingleAsync());
        Assert.Equal(before.ItemUuid, after.ItemUuid);
        Assert.Equal(before.SlotAllocationId, after.SlotAllocationId);
        Assert.Equal("InStock", after.Status);
        Assert.Equal((short)250, after.WeightG);
        Assert.Equal("Available", await Db(db => db.PhysicalSlots.Where(s => s.SlotId == farm.SlotId).Select(s => s.Status).SingleAsync()));
        Assert.NotNull(await Db(db => db.SlotAllocations.Where(a => a.SlotId == farm.SlotId).Select(a => a.ReleasedAt).SingleAsync()));
    }
}




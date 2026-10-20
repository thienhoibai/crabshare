using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

[Trait("Category", "Database")]
public class StockingTests(OperatorDatabaseFixture fixture) : IClassFixture<OperatorDatabaseFixture>
{
    private sealed record Farm(HttpClient Client, long OperatorId, long UserId, string Code, long BatchId);
    private static object Range(int from = 1, int to = 2, int width = 4) => new { range = new { from, to, width } };
    private static string Path(string code) => $"/api/batches/{code}/stocking";

    private async Task<(HttpClient Client, AuthResponse Auth)> User(string role = "Customer")
    {
        var client = fixture.Factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new
        { email = $"{Guid.NewGuid():N}@test.local", password = "Test-password-123", fullName = "VI07", role });
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth);
    }

    private async Task<Farm> Setup(int seed = 2)
    {
        var (client, auth) = await User();
        var created = await client.PostAsJsonAsync("/api/operators", new
        { legalName = "VI07", taxCode = Random.Shared.NextInt64(1000000000, 9999999999).ToString(), businessRegNo = "VI07", farmAddress = "Cà Mau" });
        created.EnsureSuccessStatusCode();
        var op = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operatorId").GetInt64();
        await using (var db = fixture.OpenDb())
            await db.Operators.Where(o => o.OperatorId == op).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "Approved").SetProperty(o => o.ApprovedSlotCapacity, 2000));
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = auth.User.Email, password = "Test-password-123" });
        login.EnsureSuccessStatusCode();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await login.Content.ReadFromJsonAsync<AuthResponse>())!.AccessToken);
        (await client.PostAsJsonAsync("/api/boxes/range", new { from = 1, to = seed, width = 4 })).EnsureSuccessStatusCode();
        var batch = await ReadyBatch(op, seed);
        return new(client, op, auth.User.UserId, batch.BatchCode, batch.BatchId);
    }

    // TH-07 and signing are upstream fixtures, not actions performed by the stocking endpoint.
    private async Task<Batch> ReadyBatch(long op, int seed = 2)
    {
        var (client, investor) = await User("Investor");
        client.Dispose();
        await using var db = fixture.OpenDb();
        var now = DateTimeOffset.UtcNow.AddMinutes(-5);
        var batch = new Batch
        {
            BatchCode = "VI07-" + Guid.NewGuid().ToString("N")[..14], OperatorId = op, Title = "Thả giống thử", CrabType = "SoftShellCrab",
            Status = "Funding", SeedQuantity = seed, ExpectedOutputKg = 10, CycleDays = 90, RestockCutoffDays = 10,
            MinViableCapital = 100, TargetCapital = 200, MaxCapital = 300, MinContribution = 10, OperatorSharePct = 7,
            FrozenStockCapMonths = 4, OfftakeDepositPct = 15, OfftakePreorderCapPct = 60,
            CapitalClosedAt = now, TotalConfirmedCapital = 200, FundingOpenAt = now.AddDays(-2), FundingDeadline = now,
            CreatedAt = now, UpdatedAt = now,
        };
        batch.Contributions.Add(new Contribution
        {
            InvestorId = investor.User.UserId, Amount = 200, Status = "Confirmed", ReservedAt = now.AddHours(-1), ExpiresAt = now,
            ConfirmedAt = now, CreatedAt = now, UpdatedAt = now,
            InvestmentContract = new InvestmentContract
            {
                ContractNo = "VI07-" + Guid.NewGuid().ToString("N")[..16], TemplateId = await db.ContractTemplates.Select(t => t.TemplateId).FirstAsync(),
                Status = "FullySigned", SigningMethod = "OfflineUpload", FullySignedAt = now, DraftHash = new string('a', 64), FinalHash = new string('b', 64),
                CreatedAt = now, UpdatedAt = now,
            },
        });
        db.Batches.Add(batch);
        await db.SaveChangesAsync();
        return batch;
    }

    private static async Task Error(HttpResponseMessage response, HttpStatusCode status, string? code = null)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == status, $"Expected {status}, got {response.StatusCode}: {body}");
        if (code is not null) Assert.Equal(code, JsonDocument.Parse(body).RootElement.GetProperty("code").GetString());
    }

    private async Task Empty(Farm farm)
    {
        await using var db = fixture.OpenDb();
        Assert.False(await db.CrabItems.AnyAsync(c => c.BatchId == farm.BatchId));
        Assert.False(await db.SlotAllocations.AnyAsync(c => c.BatchId == farm.BatchId));
        Assert.False(await db.SlotEvents.AnyAsync(c => c.BatchId == farm.BatchId));
        Assert.False(await db.AuditLogs.AnyAsync(a => a.EntityType == "batch" && a.EntityId == farm.BatchId && (a.ActionType == "stocked" || a.ActionType == "start_production")));
        var batch = await db.Batches.SingleAsync(b => b.BatchId == farm.BatchId);
        Assert.Equal("Funding", batch.Status);
        Assert.Null(batch.StockedAt);
    }

    [Fact]
    public async Task Stocking_creates_each_crab_allocation_events_and_audited_state_transitions_once()
    {
        var farm = await Setup();
        var detail = await farm.Client.GetFromJsonAsync<JsonElement>($"/api/operators/me/batches/{farm.Code}");
        Assert.True(detail.GetProperty("canStock").GetBoolean());
        var response = await farm.Client.PostAsJsonAsync(Path(farm.Code), Range());
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(farm.Code, result.GetProperty("batchCode").GetString());
        Assert.Equal(2, result.GetProperty("createdCrabs").GetInt32());
        Assert.Equal("InProduction", result.GetProperty("status").GetString());
        await using var db = fixture.OpenDb();
        var crabs = await db.CrabItems.Where(c => c.BatchId == farm.BatchId).Include(c => c.SlotAllocation).Include(c => c.CrabItemEvents).ToListAsync();
        Assert.Equal(2, crabs.Count);
        Assert.Equal(2, crabs.Select(c => c.ItemUuid).Distinct().Count());
        Assert.All(crabs, crab =>
        {
            Assert.Equal("Growing", crab.Status);
            Assert.Null(crab.SlotAllocation.ReleasedAt);
            var evt = Assert.Single(crab.CrabItemEvents);
            Assert.Equal("Stocked", evt.EventType);
            Assert.Equal(farm.UserId, evt.ActorId);
        });
        Assert.Equal(2, await db.PhysicalSlots.CountAsync(s => s.OperatorId == farm.OperatorId && s.Status == "Occupied"));
        var events = await db.SlotEvents.Where(e => e.BatchId == farm.BatchId).ToListAsync();
        Assert.Equal(2, events.Count);
        Assert.All(events, e => { Assert.Equal("Stocked", e.EventType); Assert.Equal(1, e.Quantity); Assert.Equal("Manual", e.Source); });
        var batch = await db.Batches.SingleAsync(b => b.BatchId == farm.BatchId);
        Assert.Equal("InProduction", batch.Status);
        Assert.NotNull(batch.StockedAt);
        var history = await db.AuditLogs.Where(a => a.EntityType == "batch" && a.EntityId == farm.BatchId).OrderBy(a => a.AuditId).ToListAsync();
        Assert.Equal(new[] { "stocked", "start_production" }, history.Select(a => a.ActionType));
        Assert.All(history, a => Assert.Equal(farm.UserId, a.ActorUserId));
        await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range()), HttpStatusCode.Conflict, "stocking.already_stocked");
        Assert.Equal(2, await db.CrabItems.CountAsync(c => c.BatchId == farm.BatchId));
        Assert.Equal(2, await db.SlotAllocations.CountAsync(c => c.BatchId == farm.BatchId));
        Assert.Equal(2, await db.CrabItemEvents.CountAsync(c => c.CrabItem.BatchId == farm.BatchId));
        Assert.False((await farm.Client.GetFromJsonAsync<JsonElement>($"/api/operators/me/batches/{farm.Code}")).GetProperty("canStock").GetBoolean());
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{"slotCodes":[]}""")]
    [InlineData("""{"slotCodes":["0001","0001"]}""")]
    [InlineData("""{"slotCodes":["A","a"]}""")]
    [InlineData("""{"slotCodes":[null]}""")]
    [InlineData("""{"slotCodes":[" "]}""")]
    [InlineData("""{"slotCodes":["0001"],"range":{"from":1,"to":2}}""")]
    [InlineData("""{"range":{"from":2,"to":1}}""")]
    [InlineData("""{"range":{"from":0,"to":2}}""")]
    [InlineData("""{"range":{"from":1,"to":2,"width":31}}""")]
    public async Task Invalid_selection_returns_400_without_writes(string json)
    {
        var farm = await Setup();
        await Error(await farm.Client.PostAsync(Path(farm.Code), new StringContent(json, System.Text.Encoding.UTF8, "application/json")), HttpStatusCode.BadRequest);
        await Empty(farm);
    }

    [Fact]
    public async Task Wrong_count_and_huge_range_do_not_allocate_or_expand_unbounded_input()
    {
        var farm = await Setup();
        await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range(to: 1)), HttpStatusCode.UnprocessableEntity, "stocking.quantity_mismatch");
        await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range(to: int.MaxValue)), HttpStatusCode.UnprocessableEntity, "stocking.quantity_mismatch");
        await Empty(farm);
    }

    [Theory]
    [InlineData("Maintenance")] [InlineData("Occupied")] [InlineData("Missing")] [InlineData("OtherFarm")]
    [InlineData("ActiveAllocation")] [InlineData("GrowingInReleasedAllocation")]
    public async Task Unavailable_slot_rolls_back_entire_selection(string kind)
    {
        var farm = await Setup();
        await using (var db = fixture.OpenDb())
        {
            var slot = await db.PhysicalSlots.SingleAsync(s => s.OperatorId == farm.OperatorId && s.SlotCode == "0002");
            if (kind == "Missing") db.PhysicalSlots.Remove(slot);
            else if (kind == "OtherFarm")
            {
                var other = await Setup();
                slot.OperatorId = other.OperatorId;
                slot.SlotCode = "foreign-only";
            }
            else if (kind is "ActiveAllocation" or "GrowingInReleasedAllocation")
            {
                var old = await ReadyBatch(farm.OperatorId);
                var allocation = new SlotAllocation { BatchId = old.BatchId, SlotId = slot.SlotId, AllocatedAt = DateTimeOffset.UtcNow };
                if (kind == "GrowingInReleasedAllocation")
                {
                    allocation.ReleasedAt = DateTimeOffset.UtcNow;
                    db.CrabItems.Add(new CrabItem { BatchId = old.BatchId, SlotAllocation = allocation, Status = "Growing", StockedAt = DateTimeOffset.UtcNow });
                }
                else db.SlotAllocations.Add(allocation);
            }
            else slot.Status = kind;
            await db.SaveChangesAsync();
        }
        await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range()), HttpStatusCode.UnprocessableEntity);
        await Empty(farm);
        await using var check = fixture.OpenDb();
        Assert.Equal("Available", await check.PhysicalSlots.Where(s => s.OperatorId == farm.OperatorId && s.SlotCode == "0001").Select(s => s.Status).SingleAsync());
    }

    [Fact]
    public async Task Released_box_can_be_reused_without_losing_allocation_history()
    {
        var farm = await Setup();
        var old = await ReadyBatch(farm.OperatorId);
        await using (var db = fixture.OpenDb())
        {
            var slots = await db.PhysicalSlots.Where(s => s.OperatorId == farm.OperatorId).ToListAsync();
            foreach (var slot in slots)
                db.CrabItems.Add(new CrabItem { BatchId = old.BatchId, SlotAllocation = new SlotAllocation { BatchId = old.BatchId, Slot = slot, AllocatedAt = DateTimeOffset.UtcNow.AddDays(-2), ReleasedAt = DateTimeOffset.UtcNow.AddDays(-1) }, Status = "Dead", StockedAt = DateTimeOffset.UtcNow.AddDays(-2) });
            await db.SaveChangesAsync();
        }
        (await farm.Client.PostAsJsonAsync(Path(farm.Code), new { slotCodes = new[] { "0001", "0002" } })).EnsureSuccessStatusCode();
        await using var check = fixture.OpenDb();
        var tracked = await check.SlotAllocations.Include(a => a.Slot).Where(a => a.Slot.OperatorId == farm.OperatorId).ToListAsync();
        Assert.Equal(4, tracked.Count);
        Assert.Equal(2, tracked.Count(a => a.ReleasedAt is null));
        Assert.All(tracked, a => Assert.NotEqual(0, a.SlotId));
    }

    [Fact]
    public async Task Simultaneous_batches_cannot_claim_the_same_slots()
    {
        var farm = await Setup();
        var other = await ReadyBatch(farm.OperatorId);
        var results = await Task.WhenAll(farm.Client.PostAsJsonAsync(Path(farm.Code), Range()), farm.Client.PostAsJsonAsync(Path(other.BatchCode), Range()));
        Assert.Single(results, r => r.IsSuccessStatusCode);
        Assert.Single(results, r => r.StatusCode == HttpStatusCode.UnprocessableEntity);
        await using var db = fixture.OpenDb();
        Assert.Equal(2, await db.SlotAllocations.CountAsync(a => a.Slot.OperatorId == farm.OperatorId && a.ReleasedAt == null));
        Assert.Equal(2, await db.CrabItems.CountAsync(c => c.Batch.OperatorId == farm.OperatorId));
        Assert.Equal(2, await db.SlotEvents.CountAsync(e => e.Batch.OperatorId == farm.OperatorId));
        Assert.Equal(2, await db.CrabItemEvents.CountAsync(e => e.CrabItem.Batch.OperatorId == farm.OperatorId));
    }

    [Fact]
    public async Task Duplicate_simultaneous_requests_create_only_one_set()
    {
        var farm = await Setup();
        var results = await Task.WhenAll(farm.Client.PostAsJsonAsync(Path(farm.Code), Range()), farm.Client.PostAsJsonAsync(Path(farm.Code), Range()));
        Assert.Single(results, r => r.IsSuccessStatusCode);
        await Error(Assert.Single(results, r => !r.IsSuccessStatusCode), HttpStatusCode.Conflict, "stocking.already_stocked");
        await using var db = fixture.OpenDb();
        Assert.Equal(2, await db.CrabItems.CountAsync(c => c.BatchId == farm.BatchId));
    }

    [Theory]
    [InlineData("NotClosed")] [InlineData("InsufficientCapital")] [InlineData("CapitalMismatch")]
    [InlineData("NoConfirmed")] [InlineData("MissingContract")] [InlineData("UnsignedContract")]
    [InlineData("FutureClosed")] [InlineData("FutureSigned")]
    [InlineData("Draft")] [InlineData("PendingApproval")] [InlineData("Rejected")]
    [InlineData("Stocked")] [InlineData("InProduction")] [InlineData("Cancelled")]
    [InlineData("Harvesting")] [InlineData("Settlement")] [InlineData("Closed")]
    public async Task Readiness_is_enforced_by_detail_and_write_endpoint(string condition)
    {
        var farm = await Setup();
        await using (var db = fixture.OpenDb())
        {
            var b = await db.Batches.Include(b => b.Contributions).ThenInclude(c => c.InvestmentContract).SingleAsync(b => b.BatchId == farm.BatchId);
            var contribution = Assert.Single(b.Contributions);
            switch (condition)
            {
                case "NotClosed": b.CapitalClosedAt = null; break;
                case "InsufficientCapital": b.TotalConfirmedCapital = 50; break;
                case "CapitalMismatch": b.TotalConfirmedCapital = 201; break;
                case "NoConfirmed": contribution.Status = "Expired"; break;
                case "MissingContract": db.InvestmentContracts.Remove(contribution.InvestmentContract!); break;
                case "UnsignedContract": contribution.InvestmentContract!.Status = "OperatorSigned"; break;
                case "FutureClosed": b.CapitalClosedAt = DateTimeOffset.UtcNow.AddDays(1); break;
                case "FutureSigned": contribution.InvestmentContract!.FullySignedAt = DateTimeOffset.UtcNow.AddDays(1); break;
                default: b.Status = condition; break;
            }
            await db.SaveChangesAsync();
        }
        var detail = await farm.Client.GetFromJsonAsync<JsonElement>($"/api/operators/me/batches/{farm.Code}");
        Assert.False(detail.GetProperty("canStock").GetBoolean());
        Assert.False(string.IsNullOrWhiteSpace(detail.GetProperty("stockingBlockedReason").GetString()));
        await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range()), HttpStatusCode.UnprocessableEntity, "stocking.not_ready");
        await using var check = fixture.OpenDb();
        Assert.False(await check.CrabItems.AnyAsync(c => c.BatchId == farm.BatchId));
        Assert.False(await check.SlotAllocations.AnyAsync(c => c.BatchId == farm.BatchId));
    }

    [Theory]
    [InlineData("Staff", HttpStatusCode.Forbidden)]
    [InlineData("RoleRevoked", HttpStatusCode.Forbidden)]
    [InlineData("Locked", HttpStatusCode.Unauthorized)]
    [InlineData("Suspended", HttpStatusCode.UnprocessableEntity)]
    [InlineData("MembershipRemoved", HttpStatusCode.Forbidden)]
    public async Task Current_database_permissions_override_stale_tokens(string condition, HttpStatusCode expected)
    {
        var farm = await Setup();
        await using (var db = fixture.OpenDb())
        {
            if (condition == "Staff") await db.OperatorMembers.Where(m => m.UserId == farm.UserId).ExecuteUpdateAsync(s => s.SetProperty(m => m.MemberRole, "Staff"));
            if (condition == "RoleRevoked") await db.AppUserRoles.Where(r => r.UserId == farm.UserId && r.RoleCode == "OperatorMember").ExecuteDeleteAsync();
            if (condition == "Locked") await db.AppUsers.Where(u => u.UserId == farm.UserId).ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, "Locked"));
            if (condition == "Suspended") await db.Operators.Where(o => o.OperatorId == farm.OperatorId).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, "Suspended"));
            if (condition == "MembershipRemoved") await db.OperatorMembers.Where(m => m.UserId == farm.UserId).ExecuteDeleteAsync();
        }
        await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range()), expected);
        await Empty(farm);
    }

    [Fact]
    public async Task Anonymous_other_roles_and_foreign_operators_cannot_stock_a_batch()
    {
        var farm = await Setup();
        using var anonymous = fixture.Factory.CreateClient();
        await Error(await anonymous.PostAsJsonAsync(Path(farm.Code), Range()), HttpStatusCode.Unauthorized);
        var (customer, _) = await User();
        using (customer) await Error(await customer.PostAsJsonAsync(Path(farm.Code), Range()), HttpStatusCode.Forbidden);
        var other = await Setup();
        await Error(await other.Client.PostAsJsonAsync(Path(farm.Code), Range()), HttpStatusCode.Forbidden, "batch.not_owner");
        await Error(await farm.Client.PostAsJsonAsync(Path("UNKNOWN"), Range()), HttpStatusCode.NotFound, "batch.not_found");
        await Empty(farm);
    }

    [Fact]
    public async Task Range_keeps_numbers_longer_than_width_and_supports_int_maximum()
    {
        var farm = await Setup(seed: 1);
        (await farm.Client.PostAsJsonAsync("/api/boxes/range", new { from = int.MaxValue, to = int.MaxValue, width = 1 })).EnsureSuccessStatusCode();
        (await farm.Client.PostAsJsonAsync(Path(farm.Code), Range(int.MaxValue, int.MaxValue, 1))).EnsureSuccessStatusCode();
        await using var db = fixture.OpenDb();
        var slot = await db.SlotAllocations.Where(a => a.BatchId == farm.BatchId).Select(a => a.Slot.SlotCode).SingleAsync();
        Assert.Equal("2147483647", slot);
    }

    [Fact]
    public async Task Preexisting_registry_is_rejected_even_if_batch_status_is_still_Funding()
    {
        var farm = await Setup();
        await using (var db = fixture.OpenDb())
        {
            db.SlotAllocations.Add(new SlotAllocation { BatchId = farm.BatchId, SlotId = await db.PhysicalSlots.Where(s => s.OperatorId == farm.OperatorId).Select(s => s.SlotId).FirstAsync(), AllocatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range()), HttpStatusCode.Conflict, "stocking.already_stocked");
        var detail = await farm.Client.GetFromJsonAsync<JsonElement>($"/api/operators/me/batches/{farm.Code}");
        Assert.False(detail.GetProperty("canStock").GetBoolean());
    }

    [Fact]
    public async Task Matching_huge_seed_and_range_is_bounded_by_actual_farm_inventory()
    {
        var farm = await Setup();
        await using (var db = fixture.OpenDb())
            await db.Batches.Where(b => b.BatchId == farm.BatchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.SeedQuantity, int.MaxValue));
        await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range(to: int.MaxValue)), HttpStatusCode.UnprocessableEntity, "stocking.slot_not_found");
        await Empty(farm);
    }

    [Theory]
    [InlineData("crab_item_event")] [InlineData("audit_log")]
    public async Task Database_failure_after_claiming_slots_rolls_back_crabs_allocations_events_and_audit(string table)
    {
        var farm = await Setup();
        await using var db = fixture.OpenDb();
        // DDL cannot parameterize a trigger body; the only substitution is a database-generated long.
        var triggerSql = table == "crab_item_event"
            ? $"CREATE TRIGGER dbo.vi07_test_failure ON dbo.crab_item_event AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted e JOIN dbo.crab_item c ON c.crab_item_id=e.crab_item_id WHERE c.batch_id={farm.BatchId}) THROW 51007, 'VI07 test failure', 1; END"
            : $"CREATE TRIGGER dbo.vi07_test_failure ON dbo.audit_log AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE entity_type='batch' AND entity_id={farm.BatchId} AND action_type='start_production') THROW 51007, 'VI07 test failure', 1; END";
        await db.Database.ExecuteSqlRawAsync(triggerSql);
        try
        {
            await Error(await farm.Client.PostAsJsonAsync(Path(farm.Code), Range()), HttpStatusCode.UnprocessableEntity);
            await Empty(farm);
            Assert.Equal(2, await db.PhysicalSlots.CountAsync(s => s.OperatorId == farm.OperatorId && s.Status == "Available"));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER dbo.vi07_test_failure"); }
    }
}

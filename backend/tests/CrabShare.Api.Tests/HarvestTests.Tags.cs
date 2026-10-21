using System.Net;
using System.Net.Http.Json;
using CrabShare.Api.Features.Harvest;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CrabShare.Api.Tests;

public partial class HarvestTests
{
    private sealed class Codes(params string[] values) : IHarvestTagCodeGenerator
    {
        private int _calls;
        public int Calls => _calls;
        public string NewCode() => values[Math.Min(Interlocked.Increment(ref _calls) - 1, values.Length - 1)];
    }
    private Task InsertTag(Farm farm, string code, string status = "Printed", long? evidenceId = null) => Db(async db =>
    {
        var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT dbo.crab_tag(crab_item_id,tag_code,status,printed_at,printed_by,activated_at,activation_evidence_id,voided_at,void_reason) VALUES({farm.CrabId},{code},{status},{now},{farm.UserId},{(status == "Active" ? now : (DateTimeOffset?)null)},{evidenceId},{(status == "Void" ? now : (DateTimeOffset?)null)},{(status == "Void" ? "SQL test history" : null)})");
        return true;
    });
    private Task<long> Photo(Farm farm) => Db(async db =>
    {
        var at = DateTimeOffset.UtcNow;
        var evidence = new Evidence { BatchId = farm.BatchId, SlotId = farm.SlotId, Source = "InAppCapture", MediaType = "Photo", FileUri = $"harvest-tests/{Guid.NewGuid():N}.jpg", Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"), CapturedAt = at, ReceivedAt = at, Latitude = 10.1m, Longitude = 106.1m, ReviewStatus = "Watch", CreatedAt = at };
        db.Evidences.Add(evidence); await db.SaveChangesAsync(); return evidence.EvidenceId;
    });
    [Theory]
    [InlineData("Printed", "Printed")]
    [InlineData("Printed", "Active")]
    [InlineData("Active", "Printed")]
    [InlineData("Active", "Active")]
    public async Task Direct_sql_rejects_any_second_non_void_tag_for_same_crab(string first, string second)
    {
        var farm = await Setup(); var evidence = await Photo(farm);
        await InsertTag(farm, "SQL" + Guid.NewGuid().ToString("N")[..9], first, first == "Active" ? evidence : null);
        var error = await Assert.ThrowsAsync<SqlException>(() => InsertTag(farm, "SQL" + Guid.NewGuid().ToString("N")[..9], second, second == "Active" ? evidence : null));
        Assert.Contains(error.Number, new[] { 2601, 2627 });
        Assert.Equal(1, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId)));
    }
    [Fact]
    public async Task Direct_sql_allows_void_history_but_tag_code_remains_globally_unique()
    {
        var farm = await Setup(); var second = await AddCrab(farm, "0002"); var code = "SQL" + Guid.NewGuid().ToString("N")[..9];
        await InsertTag(farm, code, "Void"); await InsertTag(farm, "SQL" + Guid.NewGuid().ToString("N")[..9]);
        var error = await Assert.ThrowsAsync<SqlException>(() => InsertTag(second, code)); Assert.Contains(error.Number, new[] { 2601, 2627 });
        Assert.Equal(2, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId)));
    }
    [Fact]
    public async Task Tag_collision_retries_whole_transaction_and_uses_fresh_unique_code()
    {
        var farm = await Setup(); var occupied = await Setup(); const string collision = "23456789ABCD"; const string free = "23456789ABCE"; await InsertTag(occupied, collision);
        var codes = new Codes(collision, free);
        await using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => { s.RemoveAll<IHarvestTagCodeGenerator>(); s.AddSingleton<IHarvestTagCodeGenerator>(codes); }));
        using var client = factory.CreateClient(); Authenticate(client, farm.UserId); var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64();
        var result = await Record(client, id, RecordInput(farm)); Assert.Equal(free, result.GetProperty("tagCode").GetString()); Assert.Equal(2, codes.Calls);
        Assert.Equal(1, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId))); Assert.Equal(1, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId && e.EventType == "Harvested")));
        Assert.Equal(1, await Db(db => db.Harvests.Where(h => h.HarvestId == id).Select(h => h.HarvestedCount).SingleAsync()));
    }
    [Fact]
    public async Task Five_tag_collisions_return_safe_conflict_and_leave_no_partial_writes()
    {
        var farm = await Setup(); var occupied = await Setup(); const string collision = "23456789ABCF"; await InsertTag(occupied, collision); var codes = new Codes(collision);
        await using var factory = fixture.Factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => { s.RemoveAll<IHarvestTagCodeGenerator>(); s.AddSingleton<IHarvestTagCodeGenerator>(codes); }));
        using var client = factory.CreateClient(); Authenticate(client, farm.UserId); var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64(); var audits = await AuditCount(farm);
        using var response = await client.PostAsJsonAsync(RecordPath(id), RecordInput(farm)); Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(); Assert.Contains("harvest.tag_generation_conflict", body); Assert.DoesNotContain("SqlException", body); Assert.Equal(5, codes.Calls);
        await AssertUnharvested(farm); Assert.Equal(audits, await AuditCount(farm));
    }
}

public class HarvestTestsTagCodeGenerator
{
    [Fact]
    public void Thousand_generated_codes_have_required_length_alphabet_and_no_duplicates()
    {
        var generator = new HarvestTagCodeGenerator(); var codes = new HashSet<string>();
        Assert.Equal(12, HarvestTagCodeGenerator.Length); Assert.Equal("23456789ABCDEFGHJKMNPQRSTUVWXYZ", HarvestTagCodeGenerator.Alphabet);
        for (var i = 0; i < 1000; i++)
        { var code = generator.NewCode(); Assert.Equal(HarvestTagCodeGenerator.Length, code.Length); Assert.All(code, c => Assert.Contains(c, HarvestTagCodeGenerator.Alphabet)); Assert.True(codes.Add(code)); }
    }
}

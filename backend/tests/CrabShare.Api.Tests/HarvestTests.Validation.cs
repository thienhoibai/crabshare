using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class HarvestTests
{
    [Theory]
    [InlineData(1, "L4")]
    [InlineData(249, "L4")]
    [InlineData(250, "L3")]
    [InlineData(349, "L3")]
    [InlineData(350, "L2")]
    [InlineData(499, "L2")]
    [InlineData(500, "L1")]
    [InlineData(32767, "L1")]
    public async Task Hard_shell_uses_all_inclusive_grade_boundaries(int weight, string grade)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm);
        var result = await Record(client, harvest.GetProperty("id").GetInt64(), RecordInput(farm, weight));
        Assert.Equal(grade, result.GetProperty("gradeCode").GetString()); Assert.Equal(weight / 1000m, result.GetProperty("totalWeightKg").GetDecimal());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(32768)]
    [InlineData(2147483647)]
    [InlineData(250.5)]
    [InlineData("250")]
    [InlineData("bad")]
    [InlineData(true)]
    public async Task Weight_must_be_json_integer_in_smallint_positive_range(object weight)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm);
        await Failure(await client.PostAsJsonAsync(RecordPath(harvest.GetProperty("id").GetInt64()), RecordInput(farm, weight)), HttpStatusCode.BadRequest);
        await AssertUnharvested(farm);
    }

    [Theory]
    [InlineData("weightG", true)]
    [InlineData("weightG", false)]
    [InlineData("shellCondition", true)]
    [InlineData("shellCondition", false)]
    [InlineData("expectedCrabItemId", true)]
    [InlineData("requestId", true)]
    public async Task Missing_and_null_required_record_fields_are_bad_requests(string field, bool missing)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm); var input = RecordInput(farm);
        if (missing) input.Remove(field); else input[field] = null;
        await Failure(await client.PostAsJsonAsync(RecordPath(harvest.GetProperty("id").GetInt64()), input), HttpStatusCode.BadRequest);
        await AssertUnharvested(farm);
    }

    [Theory]
    [InlineData("FatteningMudCrab", "SoftShell", "SOFT")]
    [InlineData("RoeCrab", "SoftShell", "SOFT")]
    [InlineData("SoftShellCrab", "HardShell", "L3")]
    [InlineData("SoftShellCrab", "SoftShell", "SOFT")]
    public async Task Observed_shell_condition_determines_grade_independently_from_batch_type(string crabType, string shell, string grade)
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Db(async db => { var batch = await db.Batches.FindAsync(farm.BatchId); batch!.CrabType = crabType; await db.SaveChangesAsync(); return true; });
        var harvest = await Start(client, farm); var input = RecordInput(farm, shell: shell); input["gradeCode"] = "L1"; input["status"] = "Sold";
        var result = await Record(client, harvest.GetProperty("id").GetInt64(), input);
        Assert.Equal(grade, result.GetProperty("gradeCode").GetString()); Assert.Equal(shell, result.GetProperty("shellCondition").GetString());
        Assert.Equal("InStock", await Db(db => db.CrabItems.Where(c => c.CrabItemId == farm.CrabId).Select(c => c.Status).SingleAsync()));
    }

    [Fact]
    public async Task Earlier_molted_event_is_displayed_but_does_not_implicitly_select_soft_grade()
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Success(await client.PostAsJsonAsync($"/api/batches/{farm.Code}/slot-events", new { requestId = Guid.NewGuid(), slotCode = farm.SlotCode, eventType = "Molted", occurredAt = DateTimeOffset.UtcNow.AddMinutes(-1), quantity = 1 }), HttpStatusCode.Created);
        var harvest = await Start(client, farm); var context = await client.GetFromJsonAsync<JsonElement>(ContextPath(farm));
        Assert.NotEqual(JsonValueKind.Null, context.GetProperty("latestMoltedAt").ValueKind);
        var result = await Record(client, harvest.GetProperty("id").GetInt64(), RecordInput(farm)); Assert.Equal("L3", result.GetProperty("gradeCode").GetString());
        Assert.Equal(1, await Db(db => db.CrabItemEvents.CountAsync(e => e.CrabItemId == farm.CrabId && e.EventType == "Molted")));
    }

    [Theory]
    [InlineData("gap")]
    [InlineData("overlap")]
    public async Task Invalid_hard_shell_grade_configuration_rolls_back_everything(string issue)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm);
        var original = await Db(db => db.ProductGrades.Where(g => g.GradeCode == "L3").Select(g => g.MinWeightG).SingleAsync());
        try
        {
            await Db(async db => { var grade = await db.ProductGrades.SingleAsync(g => g.GradeCode == "L3"); grade.MinWeightG = issue == "gap" ? (short)251 : (short)249; await db.SaveChangesAsync(); return true; });
            await Failure(await client.PostAsJsonAsync(RecordPath(harvest.GetProperty("id").GetInt64()), RecordInput(farm)), HttpStatusCode.UnprocessableEntity);
            await AssertUnharvested(farm);
        }
        finally { await Db(async db => { var grade = await db.ProductGrades.SingleAsync(g => g.GradeCode == "L3"); grade.MinWeightG = original; await db.SaveChangesAsync(); return true; }); }
    }

    [Fact]
    public async Task Missing_grade_code_and_soft_weight_bounds_fail_without_fallback()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var harvest = await Start(client, farm); var id = harvest.GetProperty("id").GetInt64();
        try
        {
            await Db(async db => { var grade = await db.ProductGrades.SingleAsync(g => g.GradeCode == "SOFT"); grade.GradeCode = "TEST_SOFT"; await db.SaveChangesAsync(); return true; });
            await Failure(await client.PostAsJsonAsync(RecordPath(id), RecordInput(farm, shell: "SoftShell")), HttpStatusCode.UnprocessableEntity);
            await AssertUnharvested(farm);
            await Db(async db => { var grade = await db.ProductGrades.SingleAsync(g => g.GradeCode == "TEST_SOFT"); grade.GradeCode = "SOFT"; grade.MinWeightG = 300; await db.SaveChangesAsync(); return true; });
            await Failure(await client.PostAsJsonAsync(RecordPath(id), RecordInput(farm, shell: "SoftShell")), HttpStatusCode.UnprocessableEntity);
            await AssertUnharvested(farm);
        }
        finally { await Db(async db => { var grade = await db.ProductGrades.SingleAsync(g => g.GradeCode == "SOFT" || g.GradeCode == "TEST_SOFT"); grade.GradeCode = "SOFT"; grade.MinWeightG = null; await db.SaveChangesAsync(); return true; }); }
    }

    private async Task AssertUnharvested(Farm farm)
    {
        var crab = await Db(db => db.CrabItems.SingleAsync(c => c.CrabItemId == farm.CrabId));
        Assert.Equal("Growing", crab.Status); Assert.Null(crab.HarvestId); Assert.Null(crab.WeightG); Assert.Null(crab.GradeId);
        Assert.Equal("Occupied", await Db(db => db.PhysicalSlots.Where(s => s.SlotId == farm.SlotId).Select(s => s.Status).SingleAsync()));
        Assert.Null(await Db(db => db.SlotAllocations.Where(a => a.SlotId == farm.SlotId).Select(a => a.ReleasedAt).SingleAsync()));
        Assert.Equal(0, await Db(db => db.CrabTags.CountAsync(t => t.CrabItemId == farm.CrabId)));
        Assert.Equal(0, await Db(db => db.SlotEvents.CountAsync(e => e.BatchId == farm.BatchId && e.EventType == "Harvested")));
        Assert.Equal(0, await Db(db => db.CrabItemEvents.CountAsync(e => e.CrabItemId == farm.CrabId && (e.EventType == "Harvested" || e.EventType == "TagPrinted"))));
        Assert.Equal(0, await Db(db => db.Harvests.Where(h => h.BatchId == farm.BatchId).SumAsync(h => h.HarvestedCount)));
        Assert.Equal(0m, await Db(db => db.Harvests.Where(h => h.BatchId == farm.BatchId).SumAsync(h => h.TotalWeightKg)));
    }
}

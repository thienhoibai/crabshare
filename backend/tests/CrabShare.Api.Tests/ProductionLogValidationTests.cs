using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Tests;

public partial class ProductionLogTests
{
    [Theory]
    [InlineData("InProduction")] [InlineData("Harvesting")]
    public async Task Active_care_states_can_record(string status)
    {
        var farm = await Setup(status: status); using var client = Client(farm.UserId);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync(Path(farm), Input())).StatusCode);
    }

    [Theory]
    [InlineData("Draft")] [InlineData("PendingApproval")] [InlineData("Funding")] [InlineData("Stocked")]
    [InlineData("Rejected")] [InlineData("Cancelled")] [InlineData("Settlement")] [InlineData("Closed")]
    public async Task Other_batch_states_cannot_record_even_with_existing_configuration(string status)
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Db(async db => { (await db.Batches.SingleAsync(b => b.BatchId == farm.BatchId)).Status = status; await db.SaveChangesAsync(); return true; });
        await Error(await client.PostAsJsonAsync(Path(farm), Input()), HttpStatusCode.UnprocessableEntity);
        Assert.False((await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("canRecord").GetBoolean());
    }

    [Theory]
    [InlineData("Draft")] [InlineData("PendingApproval")] [InlineData("Funding")] [InlineData("Stocked")]
    [InlineData("InProduction")] [InlineData("Harvesting")]
    public async Task Owner_can_configure_permitted_batch_states(string status)
    {
        var farm = await Setup(configure: false, status: status); using var client = Client(farm.UserId);
        Assert.True((await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("canConfigure").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput())).StatusCode);
    }

    [Theory]
    [InlineData("Rejected")] [InlineData("Cancelled")] [InlineData("Settlement")] [InlineData("Closed")]
    public async Task Terminal_batch_states_reject_new_threshold_versions(string status)
    {
        var farm = await Setup(configure: false, status: status); using var client = Client(farm.UserId);
        Assert.False((await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("canConfigure").GetBoolean());
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), ThresholdInput()), HttpStatusCode.UnprocessableEntity);
    }

    [Theory]
    [InlineData("ph", "-0.1")] [InlineData("ph", "14.1")] [InlineData("ph", "8.01")]
    [InlineData("waterTempC", "-273.2")] [InlineData("waterTempC", "1000")] [InlineData("waterTempC", "28.01")]
    [InlineData("salinityPpt", "-0.1")] [InlineData("salinityPpt", "1000")] [InlineData("salinityPpt", "20.01")]
    [InlineData("feedKg", "-0.001")] [InlineData("feedKg", "1000000000")] [InlineData("feedKg", "1.1251")]
    public async Task Invalid_domains_and_excess_precision_are_rejected_without_rounding(string field, string value)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(); input[field] = decimal.Parse(value, CultureInfo.InvariantCulture);
        await Error(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.BadRequest);
        Assert.False(await Db(db => db.ProductionLogs.AnyAsync(l => l.BatchId == farm.BatchId)));
    }

    [Theory]
    [InlineData("ph")] [InlineData("waterTempC")] [InlineData("salinityPpt")] [InlineData("feedKg")]
    public async Task Every_measurement_is_required_and_explicit_null_is_rejected(string field)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(); input.Remove(field);
        await Error(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.BadRequest);
        input[field] = null; await Error(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("source", "FarmApi")] [InlineData("logDate", "2000-01-01")]
    [InlineData("recordedBy", 1)] [InlineData("plausibilityFlag", "Ok")]
    [InlineData("thresholdVersion", 99)] [InlineData("createdAt", "2000-01-01T00:00:00Z")]
    public async Task Client_cannot_inject_server_owned_log_fields(string field, object value)
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(); input[field] = value;
        await Error(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.BadRequest);
        Assert.False(await Db(db => db.ProductionLogs.AnyAsync(l => l.BatchId == farm.BatchId)));
    }

    [Fact]
    public async Task Notes_are_optional_but_limited_to_five_hundred_characters()
    {
        var farm = await Setup(); using var client = Client(farm.UserId); var input = Input(); input["note"] = new string('x', 501);
        await Error(await client.PostAsJsonAsync(Path(farm), input), HttpStatusCode.BadRequest);
        input["note"] = new string('đ', 500); using var response = await client.PostAsJsonAsync(Path(farm), input); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(new string('đ', 500), (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("note").GetString());
        var other = await Setup(); using var second = Client(other.UserId); input.Remove("note"); Assert.Equal(HttpStatusCode.Created, (await second.PostAsJsonAsync(Path(other), input)).StatusCode);
    }

    [Theory]
    [InlineData("phMin")] [InlineData("phMax")] [InlineData("waterTempMinC")]
    [InlineData("waterTempMaxC")] [InlineData("salinityMinPpt")] [InlineData("salinityMaxPpt")]
    [InlineData("expectedVersionNo")]
    public async Task Every_threshold_value_and_expected_version_is_required(string field)
    {
        var farm = await Setup(configure: false); using var client = Client(farm.UserId); var input = ThresholdInput(); input.Remove(field);
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), input), HttpStatusCode.BadRequest);
        input[field] = null; await Error(await client.PutAsJsonAsync(ThresholdPath(farm), input), HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("phMin", "-0.1")] [InlineData("phMax", "14.1")] [InlineData("phMin", "7.01")]
    [InlineData("waterTempMinC", "-273.2")] [InlineData("waterTempMaxC", "1000")] [InlineData("waterTempMaxC", "31.01")]
    [InlineData("salinityMinPpt", "-0.1")] [InlineData("salinityMaxPpt", "1000")] [InlineData("salinityMinPpt", "15.01")]
    [InlineData("phMin", "9.1")] [InlineData("waterTempMinC", "31.1")] [InlineData("salinityMinPpt", "25.1")]
    [InlineData("expectedVersionNo", "-1")]
    public async Task Threshold_domains_precision_and_minimum_maximum_order_are_validated(string field, string value)
    {
        var farm = await Setup(configure: false); using var client = Client(farm.UserId); var input = ThresholdInput();
        input[field] = field == "expectedVersionNo" ? (object)int.Parse(value, CultureInfo.InvariantCulture) : decimal.Parse(value, CultureInfo.InvariantCulture);
        await Error(await client.PutAsJsonAsync(ThresholdPath(farm), input), HttpStatusCode.BadRequest);
        Assert.Equal(JsonValueKind.Null, (await client.GetFromJsonAsync<JsonElement>(ThresholdPath(farm))).GetProperty("current").ValueKind);
    }

    [Fact]
    public async Task Configured_physical_extremes_and_zero_width_ranges_accept_equal_measurements()
    {
        var farm = await Setup(configure: false); using var client = Client(farm.UserId); var config = ThresholdInput();
        config["phMin"] = 0m; config["phMax"] = 14m; config["waterTempMinC"] = -273.1m; config["waterTempMaxC"] = -273.1m; config["salinityMinPpt"] = 999.9m; config["salinityMaxPpt"] = 999.9m;
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(ThresholdPath(farm), config)).StatusCode);
        var input = Input(); input["ph"] = 0m; input["waterTempC"] = -273.1m; input["salinityPpt"] = 999.9m; input["feedKg"] = 0m;
        using var response = await client.PostAsJsonAsync(Path(farm), input); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("Ok", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("plausibilityFlag").GetString());
    }

    [Theory]
    [InlineData("from=2026-02-02&to=2026-02-01")] [InlineData("from=invalid")] [InlineData("to=2026-02-30")]
    [InlineData("page=0")] [InlineData("page=-1")] [InlineData("pageSize=0")] [InlineData("pageSize=101")]
    public async Task Invalid_history_filters_and_paging_are_rejected(string query)
    {
        var farm = await Setup(); using var client = Client(farm.UserId);
        await Error(await client.GetAsync(Path(farm) + "?" + query), HttpStatusCode.BadRequest);
        await Error(await client.GetAsync("/api/operators/me/production-logs?" + query), HttpStatusCode.BadRequest);
    }
}

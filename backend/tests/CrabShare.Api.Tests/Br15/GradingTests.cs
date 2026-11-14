using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Features.Grading;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CrabShare.Api.Tests.Br15;

/// <summary>AI đo mai giả cho test: trả đúng số được đặt, để kiểm tính C và các nhánh Hold.</summary>
public sealed class FakeCarapaceAi : ICarapaceAi
{
    public decimal LengthCm { get; set; } = 8.3m;
    public decimal Confidence { get; set; } = 0.95m;
    public bool Fail { get; set; }

    public Task<CarapaceAiResult> InferAsync(CarapaceAiRequest request, CancellationToken ct)
    {
        var white = Fail
            ? CarapaceImageResult.Failed("Không tìm thấy vạch ArUco")
            : new CarapaceImageResult("Succeeded", "Good", "{}", LengthCm, decimal.Round(LengthCm * 1.45m, 2), 42m, null, Confidence, null);
        var red = request.RedImage is null ? null : new CarapaceImageResult("Succeeded", "Good", null, null, null, null, 0.3m, Confidence, null);
        return Task.FromResult(new CarapaceAiResult("test-carapace", "1.0", false, white, red));
    }
}

public sealed class GradingFixture : Br15Fixture
{
    public FakeCarapaceAi Ai { get; } = new();
    protected override void Configure(IWebHostBuilder builder) => builder.ConfigureTestServices(s => s.AddSingleton<ICarapaceAi>(Ai));
}

/// <summary>G5: phân hạng từng con: trạm đo → AI → đề xuất → Nhân viên kiểm phẩm duyệt, giữ lại, loại, sửa (BR-017, BR-038, BR-151 – BR-158, BR-226).</summary>
[Trait("Category", "Database")]
public sealed class GradingTests(GradingFixture f) : IClassFixture<GradingFixture>
{
    private sealed record Station(string Code, string Key);

    private async Task<Station> StationAsync(Br15Fixture.Farmer farmer)
    {
        long siteId;
        await using (var db = f.OpenDb())
        {
            var now = DateTimeOffset.UtcNow;
            var site = new Infrastructure.Persistence.Entities.PartySite
            {
                PartyId = farmer.PartyId, SiteCode = $"TKP-{f.Next()}", SiteType = "QcStation", Name = "Trạm kiểm phẩm", AddressLine = "Năm Căn",
                Latitude = 8.76m, Longitude = 105.05m, Status = "Active", CreatedAt = now, UpdatedAt = now,
            };
            db.PartySites.Add(site);
            await db.SaveChangesAsync();
            siteId = site.SiteId;
        }
        using var admin = f.Admin();
        var registered = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, "/api/admin/devices",
            new { deviceCode = $"ST-{f.Next()}", deviceType = "Station", operatorId = farmer.OperatorId, siteId, cameraHeightMm = 370 }));
        return new Station(registered.GetProperty("device").GetProperty("deviceCode").GetString()!, registered.GetProperty("deviceKey").GetString()!);
    }

    /// <summary>Mở lượt đo bằng trạm rồi cho trạm gửi bản tin; trả số lượt đo.</summary>
    private async Task<string> MeasureAtStationAsync(HttpClient farmer, Station station, string crabCode, decimal weight = 412.3m)
    {
        var session = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions", new { crabCode, stationCode = station.Code }));
        using var device = f.Factory.CreateClient();
        device.DefaultRequestHeaders.Add("X-Device-Key", station.Key);
        var id = Guid.NewGuid();
        var meta = new
        {
            messageId = id, deviceCode = station.Code, deviceType = "Station", firmwareVersion = "0.3.1", capturedAt = DateTimeOffset.UtcNow.AddSeconds(-2),
            weightG = weight, weightSamples = 10, weightRangeG = 0.1m, tofMm = 318, cameraHeightMm = 370, lastCalibratedAt = DateTimeOffset.UtcNow.AddDays(-1),
            presets = new { white = new { exposureUs = 12000, gain = 1.0, lensPosition = 3.25 }, red = new { exposureUs = 4000, gain = 1.0, lensPosition = 3.25 } },
            doorClosed = true,
        };
        var form = new MultipartFormDataContent { { new StringContent(JsonSerializer.Serialize(meta, Br15Fixture.Json)), "meta" } };
        foreach (var name in new[] { "white", "red" })
        {
            var part = new ByteArrayContent(Br15Scenario.Jpeg(name + crabCode));
            part.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(part, name, $"{name}.jpg");
        }
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/devices/ingest/measurements") { Content = form };
        request.Headers.Add("Idempotency-Key", id.ToString());
        Assert.Equal(HttpStatusCode.Accepted, (await device.SendAsync(request)).StatusCode);
        return session.GetProperty("sessionNo").GetString()!;
    }

    private async Task<string> MeasureManuallyAsync(HttpClient farmer, string crabCode, decimal weight, decimal? length)
    {
        var session = await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, "/api/measurement-sessions", new { crabCode, procedure = "Manual" }));
        var no = session.GetProperty("sessionNo").GetString()!;
        await Br15Fixture.Body(await Br15Fixture.PostJson(farmer, $"/api/measurement-sessions/{no}/values", new { weightG = weight, carapaceLengthCm = length }));
        return no;
    }

    private static async Task<JsonElement> DecisionOfAsync(HttpClient client, string sessionNo)
        => (await Br15Fixture.Body(await client.GetAsync($"/api/measurement-sessions/{sessionNo}/measurements"))).GetProperty("decision");

    private async Task<long> AssignedQcAsync(long batchId, string kind = "GradingSession")
    {
        await using var db = f.OpenDb();
        return await db.QcAssignments.Where(a => a.BatchId == batchId && a.AssignmentKind == kind && a.Status == "Assigned")
            .Select(a => a.QcUserId).SingleAsync();
    }

    private HttpClient Qc(long userId) => f.Client(userId, Roles.QcInspector);

    private static MultipartFormDataContent PhotoForm(params (string Name, string Value)[] fields)
    {
        var form = new MultipartFormDataContent();
        foreach (var (name, value) in fields) form.Add(new StringContent(value), name);
        var photo = new ByteArrayContent(Br15Scenario.Jpeg("qc-photo"));
        photo.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        form.Add(photo, "Photo", "photo.jpg");
        return form;
    }

    [Fact]
    public async Task Station_and_manual_measurements_are_proposed_then_the_assigned_inspector_approves_and_batch_starts_selling()
    {
        await f.CreateUserAsync("Kiểm phẩm A", Roles.QcInspector);
        var set = await Br15Scenario.CrabsAsync(f, 2);
        var station = await StationAsync(set.Batch.Farmer);
        using var farmer = set.Batch.Farmer.Client(f);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));

        // Con 1: trạm đo 412,3 g, AI đo CL 8,3 cm → C = 0,7211 → XL Đặc cấp, không cận ngưỡng → Draft.
        f.Ai.LengthCm = 8.3m;
        var first = await MeasureAtStationAsync(farmer, station, set.CrabCodes[0]);
        var measured = await Br15Fixture.Body(await farmer.GetAsync($"/api/measurement-sessions/{first}/measurements"));
        Assert.Equal("Measured", measured.GetProperty("session").GetProperty("status").GetString());
        var methods = measured.GetProperty("values").EnumerateArray().Select(v => $"{v.GetProperty("metric").GetString()}:{v.GetProperty("method").GetString()}").ToList();
        Assert.Contains("WeightG:Scale", methods);
        Assert.Contains("CarapaceLengthCm:AI", methods);
        Assert.Equal(2, measured.GetProperty("inferences").GetArrayLength());
        var draft = measured.GetProperty("decision");
        Assert.Equal("Draft", draft.GetProperty("status").GetString());
        Assert.Equal("XL", draft.GetProperty("proposedSize").GetString());
        Assert.Equal(0.7211m, draft.GetProperty("cIndex").GetDecimal());
        Assert.Equal("SPECIAL", draft.GetProperty("proposedGrade").GetString());
        var decisionNo = draft.GetProperty("decisionNo").GetString()!;

        // Người nuôi không duyệt được; Nhân viên kiểm phẩm khác không được phân cũng không duyệt được (BR-017, BR-155).
        Assert.Equal(HttpStatusCode.Forbidden, (await Br15Fixture.PostJson(farmer, $"/api/grade-decisions/{decisionNo}/approve", new { })).StatusCode);
        var assigned = await AssignedQcAsync(set.Batch.BatchId);
        var outsider = await f.CreateUserAsync("Kiểm phẩm ngoài", Roles.QcInspector);
        using (var other = Qc(outsider))
            Assert.Equal("qc.not_assigned", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(other, $"/api/grade-decisions/{decisionNo}/approve", new { })));

        using var qc = Qc(assigned);
        var approved = await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{decisionNo}/approve", new { sensoryNote = "Mai cứng, càng chắc" }));
        Assert.Equal("Approved", approved.GetProperty("status").GetString());
        Assert.Equal("FAT-XL-SPECIAL", approved.GetProperty("specCode").GetString());
        Assert.False(approved.GetProperty("isSubstandard").GetBoolean());

        // Con 2: đo tay 280 g, thước kẹp 7,5 cm → C = 0,6637 sát ngưỡng 0,66 → Hold; QC hạ xuống Cấp 1 phải ghi lý do.
        var second = await MeasureManuallyAsync(farmer, set.CrabCodes[1], 280m, 7.5m);
        var held = await DecisionOfAsync(farmer, second);
        Assert.Equal("Hold", held.GetProperty("status").GetString());
        Assert.Equal("M", held.GetProperty("proposedSize").GetString());
        Assert.Contains("NearThreshold", held.GetProperty("holdReasons").EnumerateArray().Select(x => x.GetString()));
        var heldNo = held.GetProperty("decisionNo").GetString()!;
        Assert.Equal("grading.reason_required", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{heldNo}/approve", new { finalGrade = "G1" })));
        var downgraded = await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{heldNo}/approve",
            new { finalGrade = "G1", reason = "Dải xuyên sáng viền mai rộng" }));
        Assert.Equal("FAT-M-G1", downgraded.GetProperty("specCode").GetString());

        await using var db = f.OpenDb();
        var batch = await db.Batches.SingleAsync(b => b.BatchId == set.Batch.BatchId);
        Assert.Equal("Selling", batch.Status);
        Assert.NotNull(batch.SellingStartedAt);
        Assert.NotNull(batch.GradeRuleSetId);
        Assert.All(await db.CrabUnits.Where(c => c.BatchId == batch.BatchId).ToListAsync(), c => Assert.Equal("Graded", c.InventoryStatus));
        Assert.False(await db.BoxAssignments.AnyAsync(a => a.BatchId == batch.BatchId && a.LeftAt == null));
        Assert.Equal(2, await db.QcInspections.CountAsync(i => i.BatchId == batch.BatchId && i.InspectionKind == "Grading" && i.Conclusion == "Accepted"));
        Assert.Equal("Completed", await db.QcAssignments.Where(a => a.BatchId == batch.BatchId && a.AssignmentKind == "GradingSession").Select(a => a.Status).SingleAsync());
        Assert.Equal(2, await db.InventoryEvents.CountAsync(e => e.BatchId == batch.BatchId && e.EventType == "Graded"));

        // BR-017: thống kê số con đã duyệt theo Nhân viên kiểm phẩm.
        using var admin = f.Admin();
        var pool = await Br15Fixture.Body(await admin.GetAsync("/api/admin/qc-inspectors"));
        // Cùng một người có thể đã được phân ở test khác của fixture: so với số con người này đã duyệt trong CSDL (ít nhất 2 con của Lô này).
        var approvedByQc = await db.GradeDecisions.Where(d => d.Status == "Approved" && d.DecidedBy == assigned).Select(d => d.CrabUnitId).Distinct().CountAsync();
        Assert.True(approvedByQc >= 2);
        Assert.Equal(approvedByQc, pool.EnumerateArray().Single(q => q.GetProperty("userId").GetInt64() == assigned).GetProperty("approvedCount").GetInt32());
    }

    [Fact]
    public async Task Failed_ai_requires_caliper_station_weight_cannot_be_overridden_and_grade_cannot_go_above_measurement()
    {
        await f.CreateUserAsync("Kiểm phẩm B", Roles.QcInspector);
        var set = await Br15Scenario.CrabsAsync(f, 2);
        var station = await StationAsync(set.Batch.Farmer);
        using var farmer = set.Batch.Farmer.Client(f);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        f.Ai.Fail = true;
        string session;
        try { session = await MeasureAtStationAsync(farmer, station, set.CrabCodes[0]); }
        finally { f.Ai.Fail = false; }

        var hold = await DecisionOfAsync(farmer, session);
        Assert.Equal("Hold", hold.GetProperty("status").GetString());
        Assert.Contains("CaliperRequired", hold.GetProperty("holdReasons").EnumerateArray().Select(x => x.GetString()));
        using var qc = Qc(await AssignedQcAsync(set.Batch.BatchId));
        Assert.Equal("grading.caliper_required",
            await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{hold.GetProperty("decisionNo").GetString()}/approve", new { })));
        Assert.Equal("grading.weight_from_station",
            await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(farmer, $"/api/measurement-sessions/{session}/values", new { weightG = 500 })));

        // Thước kẹp 8,0 cm: C = 412,3 ÷ 512 = 0,8053 → phiên bản đề xuất 2, phiên bản 1 bị thay.
        await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/measurement-sessions/{session}/values", new { carapaceLengthCm = 8.0m }));
        var next = await DecisionOfAsync(farmer, session);
        Assert.Equal(2, next.GetProperty("versionNo").GetInt32());
        Assert.Equal(0.8053m, next.GetProperty("cIndex").GetDecimal());
        Assert.Equal("Draft", next.GetProperty("status").GetString());
        var history = await Br15Fixture.Body(await farmer.GetAsync($"/api/crab-units/{set.CrabCodes[0]}/grade-decisions"));
        Assert.Equal(["Superseded", "Draft"], history.EnumerateArray().Select(d => d.GetProperty("status").GetString()));

        // Đo tay 250 g, CL 8 cm → C = 0,4883 dưới ngưỡng: QC không nâng lên Cấp 1 được; duyệt thì là cua dưới chuẩn, không có quy cách đặt trước.
        var low = await MeasureManuallyAsync(farmer, set.CrabCodes[1], 250m, 8m);
        var below = await DecisionOfAsync(farmer, low);
        Assert.Equal("BELOW", below.GetProperty("proposedGrade").GetString());
        var belowNo = below.GetProperty("decisionNo").GetString()!;
        Assert.Equal("grading.upgrade_not_allowed",
            await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{belowNo}/approve", new { finalGrade = "G1" })));
        var substandard = await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{belowNo}/approve", new { }));
        Assert.True(substandard.GetProperty("isSubstandard").GetBoolean());
        Assert.Equal(JsonValueKind.Null, substandard.GetProperty("specCode").ValueKind);
    }

    [Fact]
    public async Task Inspector_hold_needs_a_second_inspector_who_then_decides()
    {
        await f.CreateUserAsync("Kiểm phẩm C", Roles.QcInspector);
        await f.CreateUserAsync("Kiểm phẩm D", Roles.QcInspector);
        var set = await Br15Scenario.CrabsAsync(f, 1);
        using var farmer = set.Batch.Farmer.Client(f);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        var session = await MeasureManuallyAsync(farmer, set.CrabCodes[0], 420m, 8.3m);
        var no = (await DecisionOfAsync(farmer, session)).GetProperty("decisionNo").GetString()!;
        var firstQc = await AssignedQcAsync(set.Batch.BatchId);
        using var first = Qc(firstQc);
        var held = await Br15Fixture.Body(await Br15Fixture.PostJson(first, $"/api/grade-decisions/{no}/hold", new { reason = "Càng hơi yếu, theo dõi thêm" }));
        Assert.Equal("Hold", held.GetProperty("status").GetString());
        Assert.Contains("QcHold", held.GetProperty("holdReasons").EnumerateArray().Select(x => x.GetString()));

        var secondQc = await AssignedQcAsync(set.Batch.BatchId, "SecondReview");
        Assert.NotEqual(firstQc, secondQc);
        Assert.Equal("qc.not_assigned", await Br15Fixture.ErrorCode(await Br15Fixture.PostJson(first, $"/api/grade-decisions/{no}/approve", new { })));
        using var second = Qc(secondQc);
        var confirmed = await Br15Fixture.Body(await second.PostAsync($"/api/grade-decisions/{no}/confirm-hold", null));
        Assert.Equal(secondQc, confirmed.GetProperty("secondQcId").GetInt64());
        var approved = await Br15Fixture.Body(await Br15Fixture.PostJson(second, $"/api/grade-decisions/{no}/approve", new { }));
        Assert.Equal("Approved", approved.GetProperty("status").GetString());
        Assert.Equal(secondQc, approved.GetProperty("decidedBy").GetInt64());
    }

    [Fact]
    public async Task Reject_needs_a_reason_and_photo_and_destroys_the_crab_and_revision_keeps_the_old_decision()
    {
        await f.CreateUserAsync("Kiểm phẩm E", Roles.QcInspector);
        var set = await Br15Scenario.CrabsAsync(f, 3);
        using var farmer = set.Batch.Farmer.Client(f);
        await Br15Fixture.Body(await farmer.PostAsync($"/api/batches/{set.Batch.Code}/start-harvest", null));
        var dead = (await DecisionOfAsync(farmer, await MeasureManuallyAsync(farmer, set.CrabCodes[0], 410m, 8.3m))).GetProperty("decisionNo").GetString()!;
        using var qc = Qc(await AssignedQcAsync(set.Batch.BatchId));

        var healthy = await qc.PostAsync($"/api/grade-decisions/{dead}/reject", PhotoForm(("LiveStatus", "Alive"), ("FoodSafety", "Pass"), ("Reason", "Thử")));
        Assert.Equal("grading.reject_reason_invalid", await Br15Fixture.ErrorCode(healthy));
        var rejected = await Br15Fixture.Body(await qc.PostAsync($"/api/grade-decisions/{dead}/reject",
            PhotoForm(("LiveStatus", "Dead"), ("FoodSafety", "Fail"), ("Reason", "Cua chết trong hộp lúc thu"))));
        Assert.Equal("Rejected", rejected.GetProperty("status").GetString());
        Assert.True(rejected.GetProperty("hasPhoto").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await farmer.GetAsync($"/api/grade-decisions/{dead}/photo")).StatusCode);

        var good = (await DecisionOfAsync(farmer, await MeasureManuallyAsync(farmer, set.CrabCodes[1], 410m, 8.3m))).GetProperty("decisionNo").GetString()!;
        await Br15Fixture.Body(await Br15Fixture.PostJson(qc, $"/api/grade-decisions/{good}/approve", new { }));
        Assert.Equal(HttpStatusCode.Forbidden, (await farmer.PostAsync($"/api/grade-decisions/{good}/revise",
            PhotoForm(("FinalSize", "L"), ("FinalGrade", "G1"), ("Reason", "Cân lại")))).StatusCode);
        var upsize = await qc.PostAsync($"/api/grade-decisions/{good}/revise", PhotoForm(("FinalSize", "XL"), ("FinalGrade", "SPECIAL"), ("Reason", "Giữ nguyên")));
        Assert.Equal("grading.no_change", await Br15Fixture.ErrorCode(upsize));
        var revised = await Br15Fixture.Body(await qc.PostAsync($"/api/grade-decisions/{good}/revise",
            PhotoForm(("FinalSize", "L"), ("FinalGrade", "G1"), ("Reason", "Cân lại sau vận chuyển hụt cân"))));
        Assert.Equal(2, revised.GetProperty("versionNo").GetInt32());
        Assert.Equal("FAT-L-G1", revised.GetProperty("specCode").GetString());
        Assert.Equal("grading.decision_not_current",
            await Br15Fixture.ErrorCode(await qc.PostAsync($"/api/grade-decisions/{good}/revise", PhotoForm(("FinalSize", "M"), ("FinalGrade", "G1"), ("Reason", "x x x")))));

        await using var db = f.OpenDb();
        var crabs = await db.CrabUnits.Where(c => c.BatchId == set.Batch.BatchId).ToDictionaryAsync(c => c.CrabCode);
        Assert.Equal("Destroyed", crabs[set.CrabCodes[0]].InventoryStatus);
        Assert.Equal("Dead", crabs[set.CrabCodes[0]].Condition);
        Assert.True(await db.InventoryEvents.AnyAsync(e => e.CrabUnitId == crabs[set.CrabCodes[0]].CrabUnitId && e.EventType == "Destroyed"));
        Assert.True(await db.InventoryEvents.AnyAsync(e => e.CrabUnitId == crabs[set.CrabCodes[1]].CrabUnitId && e.EventType == "Downgraded"));
        var versions = await db.GradeDecisions.Where(d => d.CrabUnitId == crabs[set.CrabCodes[1]].CrabUnitId).OrderBy(d => d.VersionNo).ToListAsync();
        Assert.Equal(new[] { "Approved", "Approved" }, versions.Select(v => v.Status));
        Assert.Equal(new[] { false, true }, versions.Select(v => v.IsCurrent));
        // Con thứ 3 chưa đo nên Lô vẫn đang thu hoạch (BR-152).
        Assert.Equal("Harvesting", await db.Batches.Where(b => b.BatchId == set.Batch.BatchId).Select(b => b.Status).SingleAsync());
    }

    [Fact]
    public async Task Admin_versions_rule_sets_and_applied_sets_are_locked()
    {
        using var anonymous = f.Factory.CreateClient();
        var standards = await Br15Fixture.Body(await anonymous.GetAsync("/api/grading/standards"));
        var sets = standards[0].GetProperty("ruleSets").EnumerateArray().ToList();
        Assert.Equal(4, sets.Count);
        var meat = sets.Single(s => s.GetProperty("crabType").GetString() == "FatteningMudCrab");
        Assert.Contains(meat.GetProperty("rules").EnumerateArray(), r => r.GetProperty("resultLabel").GetString() == "M" && r.GetProperty("lowerBound").GetDecimal() == 200);

        using var admin = f.Admin();
        var draft = await Br15Fixture.Body(await Br15Fixture.PostJson(admin, "/api/admin/grade-rule-sets", new { crabType = "OilRoeCrab", note = "Thử phiên bản 2" }));
        Assert.Equal(2, draft.GetProperty("versionNo").GetInt32());
        Assert.Equal("Draft", draft.GetProperty("status").GetString());
        var id = draft.GetProperty("id").GetInt64();
        Assert.Equal(HttpStatusCode.Conflict, (await Br15Fixture.PostJson(admin, "/api/admin/grade-rule-sets", new { crabType = "OilRoeCrab" })).StatusCode);

        object Rule(string label, decimal? lo, decimal? hi) => new { ruleKind = "Size", metric = "WeightG", lowerBound = lo, upperBound = hi, unit = "g", resultLabel = label };
        var overlap = await admin.PutAsJsonAsync($"/api/admin/grade-rule-sets/{id}/rules", new { rules = new[] { Rule("M", 150, 210), Rule("L", 200, 300), Rule("XL", 300, null) } });
        Assert.Equal("grading.rule_overlap", await Br15Fixture.ErrorCode(overlap));
        var missing = await admin.PutAsJsonAsync($"/api/admin/grade-rule-sets/{id}/rules", new { rules = new[] { Rule("M", 160, 200), Rule("L", 200, 300) } });
        Assert.Equal(HttpStatusCode.OK, missing.StatusCode);
        Assert.Equal("grading.size_rules_incomplete", await Br15Fixture.ErrorCode(await admin.PostAsync($"/api/admin/grade-rule-sets/{id}/activate", null)));
        await Br15Fixture.Body(await admin.PutAsJsonAsync($"/api/admin/grade-rule-sets/{id}/rules",
            new { rules = new[] { Rule("M", 160, 200), Rule("L", 200, 300), Rule("XL", 300, null) }, nearThresholdPct = 1.5m }));
        var active = await Br15Fixture.Body(await admin.PostAsync($"/api/admin/grade-rule-sets/{id}/activate", null));
        Assert.Equal("Active", active.GetProperty("status").GetString());
        Assert.Equal(1.5m, active.GetProperty("nearThresholdPct").GetDecimal());

        await using var db = f.OpenDb();
        Assert.Equal("Retired", await db.GradeRuleSets.Where(s => s.CrabType == "OilRoeCrab" && s.VersionNo == 1).Select(s => s.Status).SingleAsync());
        // Bộ đã áp dụng không sửa được kể cả ghi thẳng vào cơ sở dữ liệu (BR-038).
        await Assert.ThrowsAnyAsync<Exception>(() => db.Database.ExecuteSqlRawAsync(
            $"UPDATE dbo.grade_rule SET lower_bound = 170 WHERE rule_set_id = {id} AND result_label = 'M'"));
        Assert.Equal("grading.rule_set_locked", await Br15Fixture.ErrorCode(await admin.PutAsJsonAsync($"/api/admin/grade-rule-sets/{id}/rules",
            new { rules = new[] { Rule("M", 170, 200), Rule("L", 200, 300), Rule("XL", 300, null) } })));
    }
}

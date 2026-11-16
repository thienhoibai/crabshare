using CrabShare.Api.Features.Grading;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Tests.Br15;

/// <summary>G5: đề xuất phân hạng thuần tính toán theo bảng 3.2, 3.3 và BR-227 (không cần cơ sở dữ liệu).</summary>
public sealed class GradeEngineTests
{
    private static GradeRule R(string kind, string metric, decimal? lo, decimal? hi, string label, string boundary = "LowerInclusive", int sort = 0)
        => new() { RuleKind = kind, Metric = metric, LowerBound = lo, UpperBound = hi, ResultLabel = label, Boundary = boundary, SortOrder = sort, Unit = "" };

    private static readonly GradeRule[] MeatCrab =
    [
        R("Size", "WeightG", 200, 300, "M", sort: 1), R("Size", "WeightG", 300, 350, "L", sort: 2), R("Size", "WeightG", 350, null, "XL", sort: 3),
        R("PhysicalFactor", "CIndex", 0.66m, null, "SPECIAL", sort: 1), R("PhysicalFactor", "CIndex", 0.62m, 0.66m, "G1", sort: 2),
        R("PhysicalFactor", "CIndex", null, 0.62m, "BELOW", sort: 3),
    ];

    private static readonly GradeRule[] RoeCrab =
    [
        R("Size", "WeightG", 200, 250, "M", sort: 1), R("Size", "WeightG", 250, 350, "L", sort: 2), R("Size", "WeightG", 350, null, "XL", sort: 3),
        R("Sensory", "EdgeBandMm", null, 2, "SPECIAL", sort: 1), R("Sensory", "EdgeBandMm", 2, 4, "G1", "BothInclusive", 2),
        R("Sensory", "EdgeBandMm", 4, null, "BELOW", "UpperInclusive", 3),
    ];

    private static GradeInput Caliper(decimal weight, decimal? length, decimal? band = null) => new(weight, length, band, null, null, true, 0.8m);

    [Theory]
    [InlineData(199.9, "OUT")]
    [InlineData(200, "M")]
    [InlineData(299.9, "M")]
    [InlineData(300, "L")]
    [InlineData(350, "XL")]
    [InlineData(1200, "XL")]
    public void Size_follows_table_3_2_with_lower_bound_inclusive_and_below_M_is_outside(decimal weight, string size)
        => Assert.Equal(size, GradeEngine.Propose(MeatCrab, 0, Caliper(weight, 8m)).Size);

    [Fact]
    public void C_index_is_weight_over_carapace_length_cubed_rounded_to_four_places()
    {
        var p = GradeEngine.Propose(MeatCrab, 2, Caliper(412.3m, 8.3m));
        Assert.Equal(0.7211m, p.CIndex);
        Assert.Equal("SPECIAL", p.CLevel);
        Assert.Equal("SPECIAL", p.Grade);
        Assert.Equal("Draft", p.Status);
    }

    [Theory]
    [InlineData(0.66, "SPECIAL")]
    [InlineData(0.6599, "G1")]
    [InlineData(0.62, "G1")]
    [InlineData(0.6199, "BELOW")]
    public void C_levels_follow_table_3_3(decimal c, string level)
        => Assert.Equal(level, GradeEngine.Classify(MeatCrab.Where(r => r.RuleKind == "PhysicalFactor"), c));

    [Fact]
    public void Values_within_the_near_threshold_band_go_to_hold()
    {
        var nearSize = GradeEngine.Propose(MeatCrab, 2, Caliper(351m, 8.3m));
        Assert.Contains(HoldReasons.NearThreshold, nearSize.HoldReasons);
        Assert.Equal("Hold", nearSize.Status);
        // 280 g, CL 7,5 cm: C = 0,6637, sát ngưỡng 0,66 (2 % = 0,0132).
        var nearC = GradeEngine.Propose(MeatCrab, 2, Caliper(280m, 7.5m));
        Assert.Equal(0.6637m, nearC.CIndex);
        Assert.Contains(HoldReasons.NearThreshold, nearC.HoldReasons);
        Assert.Empty(GradeEngine.Propose(MeatCrab, 0, Caliper(280m, 7.5m)).HoldReasons);
    }

    [Fact]
    public void Low_confidence_or_bad_image_requires_caliper_and_never_uses_the_ai_length()
    {
        var low = GradeEngine.Propose(MeatCrab, 2, new GradeInput(412.3m, 8.3m, null, 0.5m, "Good", false, 0.8m));
        Assert.Contains(HoldReasons.LowConfidence, low.HoldReasons);
        Assert.Contains(HoldReasons.CaliperRequired, low.HoldReasons);
        Assert.Null(low.CIndex);
        Assert.Null(low.Grade);
        var poor = GradeEngine.Propose(MeatCrab, 2, new GradeInput(412.3m, 8.3m, null, 0.95m, "Poor", false, 0.8m));
        Assert.Contains(HoldReasons.ImageQuality, poor.HoldReasons);
        Assert.Contains(HoldReasons.CaliperRequired, poor.HoldReasons);
        var trusted = GradeEngine.Propose(MeatCrab, 2, new GradeInput(412.3m, 8.3m, null, 0.95m, "Good", false, 0.8m));
        Assert.Empty(trusted.HoldReasons);
        var missing = GradeEngine.Propose(MeatCrab, 2, new GradeInput(412.3m, null, null, null, null, false, 0.8m));
        Assert.Equal(new[] { HoldReasons.CaliperRequired }, missing.HoldReasons);
    }

    [Theory]
    [InlineData(1.99, "SPECIAL")]
    [InlineData(2, "G1")]
    [InlineData(4, "G1")]
    [InlineData(4.01, "BELOW")]
    public void Roe_crab_grade_comes_from_the_edge_band_of_br_227(decimal band, string grade)
    {
        var p = GradeEngine.Propose(RoeCrab, 0, Caliper(300m, null, band));
        Assert.Null(p.CIndex);
        Assert.Equal(grade, p.Sensory);
        Assert.Equal(grade, p.Grade);
    }

    [Fact]
    public void Roe_crab_without_edge_band_waits_for_the_inspector_sensory_check()
    {
        var p = GradeEngine.Propose(RoeCrab, 0, Caliper(300m, null));
        Assert.Null(p.Grade);
        Assert.Equal(new[] { HoldReasons.SensoryPending }, p.HoldReasons);
    }

    [Theory]
    [InlineData("FatteningMudCrab", "XL", "SPECIAL", "FAT-XL-SPECIAL")]
    [InlineData("RoeCrab", "M", "G1", "ROE-M-G1")]
    [InlineData("YoungFemaleCrab", "OUT", "SPECIAL", "YFC-OUT-G1")]
    [InlineData("OilRoeCrab", "L", "BELOW", null)]
    public void Spec_code_maps_to_product_specifications_and_below_threshold_has_none(string type, string size, string grade, string? code)
    {
        Assert.Equal(code, GradeLabels.SpecCode(type, size, grade));
        Assert.Equal(size == "OUT" || grade == "BELOW", GradeLabels.IsSubstandard(size, grade));
    }
}

using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Grading;

/// <summary>
/// Chuẩn phân hạng và bộ quy tắc (BR-038): Admin diễn giải chuẩn T/SCFA 0014-2024 thành bộ quy tắc có phiên bản theo loại cua.
/// Bộ đã áp dụng không sửa được; đổi thì tạo bản nháp mới rồi áp dụng; Lô đã duyệt giữ bộ cũ tới khi đóng.
/// </summary>
public sealed class GradingStandardService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit)
{
    private static readonly string[] CTypes = ["FatteningMudCrab", "YoungFemaleCrab"];

    public async Task<IReadOnlyList<GradingStandardResponse>> StandardsAsync(bool includeDrafts, CancellationToken ct)
    {
        var standards = await db.GradingStandards.AsNoTracking().OrderBy(s => s.StandardId).ToListAsync(ct);
        var sets = await db.GradeRuleSets.AsNoTracking().Include(s => s.Rules)
            .Where(s => includeDrafts || s.Status == "Active").OrderBy(s => s.CrabType).ThenBy(s => s.VersionNo).ToListAsync(ct);
        return standards.Select(s => new GradingStandardResponse(s.StandardCode, s.Revision, s.Issuer, s.Scope, s.EffectiveFrom, s.Note,
            sets.Where(x => x.StandardId == s.StandardId).Select(Response).ToList())).ToList();
    }

    public async Task<GradeRuleSetResponse> CreateDraftAsync(CreateRuleSetRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        foreach (var r in req.Rules ?? []) BatchService.Validate(r);
        var id = await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var active = await db.GradeRuleSets.AsNoTracking().Include(s => s.Rules).SingleOrDefaultAsync(s => s.CrabType == req.CrabType && s.Status == "Active", ct);
            var standardId = active?.StandardId ?? await db.GradingStandards.OrderByDescending(s => s.EffectiveFrom).Select(s => s.StandardId).FirstAsync(ct);
            if (await db.GradeRuleSets.AnyAsync(s => s.CrabType == req.CrabType && s.Status == "Draft", ct))
                throw new ConflictException("grading.draft_exists", "Đã có bản nháp bộ quy tắc cho loại cua này; sửa hoặc áp dụng bản đó.");
            var now = clock.GetUtcNow();
            var version = await db.GradeRuleSets.Where(s => s.CrabType == req.CrabType).MaxAsync(s => (int?)s.VersionNo, ct) ?? 0;
            var set = new GradeRuleSet
            {
                StandardId = standardId, CrabType = req.CrabType, VersionNo = version + 1, EffectiveFrom = req.EffectiveFrom?.ToUniversalTime() ?? now,
                NearThresholdPct = req.NearThresholdPct ?? active?.NearThresholdPct ?? 2m, Status = "Draft", Note = req.Note?.Trim(),
                CreatedBy = me.UserId, CreatedAt = now,
            };
            set.Rules = req.Rules is { Count: > 0 }
                ? req.Rules.Select(ToRule).ToList()
                : (active?.Rules ?? []).Select(r => new GradeRule
                {
                    RuleKind = r.RuleKind, Metric = r.Metric, LowerBound = r.LowerBound, UpperBound = r.UpperBound, Unit = r.Unit,
                    ResultLabel = r.ResultLabel, Boundary = r.Boundary, SortOrder = r.SortOrder, Note = r.Note,
                }).ToList();
            ValidateRules(set.Rules);
            db.GradeRuleSets.Add(set);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("grade_rule_set", set.RuleSetId, "create_draft", null, new { set.CrabType, set.VersionNo, rules = set.Rules.Count }, ct);
            return set.RuleSetId;
        }, ct);
        return await GetAsync(id, ct);
    }

    public async Task<GradeRuleSetResponse> ReplaceRulesAsync(long id, ReplaceRulesRequest req, CancellationToken ct)
    {
        BatchService.Validate(req);
        foreach (var r in req.Rules) BatchService.Validate(r);
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var set = await db.GradeRuleSets.Include(s => s.Rules).SingleOrDefaultAsync(s => s.RuleSetId == id, ct)
                      ?? throw new NotFoundException("grading.rule_set_not_found", "Không tìm thấy bộ quy tắc.");
            if (set.Status != "Draft")
                throw new BusinessRuleException("grading.rule_set_locked", "Bộ quy tắc đã áp dụng không sửa được; tạo phiên bản mới (BR-038).");
            var rules = req.Rules.Select(ToRule).ToList();
            ValidateRules(rules);
            db.GradeRules.RemoveRange(set.Rules);
            await db.SaveChangesAsync(ct);
            foreach (var r in rules) { r.RuleSetId = set.RuleSetId; db.GradeRules.Add(r); }
            if (req.NearThresholdPct is { } near) set.NearThresholdPct = near;
            if (req.Note is not null) set.Note = req.Note.Trim();
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("grade_rule_set", set.RuleSetId, "replace_rules", null, new { rules = rules.Count, set.NearThresholdPct }, ct);
        }, ct);
        return await GetAsync(id, ct);
    }

    /// <summary>Áp dụng bản nháp: kiểm đủ ngưỡng size M, L, XL; cua thịt và cua cái non phải có đủ mức C (bảng 3.3). Bộ đang áp dụng chuyển Retired.</summary>
    public async Task<GradeRuleSetResponse> ActivateAsync(long id, CancellationToken ct)
    {
        await db.InTransactionAsync(async () =>
        {
            await audit.LockAsync(ct);
            var set = await db.GradeRuleSets.Include(s => s.Rules).SingleOrDefaultAsync(s => s.RuleSetId == id, ct)
                      ?? throw new NotFoundException("grading.rule_set_not_found", "Không tìm thấy bộ quy tắc.");
            if (set.Status != "Draft")
                throw new BusinessRuleException("grading.rule_set_not_draft", "Chỉ áp dụng bản nháp.");
            var sizes = set.Rules.Where(r => r.RuleKind == "Size" && r.Metric == "WeightG").Select(r => r.ResultLabel).ToHashSet();
            if (!new[] { "M", "L", "XL" }.All(sizes.Contains))
                throw new BusinessRuleException("grading.size_rules_incomplete", "Bộ quy tắc cần đủ ngưỡng size M, L, XL theo khối lượng (bảng 3.2).");
            var cLevels = set.Rules.Where(r => r.RuleKind == "PhysicalFactor" && r.Metric == "CIndex").Select(r => r.ResultLabel).ToHashSet();
            if (CTypes.Contains(set.CrabType) && !new[] { "SPECIAL", "G1" }.All(cLevels.Contains))
                throw new BusinessRuleException("grading.c_rules_incomplete", "Cua thịt và cua cái non cần đủ mức C Đặc cấp và Cấp 1 (bảng 3.3).");
            var now = clock.GetUtcNow();
            var active = await db.GradeRuleSets.SingleOrDefaultAsync(s => s.CrabType == set.CrabType && s.Status == "Active", ct);
            if (active is not null)
            {
                active.Status = "Retired";
                await db.SaveChangesAsync(ct);
            }
            set.Status = "Active";
            set.ApprovedBy = me.UserId;
            set.ApprovedAt = now;
            if (set.EffectiveFrom < now) set.EffectiveFrom = now;
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("grade_rule_set", set.RuleSetId, "activate", active is null ? null : new { retired = active.RuleSetId },
                new { set.CrabType, set.VersionNo, set.ApprovedAt }, ct);
        }, ct);
        return await GetAsync(id, ct);
    }

    public async Task<GradeRuleSetResponse> GetAsync(long id, CancellationToken ct)
        => Response(await db.GradeRuleSets.AsNoTracking().Include(s => s.Rules).SingleOrDefaultAsync(s => s.RuleSetId == id, ct)
                    ?? throw new NotFoundException("grading.rule_set_not_found", "Không tìm thấy bộ quy tắc."));

    private static GradeRule ToRule(GradeRuleRequest r) => new()
    {
        RuleKind = r.RuleKind, Metric = r.Metric, LowerBound = r.LowerBound, UpperBound = r.UpperBound, Unit = r.Unit.Trim(),
        ResultLabel = r.ResultLabel, Boundary = r.Boundary, SortOrder = r.SortOrder, Note = r.Note?.Trim(),
    };

    private static void ValidateRules(IReadOnlyCollection<GradeRule> rules)
    {
        foreach (var r in rules)
        {
            if (r.LowerBound is { } lo && r.UpperBound is { } hi && lo >= hi)
                throw new BusinessRuleException("grading.rule_bounds", "Cận dưới phải nhỏ hơn cận trên.");
            var ok = r.RuleKind switch
            {
                "Size" => r.Metric == "WeightG" && r.ResultLabel is "M" or "L" or "XL" or "OUT",
                "PhysicalFactor" => r.Metric == "CIndex" && r.ResultLabel is "SPECIAL" or "G1" or "BELOW",
                "Sensory" => r.Metric == "EdgeBandMm" && r.ResultLabel is "SPECIAL" or "G1" or "BELOW",
                "Exclusion" => r.Metric is "Alive" or "FoodSafe" && r.ResultLabel == "REJECT",
                _ => false,
            };
            if (!ok) throw new BusinessRuleException("grading.rule_kind_mismatch", $"Quy tắc {r.RuleKind} không dùng chỉ số {r.Metric} với nhãn {r.ResultLabel}.");
        }
        foreach (var group in rules.Where(r => r.RuleKind is "Size" or "PhysicalFactor" or "Sensory").GroupBy(r => r.RuleKind))
        {
            var ordered = group.ToList();
            for (var i = 0; i < ordered.Count; i++)
                for (var j = i + 1; j < ordered.Count; j++)
                    if (Overlap(ordered[i], ordered[j]))
                        throw new BusinessRuleException("grading.rule_overlap", $"Hai quy tắc {group.Key} chồng khoảng nhau ({ordered[i].ResultLabel}, {ordered[j].ResultLabel}).");
        }
    }

    /// <summary>Hai khoảng giao nhau khi có một điểm thuộc cả hai; kiểm tại các mút và trung điểm.</summary>
    private static bool Overlap(GradeRule a, GradeRule b)
    {
        var points = new[] { a.LowerBound, a.UpperBound, b.LowerBound, b.UpperBound }.Where(x => x is not null).Select(x => x!.Value).Distinct().OrderBy(x => x).ToList();
        var probes = new List<decimal>(points);
        for (var i = 0; i + 1 < points.Count; i++) probes.Add((points[i] + points[i + 1]) / 2);
        if (points.Count > 0) { probes.Add(points[0] - 1); probes.Add(points[^1] + 1); }
        else probes.Add(0);
        return probes.Any(p => GradeEngine.Matches(a, p) && GradeEngine.Matches(b, p));
    }

    private static GradeRuleSetResponse Response(GradeRuleSet s) => new(s.RuleSetId, s.CrabType, s.VersionNo, s.Status, s.EffectiveFrom, s.NearThresholdPct,
        s.Note, s.ApprovedAt, s.Rules.OrderBy(r => r.RuleKind).ThenBy(r => r.SortOrder)
            .Select(r => new GradeRuleResponse(r.RuleId, r.RuleKind, r.Metric, r.LowerBound, r.UpperBound, r.Unit, r.ResultLabel, r.Boundary, r.SortOrder, r.Note)).ToList());
}

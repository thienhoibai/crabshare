using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Parties;

/// <summary>Admin xem và đặt tham số nền tảng (BR-217). Mỗi lần đặt là một giá trị mới có ngày hiệu lực; giá trị cũ giữ nguyên (BR-218).</summary>
public sealed class ParameterAdminService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit, PlatformParameters parameters)
{
    /// <summary>Giá trị đang hiệu lực của mọi khoá, kèm các giá trị đã hẹn ngày trong tương lai.</summary>
    public async Task<IReadOnlyList<ParameterValueResponse>> ListAsync(bool includeHistory, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var rows = await db.PlatformParameters.AsNoTracking().OrderBy(p => p.ParamKey).ThenByDescending(p => p.EffectiveFrom).ToListAsync(ct);
        var result = new List<ParameterValueResponse>();
        foreach (var group in rows.GroupBy(r => r.ParamKey))
        {
            var label = ParamKeys.Known.TryGetValue(group.Key, out var k) ? k.Label : group.Key;
            var current = group.FirstOrDefault(r => r.EffectiveFrom <= now);
            foreach (var row in group)
            {
                if (!includeHistory && row != current && row.EffectiveFrom <= now) continue;
                result.Add(new ParameterValueResponse(row.ParamKey, label, row.Value, row.EffectiveFrom, row.Note));
            }
        }
        return result;
    }

    public Task<ParameterValueResponse> SetAsync(ParameterChangeRequest req, CancellationToken ct)
        => db.InTransactionAsync(async () =>
        {
            if (!ParamKeys.Known.TryGetValue(req.Key, out var known))
                throw new BusinessRuleException("parameter.unknown_key", "Không có tham số này.");
            if (req.Value < known.Min || req.Value > known.Max)
                throw new BusinessRuleException("parameter.out_of_range", $"Giá trị phải từ {known.Min} tới {known.Max}.");
            var now = clock.GetUtcNow();
            if (req.EffectiveFrom < now.AddMinutes(-1))
                throw new BusinessRuleException("parameter.past_effective", "Ngày hiệu lực không được ở quá khứ (BR-218).");
            await audit.LockAsync(ct);
            var before = await parameters.GetAsync(req.Key, req.EffectiveFrom, ct);
            var row = new PlatformParameter
            {
                ParamKey = req.Key, Value = req.Value, EffectiveFrom = req.EffectiveFrom, Note = req.Note?.Trim(),
                CreatedBy = me.UserId, CreatedAt = now,
            };
            db.PlatformParameters.Add(row);
            await db.SaveChangesAsync(ct);
            await audit.WriteAsync("platform_parameter", row.ParameterId, "set", new { req.Key, Value = before },
                new { req.Key, req.Value, req.EffectiveFrom }, ct);
            return new ParameterValueResponse(row.ParamKey, known.Label, row.Value, row.EffectiveFrom, row.Note);
        }, ct);

    /// <summary>Các tham số web và mobile cần để hiển thị (thời gian giữ đơn, tỷ lệ cọc, số con tối thiểu, hạn đổi trả).</summary>
    public async Task<IReadOnlyDictionary<string, decimal>> PublicAsync(CancellationToken ct)
    {
        var all = await parameters.SnapshotAsync(null, ct);
        string[] shown = [ParamKeys.PlatformFeeRatePct, ParamKeys.MinContributionVnd, ParamKeys.ContributionHoldMinutes, ParamKeys.OrderHoldMinutes,
            ParamKeys.DepositRatePct, ParamKeys.MinOrderCrabs, ParamKeys.ReturnWindowHours, ParamKeys.BalancePaymentHours];
        return shown.Where(all.ContainsKey).ToDictionary(k => k, k => all[k]);
    }
}

using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

public sealed class FeeTierService(AppDbContext db, ICurrentUser me, TimeProvider clock, IAuditLog audit)
{
    private async Task AdminAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.PlatformAdmin) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active" && u.AppUserRoles.Any(r => r.RoleCode == Roles.PlatformAdmin), ct))
            throw new ForbiddenException("fees.admin_required", "Chỉ quản trị viên đang có quyền được cấu hình phí.");
    }
    public async Task<IReadOnlyList<FeeTierResponse>> ListAsync(CancellationToken ct)
    {
        await AdminAsync(ct); return (await db.FeeTiers.AsNoTracking().OrderBy(t => t.MinCapital).ThenBy(t => t.EffectiveFrom).ToListAsync(ct)).Select(Response).ToList();
    }
    public Task<FeeTierResponse> SaveAsync(long? id, FeeTierRequest req, CancellationToken ct) => db.InTransactionAsync(async () =>
    {
        await audit.LockAsync(ct); await AdminAsync(ct); BatchService.Validate(req);
        var tier = id is null ? new FeeTier { CreatedAt = clock.GetUtcNow() } : await db.FeeTiers.SingleOrDefaultAsync(t => t.FeeTierId == id, ct)
            ?? throw new NotFoundException("fees.not_found", "Không tìm thấy bậc phí.");
        var before = id is null ? null : Response(tier);
        var candidates = await db.FeeTiers.Where(t => t.FeeTierId != id && (req.EffectiveTo == null || t.EffectiveFrom <= req.EffectiveTo) &&
            (t.EffectiveTo == null || t.EffectiveTo >= req.EffectiveFrom)).ToListAsync(ct);
        if (candidates.Any(t => Overlaps(t, req)))
            throw new BusinessRuleException("fees.overlap", "Khoảng vốn và ngày hiệu lực chồng với bậc phí khác. Điều chỉnh cận hoặc kết thúc hiệu lực bậc cũ trước.");
        tier.TierCode = req.TierCode.Trim(); tier.MinCapital = req.MinCapital; tier.MaxCapital = req.MaxCapital;
        tier.MinInclusive = req.MinInclusive; tier.MaxInclusive = req.MaxInclusive; tier.FeeAmount = req.FeeAmount;
        tier.EffectiveFrom = req.EffectiveFrom; tier.EffectiveTo = req.EffectiveTo;
        if (id is null) db.FeeTiers.Add(tier);
        await db.SaveChangesAsync(ct);
        var after = Response(tier); await audit.WriteAsync("fee_tier", tier.FeeTierId, id is null ? "create" : "update", before, after, ct); return after;
    }, ct, IsolationLevel.Serializable);
    private static bool Overlaps(FeeTier t, FeeTierRequest r)
    {
        var lower = Math.Max(t.MinCapital, r.MinCapital);
        var upper = Math.Min(t.MaxCapital ?? decimal.MaxValue, r.MaxCapital ?? decimal.MaxValue);
        return lower < upper || (lower == upper &&
            (lower > t.MinCapital || t.MinInclusive) && (t.MaxCapital is null || lower < t.MaxCapital || t.MaxInclusive) &&
            (lower > r.MinCapital || r.MinInclusive) && (r.MaxCapital is null || lower < r.MaxCapital || r.MaxInclusive));
    }
    private static FeeTierResponse Response(FeeTier t) => new(t.FeeTierId, t.TierCode, (long)t.MinCapital, t.MaxCapital is null ? null : (long)t.MaxCapital,
        t.MinInclusive, t.MaxInclusive, (long)t.FeeAmount, t.EffectiveFrom, t.EffectiveTo);
}


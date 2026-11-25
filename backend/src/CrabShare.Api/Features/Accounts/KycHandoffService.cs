using System.Data;
using System.Security.Cryptography;
using System.Text;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Accounts;

public sealed class KycHandoffService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    public async Task<KycHandoffCreatedResponse> CreateAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.Investor))
            throw new ForbiddenException("auth.investor_only", "Chỉ nhà đầu tư mới có thể bắt đầu xác minh danh tính.");

        if (!await db.Investors.AnyAsync(i => i.UserId == me.UserId, ct))
            throw new NotFoundException("kyc.investor_not_found", "Không tìm thấy hồ sơ nhà đầu tư.");

        var token = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var tokenHash = HashToken(token);
        long handoffId = 0;
        DateTimeOffset expires = default;
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            // A transient SQL failure may retry this delegate. Clear entities from a rolled-back attempt,
            // then use the unique token hash to recognize a transaction whose commit already succeeded.
            db.ChangeTracker.Clear();
            var existing = await db.KycHandoffs.AsNoTracking()
                .Where(h => h.TokenHash == tokenHash)
                .Select(h => new { h.HandoffId, h.ExpiresAt })
                .SingleOrDefaultAsync(ct);
            if (existing is not null)
            {
                handoffId = existing.HandoffId;
                expires = existing.ExpiresAt;
                return;
            }

            var now = clock.GetUtcNow();
            expires = now.Add(Lifetime);
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            await db.KycHandoffs.Where(h => h.UserId == me.UserId && h.Status == "Pending")
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(h => h.Status, "Cancelled")
                    .SetProperty(h => h.CancelledAt, now), ct);
            await db.KycHandoffs.Where(h => h.UserId == me.UserId && h.CreatedAt < now.AddDays(-1))
                .ExecuteDeleteAsync(ct);
            var handoff = new KycHandoff
            {
                UserId = me.UserId,
                TokenHash = tokenHash,
                Status = "Pending",
                CreatedAt = now,
                ExpiresAt = expires,
            };
            db.KycHandoffs.Add(handoff);
            await db.SaveChangesAsync(ct);
            handoffId = handoff.HandoffId;
            await transaction.CommitAsync(ct);
        });

        return new(handoffId, token, expires);
    }

    public async Task<KycHandoffStatusResponse> GetAsync(long id, CancellationToken ct)
    {
        var handoff = await db.KycHandoffs.AsNoTracking()
                          .SingleOrDefaultAsync(h => h.HandoffId == id && h.UserId == me.UserId, ct)
                      ?? throw new NotFoundException("kyc.handoff_not_found", "Không tìm thấy phiên xác minh.");
        if (handoff.Status == "Pending" && handoff.ExpiresAt <= clock.GetUtcNow())
        {
            await db.KycHandoffs.Where(h => h.HandoffId == id && h.UserId == me.UserId && h.Status == "Pending")
                .ExecuteUpdateAsync(setters => setters.SetProperty(h => h.Status, "Expired"), ct);
            handoff = await db.KycHandoffs.AsNoTracking().SingleAsync(h => h.HandoffId == id, ct);
        }
        return ToResponse(handoff);
    }

    public async Task<KycHandoffStatusResponse> CancelAsync(long id, CancellationToken ct)
    {
        var handoff = await db.KycHandoffs.AsNoTracking()
                          .SingleOrDefaultAsync(h => h.HandoffId == id && h.UserId == me.UserId, ct)
                      ?? throw new NotFoundException("kyc.handoff_not_found", "Không tìm thấy phiên xác minh.");
        if (handoff.Status == "Pending")
        {
            var now = clock.GetUtcNow();
            if (handoff.ExpiresAt <= now)
            {
                await db.KycHandoffs.Where(h => h.HandoffId == id && h.UserId == me.UserId && h.Status == "Pending")
                    .ExecuteUpdateAsync(setters => setters.SetProperty(h => h.Status, "Expired"), ct);
            }
            else
            {
                var updated = await db.KycHandoffs
                    .Where(h => h.HandoffId == id && h.UserId == me.UserId && h.Status == "Pending" && h.ExpiresAt > now)
                    .ExecuteUpdateAsync(setters => setters
                        .SetProperty(h => h.Status, "Cancelled")
                        .SetProperty(h => h.CancelledAt, now), ct);
                if (updated == 1) return new(handoff.HandoffId, "Cancelled", handoff.ExpiresAt, handoff.ClaimedAt);
            }

            handoff = await db.KycHandoffs.AsNoTracking().SingleAsync(h => h.HandoffId == id, ct);
        }

        if (handoff.Status == "Claimed")
            throw new ConflictException("kyc.handoff_already_claimed", "Ứng dụng đã nhận mã này. Hãy tiếp tục xác minh trên điện thoại.");
        return ToResponse(handoff);
    }

    public async Task<KycHandoffStatusResponse> ClaimAsync(string token, CancellationToken ct)
    {
        if (!me.IsAuthenticated)
            throw new AppException(StatusCodes.Status401Unauthorized, "auth.required", "Bạn cần đăng nhập để tiếp tục xác minh.");

        var hash = HashToken(token);
        var handoff = await db.KycHandoffs.AsNoTracking().SingleOrDefaultAsync(h => h.TokenHash == hash, ct)
                      ?? throw new NotFoundException("kyc.handoff_not_found", "Mã QR không hợp lệ hoặc đã được thay mới.");

        if (handoff.UserId != me.UserId)
            throw AccountMismatch();

        var now = clock.GetUtcNow();
        if (handoff.Status == "Pending" && handoff.ExpiresAt <= now)
        {
            await db.KycHandoffs.Where(h => h.HandoffId == handoff.HandoffId && h.Status == "Pending")
                .ExecuteUpdateAsync(setters => setters.SetProperty(h => h.Status, "Expired"), ct);
            throw Expired();
        }
        if (handoff.Status == "Expired") throw Expired();
        if (handoff.Status == "Cancelled")
            throw new ConflictException("kyc.handoff_cancelled", "Mã QR đã bị huỷ. Hãy tạo mã mới trên web.");
        if (handoff.Status == "Claimed") return ToResponse(handoff);

        var claimedAt = now;
        var updated = await db.KycHandoffs
            .Where(h => h.HandoffId == handoff.HandoffId && h.Status == "Pending" && h.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(h => h.Status, "Claimed")
                .SetProperty(h => h.ClaimedAt, claimedAt), ct);

        if (updated == 1)
            return new(handoff.HandoffId, "Claimed", handoff.ExpiresAt, claimedAt);

        var latest = await db.KycHandoffs.AsNoTracking().SingleAsync(h => h.HandoffId == handoff.HandoffId, ct);
        if (latest.Status == "Claimed") return ToResponse(latest);
        if (latest.Status == "Pending" && latest.ExpiresAt <= clock.GetUtcNow())
        {
            await db.KycHandoffs.Where(h => h.HandoffId == latest.HandoffId && h.Status == "Pending")
                .ExecuteUpdateAsync(setters => setters.SetProperty(h => h.Status, "Expired"), ct);
            throw Expired();
        }
        if (latest.Status == "Cancelled")
            throw new ConflictException("kyc.handoff_cancelled", "Mã QR đã bị huỷ. Hãy tạo mã mới trên web.");
        throw new ConflictException("kyc.handoff_not_pending", "Mã QR không còn chờ xác nhận. Hãy tạo mã mới trên web.");
    }

    private static string HashToken(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static KycHandoffStatusResponse ToResponse(KycHandoff handoff)
        => new(handoff.HandoffId, handoff.Status, handoff.ExpiresAt, handoff.ClaimedAt);

    private static ForbiddenException AccountMismatch()
        => new("kyc.handoff_account_mismatch", "Mã QR này thuộc tài khoản khác. Hãy đăng nhập đúng tài khoản CrabShare đã tạo mã.");

    private static BusinessRuleException Expired()
        => new("kyc.handoff_expired", "Mã QR đã hết hạn. Hãy tạo mã mới trên web.");
}

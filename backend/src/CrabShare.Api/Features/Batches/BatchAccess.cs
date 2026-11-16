using System.Security.Cryptography;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Batches;

/// <summary>Quyền vận hành Lô dùng chung cho các nhóm sau G1: chủ hộ nuôi vận hành Lô, hoặc Admin (thao tác thay CrabShare ở lô T).</summary>
public sealed class BatchAccess(AppDbContext db, ICurrentUser me)
{
    /// <summary>Lô mà người gọi được vận hành; khoá dòng Lô nếu <paramref name="lockRow"/>.</summary>
    public async Task<Batch> OperateAsync(string code, CancellationToken ct, bool lockRow = false)
    {
        var batch = lockRow
            ? await db.Batches.FromSqlInterpolated($"SELECT * FROM dbo.batch WITH (UPDLOCK, HOLDLOCK) WHERE batch_code = {code}").SingleOrDefaultAsync(ct)
            : await db.Batches.SingleOrDefaultAsync(b => b.BatchCode == code, ct);
        if (batch is null) throw new NotFoundException("batch.not_found", "Không tìm thấy Lô.");
        await RequireOperatorAsync(batch, ct);
        return batch;
    }

    public async Task RequireOperatorAsync(Batch batch, CancellationToken ct)
    {
        if (me.IsInRole(Roles.PlatformAdmin)) return;
        var userId = me.UserId;
        var owner = await db.OperatorMembers.AnyAsync(m => m.UserId == userId && m.OperatorId == batch.OperatorId && m.MemberRole == "Owner" &&
                                                           m.User.Status == "Active", ct);
        if (!owner || (me.OperatorId is { } claimed && claimed != batch.OperatorId))
            throw new ForbiddenException("batch.not_operator", "Bạn không vận hành Lô này.");
    }

    /// <summary>Đọc dữ liệu vận hành: hộ nuôi của Lô hoặc Admin.</summary>
    public async Task RequireOperatorOrAdminReadAsync(Batch batch, CancellationToken ct)
    {
        if (me.IsInRole(Roles.PlatformAdmin) || me.IsInRole(Roles.QcInspector)) return;
        if (me.OperatorId == batch.OperatorId) return;
        if (await db.OperatorMembers.AnyAsync(m => m.UserId == me.UserId && m.OperatorId == batch.OperatorId, ct)) return;
        throw new ForbiddenException("batch.not_operator", "Bạn không vận hành Lô này.");
    }
}

/// <summary>Mã nghiệp vụ ngẫu nhiên dễ đọc (Crockford base32, không có I, L, O, U).</summary>
public static class Codes
{
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    public static string New(string prefix, int randomLength) => prefix + new string(RandomNumberGenerator.GetItems<char>(Alphabet, randomLength));
}

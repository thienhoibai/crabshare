using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Features.Accounts;

internal static class AccountAuditWriter
{
    // Gọi bên trong transaction. Dùng cùng định dạng hash với eKYC; không ghi số tài khoản/tên người nhận.
    public static void Append(AppDbContext db, long actorId, string entityType, long entityId, string action,
        string? oldValue, string newValue, DateTimeOffset now, string? previousHash)
    {
        var audit = new AuditLog { EntityType = entityType, EntityId = entityId, ActionType = action,
            OldValue = oldValue, NewValue = newValue, ActorUserId = actorId, OccurredAt = now, PrevHash = previousHash };
        audit.RowHash = AuditChain.Hash(audit);
        db.AuditLogs.Add(audit);
    }
}

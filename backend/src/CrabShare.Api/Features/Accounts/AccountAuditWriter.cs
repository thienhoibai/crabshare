using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Accounts;

internal static class AccountAuditWriter
{
    // Gọi bên trong transaction. Dùng cùng định dạng hash với eKYC; không ghi số tài khoản/tên người nhận.
    public static async Task AppendAsync(AppDbContext db, long actorId, string entityType, long entityId, string action,
        string? oldValue, string newValue, DateTimeOffset now, CancellationToken ct)
    {
        var previousHash = await db.AuditLogs.FromSqlRaw("SELECT * FROM dbo.audit_log WITH (UPDLOCK, HOLDLOCK)")
            .OrderByDescending(a => a.AuditId).Select(a => a.RowHash).FirstOrDefaultAsync(ct);
        var audit = new AuditLog { EntityType = entityType, EntityId = entityId, ActionType = action,
            OldValue = oldValue, NewValue = newValue, ActorUserId = actorId, OccurredAt = now, PrevHash = previousHash };
        var content = JsonSerializer.Serialize(new { audit.EntityType, audit.EntityId, audit.ActionType,
            audit.OldValue, audit.NewValue, audit.ActorUserId, audit.OccurredAt });
        audit.RowHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((previousHash ?? "") + content)));
        db.AuditLogs.Add(audit);
    }
}

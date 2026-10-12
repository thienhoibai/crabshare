using CrabShare.Api.Common.Auth;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Common.Auditing;

/// <summary>Bản cài IAuditLog theo đúng giao thức AuditChain: khoá TABLOCKX + HOLDLOCK, JSON camelCase, SHA-256 hex chữ thường.</summary>
public sealed class AuditLogService(AppDbContext db, ICurrentUser me, TimeProvider clock) : IAuditLog
{
    public Task LockAsync(CancellationToken ct) => AuditChain.LockAndReadTailAsync(db, ct);

    public Task WriteAsync(string entityType, long entityId, string action, object? oldValue, object? newValue, CancellationToken ct)
        => WriteAsync(entityType, entityId, action, oldValue, newValue, clock.GetUtcNow(), ct);

    public async Task WriteAsync(string entityType, long entityId, string action, object? oldValue, object? newValue,
        DateTimeOffset occurredAt, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException(
                "Ghi audit phải nằm trong transaction: bọc thao tác bằng db.InTransactionAsync(...) (xem Features/Admin/README.md).");
        // Lưu thay đổi đang chờ trước (kể cả dòng audit ghi theo cách khác) để đọc đúng đầu chuỗi
        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync(ct);

        var row = new AuditLog
        {
            EntityType = entityType,
            EntityId = entityId,
            ActionType = action,
            OldValue = ToJson(oldValue),
            NewValue = ToJson(newValue),
            ActorUserId = me.IsAuthenticated ? me.UserId : null,
            OccurredAt = AuditChain.Timestamp(occurredAt),
            PrevHash = await AuditChain.LockAndReadTailAsync(db, ct),
        };
        row.RowHash = AuditChain.Hash(row);
        db.AuditLogs.Add(row);
        // Lưu ngay: lần ghi kế tiếp trong cùng transaction phải đọc được dòng này làm đầu chuỗi
        await db.SaveChangesAsync(ct);
    }

    public async Task<AuditChainResult> VerifyChainAsync(long? fromAuditId, long? toAuditId, CancellationToken ct)
    {
        var from = fromAuditId ?? long.MinValue;
        var to = toAuditId ?? long.MaxValue;
        var previousRowHash = await db.AuditLogs.AsNoTracking()
            .Where(a => a.AuditId < from)
            .OrderByDescending(a => a.AuditId)
            .Select(a => a.RowHash)
            .FirstOrDefaultAsync(ct);
        var rows = await db.AuditLogs.AsNoTracking()
            .Where(a => a.AuditId >= from && a.AuditId <= to)
            .OrderBy(a => a.AuditId)
            .ToListAsync(ct);
        return AuditChainVerifier.Verify(rows, previousRowHash);
    }

    private static string? ToJson(object? value) => value switch
    {
        null => null,
        string json => json,
        _ => AuditChain.Snapshot(value),
    };
}

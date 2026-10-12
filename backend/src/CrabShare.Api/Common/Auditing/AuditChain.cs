using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Common.Auditing;

/// <summary>Giao thức audit theo CS-25: khoá đầu chuỗi trước nghiệp vụ, JSON camelCase, SHA-256 hex chữ thường.</summary>
public static class AuditChain
{
    private static readonly JsonSerializerOptions SnapshotOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static string Snapshot<T>(T value) => JsonSerializer.Serialize(value, SnapshotOptions);
    public static DateTimeOffset Timestamp(DateTimeOffset value) => DateTimeOffset.FromUnixTimeMilliseconds(value.ToUnixTimeMilliseconds());

    // Gọi ngay sau BeginTransaction, trước khi đọc/sửa entity nghiệp vụ. Giữ khoá đến commit/rollback.
    public static async Task<string?> LockAndReadTailAsync(AppDbContext db, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Audit tail must be locked inside a transaction.");
        var tail = await db.AuditLogs.FromSqlRaw(
            "SELECT TOP (1) * FROM dbo.audit_log WITH (TABLOCKX, HOLDLOCK) ORDER BY audit_id DESC")
            .AsNoTracking().ToListAsync(ct);
        return tail.SingleOrDefault()?.RowHash;
    }

    public static string Hash(AuditLog row)
    {
        // Thứ tự trường và serializer mặc định giống hệt OperatorReviewService ở nhánh CS-25.
        var content = JsonSerializer.Serialize(new
        {
            entityType = row.EntityType, entityId = row.EntityId, actionType = row.ActionType,
            oldValue = row.OldValue, newValue = row.NewValue,
            actorUserId = row.ActorUserId, occurredAt = row.OccurredAt,
        });
        return Digest(row.PrevHash, content);
    }

    // Bản ghi Accounts cũ dùng PascalCase. Chỉ xác minh, không viết lại hash/lịch sử đã có.
    public static bool VerifyHash(AuditLog row)
    {
        if (string.Equals(Hash(row), row.RowHash, StringComparison.Ordinal)) return true;
        var legacyContent = JsonSerializer.Serialize(new
        {
            row.EntityType, row.EntityId, row.ActionType, row.OldValue,
            row.NewValue, row.ActorUserId, row.OccurredAt,
        });
        return string.Equals(Digest(row.PrevHash, legacyContent), row.RowHash, StringComparison.Ordinal);
    }

    private static string Digest(string? previous, string content)
        => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes((previous ?? "") + content)));
}

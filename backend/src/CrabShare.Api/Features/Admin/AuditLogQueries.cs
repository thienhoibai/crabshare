using System.ComponentModel.DataAnnotations;
using System.Data;
using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Exports;
using CrabShare.Api.Common.Paging;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Admin;

public sealed class AuditLogQuery : IValidatableObject
{
    [StringLength(60)] public string? EntityType { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    [Range(0, long.MaxValue)] public long? ThroughAuditId { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (From > To || From?.Year < 1900 || To?.Year < 1900 || From?.Year >= 9999 || To?.Year >= 9999)
            yield return new("Khoảng ngày không hợp lệ (năm 1900–9998, từ ngày không sau đến ngày).", [nameof(From), nameof(To)]);
    }
}
public sealed record AuditLogRow(long AuditId, string EntityType, long EntityId, string ActionType, string? OldValue,
    string? NewValue, long? ActorUserId, DateTimeOffset OccurredAt, string? PrevHash, string RowHash);
public sealed record AuditLogPage(IReadOnlyList<AuditLogRow> Items, int Page, int PageSize, int Total, long ThroughAuditId, AuditChainResult Chain);
public sealed record AuditLogExport(byte[] Bytes, long ThroughAuditId, AuditChainResult Chain);

public sealed class AuditLogQueryService(AppDbContext db, ICurrentUser me, IAuditLog audit)
{
    public const int ExportLimit = 5000;
    private Task<T> ReadAsync<T>(Func<Task<T>> read, CancellationToken ct) => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        if (!me.IsInRole(Roles.PlatformAdmin) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active"
            && u.AppUserRoles.Any(r => r.RoleCode == Roles.PlatformAdmin), ct))
            throw new ForbiddenException("audit.admin_required", "Chỉ quản trị đang có quyền mới được xem nhật ký kiểm toán.");
        var result = await read(); await transaction.CommitAsync(ct); return result;
    });

    public Task<AuditLogPage> ListAsync(AuditLogQuery query, PageQuery paging, CancellationToken ct) => ReadAsync<AuditLogPage>(async () =>
    {
        var boundary = await BoundaryAsync(query.ThroughAuditId, ct);
        var page = await Rows(Filtered(query, boundary).OrderByDescending(a => a.AuditId)).ToPagedAsync(paging, ct);
        return new(page.Items, page.Page, page.PageSize, page.Total, boundary, await VerifyAsync(boundary, ct));
    }, ct);

    public Task<AuditLogExport> ExportAsync(AuditLogQuery query, CancellationToken ct) => ReadAsync<AuditLogExport>(async () =>
    {
        var boundary = await BoundaryAsync(query.ThroughAuditId, ct);
        var source = Filtered(query, boundary);
        if (await source.CountAsync(ct) > ExportLimit)
            throw new AppException(400, "audit.export_too_large", $"Tối đa {ExportLimit:N0} dòng mỗi lần xuất. Hãy thu hẹp bộ lọc ngày hoặc loại đối tượng.");
        var chain = await VerifyAsync(boundary, ct);
        var rows = await Rows(source.OrderBy(a => a.AuditId)).ToListAsync(ct);
        List<IEnumerable<object?>> csv = [
            new object?[] { "Chuỗi hợp lệ", chain.IsValid }, new object?[] { "Kiểm tra toàn chuỗi đến audit_id", boundary },
            new object?[] { "Số dòng đã kiểm tra", chain.CheckedRows }, new object?[] { "Dòng gãy đầu tiên", chain.BrokenAuditId },
            new object?[] { "Lý do", chain.Problem }, Array.Empty<object?>(),
            new object?[] { "audit_id", "entity_type", "entity_id", "action_type", "old_value", "new_value", "actor_user_id", "occurred_at", "prev_hash", "row_hash" },
        ];
        csv.AddRange(rows.Select(a => new object?[] { a.AuditId, a.EntityType, a.EntityId, a.ActionType, a.OldValue, a.NewValue, a.ActorUserId, a.OccurredAt.ToString("O"), a.PrevHash, a.RowHash }));
        return new(CsvExport.Encode(csv), boundary, chain);
    }, ct);

    private async Task<long> BoundaryAsync(long? requested, CancellationToken ct)
    {
        var tail = await db.AuditLogs.MaxAsync(a => (long?)a.AuditId, ct) ?? 0;
        if (requested > tail) throw new AppException(400, "audit.invalid_boundary", "Mốc nhật ký không còn tồn tại. Hãy làm mới.");
        return requested ?? tail;
    }
    private IQueryable<AuditLog> Filtered(AuditLogQuery query, long boundary)
    {
        var rows = db.AuditLogs.AsNoTracking().Where(a => a.AuditId <= boundary);
        if (!string.IsNullOrWhiteSpace(query.EntityType)) rows = rows.Where(a => a.EntityType == query.EntityType.Trim());
        if (query.From is { } from) { var start = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)); rows = rows.Where(a => a.OccurredAt >= start); }
        if (query.To is { } to) { var end = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)); rows = rows.Where(a => a.OccurredAt < end); }
        return rows;
    }
    private async Task<AuditChainResult> VerifyAsync(long boundary, CancellationToken ct)
    {
        // Verify the entire observed prefix regardless of UI filters. Chunking bounds JSON memory.
        var checkedRows = 0; long cursor = 0;
        while (cursor < boundary)
        {
            var ids = await db.AuditLogs.Where(a => a.AuditId > cursor && a.AuditId <= boundary).OrderBy(a => a.AuditId).Select(a => a.AuditId).Take(1000).ToListAsync(ct);
            if (ids.Count == 0) break;
            var check = await audit.VerifyChainAsync(ids[0], ids[^1], ct);
            checkedRows = checked(checkedRows + check.CheckedRows);
            if (!check.IsValid) return AuditChainResult.Broken(check.BrokenAuditId!.Value, checkedRows, check.Problem!);
            cursor = ids[^1];
        }
        return AuditChainResult.Valid(checkedRows);
    }
    private static IQueryable<AuditLogRow> Rows(IQueryable<AuditLog> rows) => rows.Select(a => new AuditLogRow(a.AuditId, a.EntityType, a.EntityId,
        a.ActionType, a.OldValue, a.NewValue, a.ActorUserId, a.OccurredAt, a.PrevHash, a.RowHash));
}

using System.Text.Json;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Paging;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Alerts;

public sealed partial class AlertService
{
    public async Task<PagedResult<AlertResponse>> ListAdminAsync(AdminAlertFilter filter, PageQuery paging, CancellationToken ct)
    {
        await RequireRoleAsync(Roles.PlatformAdmin, ct);
        var query = db.Alerts.AsNoTracking();
        if (filter.Status is not null) query = query.Where(a => a.Status == filter.Status);
        if (filter.Severity is not null) query = query.Where(a => a.Severity == filter.Severity);
        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var text = filter.Q.Trim(); var id = long.TryParse(text, out var parsed) ? parsed : -1;
            query = query.Where(a => a.AlertId == id || a.Batch.BatchCode.Contains(text) || a.Batch.Operator.LegalName.Contains(text) || a.Message.Contains(text));
        }
        var page = await query.OrderByDescending(a => a.EscalatedAt).ThenByDescending(a => a.AlertId)
            .Select(a => new AlertResponse(a.AlertId, a.Batch.BatchCode, a.Batch.Operator.LegalName, a.AlertType, a.Severity,
                a.Message, a.RaisedAt, a.AckDeadline, a.Status, a.AcknowledgedAt, a.AcknowledgedBy, a.ResponseNote, a.EscalatedAt, null))
            .ToPagedAsync(paging, ct);
        // Không ghi đè phản hồi hộ nuôi. Kết quả xử lý quản trị được lưu bền trong audit.
        var resolvedIds = page.Items.Where(a => a.Status == "Resolved").Select(a => a.Id).ToArray();
        var decisions = await db.AuditLogs.AsNoTracking().Where(a => a.EntityType == "Alert" && a.ActionType == "ResolveAlert" && resolvedIds.Contains(a.EntityId))
            .OrderByDescending(a => a.AuditId).Select(a => new { a.EntityId, a.NewValue }).ToListAsync(ct);
        var notes = decisions.GroupBy(a => a.EntityId).ToDictionary(g => g.Key, g => ResolutionNote(g.First().NewValue));
        return page with { Items = page.Items.Select(a => a with { ResolutionNote = notes.GetValueOrDefault(a.Id) }).ToList() };
    }

    public Task<AlertResponse> ResolveAsync(long id, string note, CancellationToken ct)
    {
        ValidateNote(note);
        return TransactionAsync(async previous =>
        {
            await RequireRoleAsync(Roles.PlatformAdmin, ct);
            var alert = await db.Alerts.Include(a => a.Batch).ThenInclude(b => b.Operator).SingleOrDefaultAsync(a => a.AlertId == id, ct) ?? throw Missing();
            if (alert.Status == "Resolved") throw new ConflictException("alerts.status_changed", "Cảnh báo đã được đóng. Vui lòng tải lại.");
            var old = Snapshot(alert); alert.Status = "Resolved"; alert.UpdatedAt = Now();
            AppendAudit(alert, "ResolveAlert", old, previous, note.Trim());
            await db.SaveChangesAsync(ct);
            return Response(alert) with { ResolutionNote = note.Trim() };
        }, ct);
    }

    private static string? ResolutionNote(string? value)
    {
        if (value is null) return null;
        using var json = JsonDocument.Parse(value);
        return json.RootElement.TryGetProperty("resolutionNote", out var note) ? note.GetString() : null;
    }
}

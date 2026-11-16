using System.Data;
using CrabShare.Api.Common.Auth;
using CrabShare.Api.Common.Errors;
using CrabShare.Api.Common.Exports;
using CrabShare.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Features.Admin;

public sealed class DashboardService(AppDbContext db, ICurrentUser me, TimeProvider clock)
{
    private Task<T> ReadAsync<T>(Func<Task<T>> read, CancellationToken ct) => db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var result = await read();
        await transaction.CommitAsync(ct);
        return result;
    });

    public Task<AdminDashboardResponse> AdminAsync(DashboardQuery query, CancellationToken ct) => ReadAsync<AdminDashboardResponse>(async () =>
    {
        var now = clock.GetUtcNow(); var range = query.Range(now);
        await RequireAdminAsync(ct);
        // Actual currently-confirmed receipts only, grouped in Vietnam calendar days in SQL.
        var contributions = db.Contributions.AsNoTracking().Where(c => c.Status == "Confirmed" && c.ConfirmedAt >= range.Start && c.ConfirmedAt < range.End && c.ConfirmedAt <= now);
        var capital = await contributions.GroupBy(c => EF.Functions.AtTimeZone(c.ConfirmedAt!.Value, "SE Asia Standard Time").Date)
            .Select(g => new { Date = g.Key, Amount = g.Sum(c => c.Amount), Count = g.Count() }).OrderBy(g => g.Date).ToListAsync(ct);
        var days = capital.Select(d => new CapitalDay(DateOnly.FromDateTime(d.Date), checked((long)d.Amount), d.Count)).ToDictionary(d => d.Date);
        var series = Enumerable.Range(0, range.To.DayNumber - range.From.DayNumber + 1)
            .Select(i => range.From.AddDays(i)).Select(day => days.GetValueOrDefault(day) ?? new CapitalDay(day, 0, 0)).ToList();
        var batches = await db.Batches.AsNoTracking().GroupBy(b => b.Status).OrderBy(g => g.Key).Select(g => new StatusCount(g.Key, g.Count())).ToListAsync(ct);
        var escalated = db.Alerts.AsNoTracking().Where(a => a.Status == "Escalated");
        var alertCount = await escalated.CountAsync(ct);
        var alerts = await escalated.OrderByDescending(a => a.EscalatedAt).ThenByDescending(a => a.AlertId).Take(5)
            .Select(a => new DashboardAlert(a.AlertId, a.Batch.BatchCode, a.Batch.Operator.LegalName, a.Severity, a.Message, a.RaisedAt)).ToListAsync(ct);
        var orders = await db.SalesOrders.AsNoTracking().Where(o => o.PlacedAt >= range.Start && o.PlacedAt < range.End && o.PlacedAt <= now)
            .GroupBy(o => o.Status).OrderBy(g => g.Key).Select(g => new StatusCount(g.Key, g.Count())).ToListAsync(ct);
        var revenue = await db.SalesOrders.AsNoTracking().Where(o => o.Status == "Completed" && o.CompletedAt >= range.Start && o.CompletedAt < range.End && o.CompletedAt <= now).SumAsync(o => (decimal?)o.TotalAmount, ct) ?? 0;
        var payouts = await db.PaymentInstructions.AsNoTracking().Where(p => p.InstructionType == "Payout" && p.CreatedAt >= range.Start && p.CreatedAt < range.End && p.CreatedAt <= now)
            .GroupBy(p => p.Status).OrderBy(g => g.Key).Select(g => new PayoutStatus(g.Key, g.Count(), (long)g.Sum(p => p.Amount))).ToListAsync(ct);
        var succeeded = await db.PaymentInstructions.AsNoTracking().Where(p => p.InstructionType == "Payout" && p.Status == "Succeeded" && p.CompletedAt >= range.Start && p.CompletedAt < range.End && p.CompletedAt <= now)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0;
        return new(range.From, range.To, now, series.Sum(d => d.Amount), series.Sum(d => d.Count), await db.AppUsers.CountAsync(ct), series, batches,
            alertCount, alerts, orders, checked((long)revenue), payouts, checked((long)succeeded));
    }, ct);

    public Task<OperatorDashboardResponse> OperatorAsync(DashboardQuery query, CancellationToken ct) => ReadAsync<OperatorDashboardResponse>(async () =>
    {
        var now = clock.GetUtcNow(); var range = query.Range(now);
        var today = DateOnly.FromDateTime(now.ToOffset(TimeSpan.FromHours(7)).DateTime);
        if (!me.IsInRole(Roles.OperatorMember)) throw Denied();
        var member = await db.OperatorMembers.AsNoTracking().Where(m => m.UserId == me.UserId && m.User.Status == "Active"
            && m.User.AppUserRoles.Any(r => r.RoleCode == Roles.OperatorMember) && m.Operator.Status == "Approved")
            .Select(m => new { m.OperatorId, m.Operator.LegalName }).SingleOrDefaultAsync(ct);
        if (member is null || me.OperatorId is { } claimed && claimed != member.OperatorId) throw Denied();
        var farmBatches = db.Batches.AsNoTracking().Where(b => b.OperatorId == member.OperatorId && (b.Status == "Stocked" || b.Status == "InProduction" || b.Status == "Harvesting"));
        var batches = await farmBatches.OrderBy(b => b.BatchCode).Select(b => new FarmDashboardBatch(b.BatchCode, b.Title, b.Status,
            b.CrabItems.Count(c => c.Status == "Growing"), b.ExpectedOutputKg, b.Alerts.Count(a => a.Status == "Open" || a.Status == "Escalated"),
            b.ProductionLogs.Any(l => l.LogDate == today))).ToListAsync(ct);
        if (query.BatchCode is not null && !batches.Any(b => b.BatchCode == query.BatchCode))
            throw new NotFoundException("dashboard.batch_not_found", "Không tìm thấy lô đang nuôi của bạn.");
        var selected = batches.Where(b => query.BatchCode is null || b.BatchCode == query.BatchCode).ToList();
        var scope = farmBatches.Where(b => query.BatchCode == null || b.BatchCode == query.BatchCode).Select(b => b.BatchId);
        var logs = db.ProductionLogs.AsNoTracking().Where(l => scope.Contains(l.BatchId) && l.LogDate >= range.From && l.LogDate <= range.To && l.ReceivedAt <= now);
        var environment = await logs.GroupBy(l => l.LogDate).OrderBy(g => g.Key).Select(g => new EnvironmentDay(g.Key, g.Average(l => l.Ph), g.Average(l => l.WaterTempC))).ToListAsync(ct);
        var recent = await logs.OrderByDescending(l => l.ReceivedAt).ThenByDescending(l => l.ProductionLogId).Take(5)
            .Select(l => new DashboardLog(l.ProductionLogId, l.Batch.BatchCode, l.LogDate, l.Ph, l.WaterTempC, l.SalinityPpt, l.FeedKg)).ToListAsync(ct);
        var requests = await db.CaptureRequests.CountAsync(r => scope.Contains(r.BatchId) && r.Status == "Open" && r.DueAt > now, ct);
        var packing = await db.SalesOrders.CountAsync(o => o.Batch.OperatorId == member.OperatorId && (query.BatchCode == null || o.Batch.BatchCode == query.BatchCode) && o.Status == "Paid", ct);
        var shipping = await db.SalesOrders.CountAsync(o => o.Batch.OperatorId == member.OperatorId && (query.BatchCode == null || o.Batch.BatchCode == query.BatchCode) && o.Status == "Packed", ct);
        return new(range.From, range.To, now, member.LegalName, query.BatchCode, batches, selected.Sum(b => b.AliveCount), selected.Sum(b => b.OpenAlerts), requests,
            selected.Count(b => b.Status == "InProduction" && !b.LoggedToday), packing, shipping, environment, recent);
    }, ct);

    public async Task<byte[]> ReportAsync(string name, DashboardQuery query, CancellationToken ct)
    {
        if (name is not ("capital" or "batches" or "orders" or "payouts")) throw new NotFoundException("reports.not_found", "Không có báo cáo này.");
        var data = await AdminAsync(query, ct);
        IEnumerable<IEnumerable<object?>> rows = name switch
        {
            "capital" => new[] { new object?[] { "Ngày (Việt Nam)", "Vốn xác nhận còn hiệu lực (VND)", "Số khoản góp" } }.Concat(data.CapitalByDay.Select(d => new object?[] { d.Date.ToString("yyyy-MM-dd"), d.Amount, d.Count })),
            "batches" => new[] { new object?[] { "Trạng thái lô (hiện tại)", "Số lô" } }.Concat(data.BatchesByStatus.Select(d => new object?[] { d.Status, d.Count })),
            "orders" => new[] { new object?[] { "Trạng thái đơn (đặt trong kỳ)", "Số đơn" } }.Concat(data.OrdersByStatus.Select(d => new object?[] { d.Status, d.Count })),
            _ => new[] { new object?[] { "Trạng thái lệnh Payout (tạo trong kỳ)", "Số lệnh", "Số tiền (VND)" } }.Concat(data.PayoutsByStatus.Select(d => new object?[] { d.Status, d.Count, d.Amount })),
        };
        return CsvExport.Encode(rows);
    }

    private async Task RequireAdminAsync(CancellationToken ct)
    {
        if (!me.IsInRole(Roles.PlatformAdmin) || !await db.AppUsers.AnyAsync(u => u.UserId == me.UserId && u.Status == "Active" && u.AppUserRoles.Any(r => r.RoleCode == Roles.PlatformAdmin), ct)) throw Denied();
    }
    private static ForbiddenException Denied() => new("dashboard.access_denied", "Bạn không có quyền xem báo cáo này.");
}

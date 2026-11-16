using System.ComponentModel.DataAnnotations;
using CrabShare.Api.Common.Errors;

namespace CrabShare.Api.Features.Admin;

public sealed class DashboardQuery
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    [StringLength(20)] public string? BatchCode { get; set; }

    public DashboardRange Range(DateTimeOffset now)
    {
        var today = DateOnly.FromDateTime(now.ToOffset(TimeSpan.FromHours(7)).DateTime);
        var to = To ?? today;
        if (to.Year < 1900 || to.Year >= 9999 || From?.Year < 1900)
            throw new AppException(400, "reports.invalid_range", "Ngày báo cáo phải trong khoảng năm 1900 đến 9998.");
        var from = From ?? to.AddDays(-29);
        if (to.Year >= 9999 || from > to || to.DayNumber - from.DayNumber > 365)
            throw new AppException(400, "reports.invalid_range", "Khoảng báo cáo phải từ 1 đến 366 ngày, ngày bắt đầu không sau ngày kết thúc.");
        return new(from, to, new(from.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)), new(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7)));
    }
}
public sealed record DashboardRange(DateOnly From, DateOnly To, DateTimeOffset Start, DateTimeOffset End);
public sealed record StatusCount(string Status, int Count);
public sealed record CapitalDay(DateOnly Date, long Amount, int Count);
public sealed record DashboardAlert(long Id, string BatchCode, string FarmName, string Severity, string Message, DateTimeOffset RaisedAt);
public sealed record PayoutStatus(string Status, int Count, long Amount);
public sealed record AdminDashboardResponse(DateOnly From, DateOnly To, DateTimeOffset AsOf, long ConfirmedCapital, int ConfirmedContributions,
    int TotalUsers, IReadOnlyList<CapitalDay> CapitalByDay, IReadOnlyList<StatusCount> BatchesByStatus,
    int EscalatedAlerts, IReadOnlyList<DashboardAlert> LatestEscalatedAlerts, IReadOnlyList<StatusCount> OrdersByStatus,
    long CompletedOrderRevenue, IReadOnlyList<PayoutStatus> PayoutsByStatus, long SucceededPayoutAmount);
public sealed record FarmDashboardBatch(string BatchCode, string Title, string Status, int AliveCount, decimal ExpectedOutputKg, int OpenAlerts, bool LoggedToday);
public sealed record EnvironmentDay(DateOnly Date, decimal? Ph, decimal? WaterTempC);
public sealed record DashboardLog(long Id, string BatchCode, DateOnly Date, decimal? Ph, decimal? WaterTempC, decimal? SalinityPpt, decimal? FeedKg);
public sealed record OperatorDashboardResponse(DateOnly From, DateOnly To, DateTimeOffset AsOf, string FarmName, string? SelectedBatchCode,
    IReadOnlyList<FarmDashboardBatch> Batches, int AliveCount, int OpenAlerts, int PendingCaptureRequests, int LogsDueToday,
    int OrdersToPack, int OrdersToShip, IReadOnlyList<EnvironmentDay> EnvironmentByDay, IReadOnlyList<DashboardLog> RecentLogs);

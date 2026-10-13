using CrabShare.Api.Features.Orders;
using CrabShare.Api.Infrastructure.Persistence.Entities;

namespace CrabShare.Api.Tests;

/// <summary>UC28 / NH-07 — quy tắc dòng thời gian và điều kiện huỷ; không cần CSDL, chạy trong CI.</summary>
public class OrderTrackingRulesTests
{
    [Theory]
    [InlineData("PendingPayment", true)]
    [InlineData("Paid", true)]
    [InlineData("Packed", false)]
    [InlineData("Shipping", false)]
    [InlineData("Delivered", false)]
    [InlineData("Completed", false)]
    [InlineData("Cancelled", false)]
    [InlineData("Returned", false)]
    public void Khach_chi_tu_huy_duoc_khi_chua_dong_goi(string status, bool expected)
        => Assert.Equal(expected, OrderQueryService.IsCancellable(status));

    [Fact]
    public void Don_cho_thanh_toan_chi_co_moc_dat_hang()
    {
        var placed = DateTimeOffset.Parse("2026-10-13T10:00:00Z");
        var steps = OrderQueryService.Timeline(new SalesOrder { Status = "PendingPayment", PlacedAt = placed });

        Assert.Equal(["placed", "paid", "packed", "shipped", "delivered", "completed"], steps.Select(s => s.Step));
        Assert.Equal(placed, steps[0].At);
        Assert.True(steps[0].Done);
        Assert.All(steps.Skip(1), s => Assert.False(s.Done));
    }

    [Fact]
    public void Don_huy_giu_cac_moc_da_xong_roi_them_cancelled()
    {
        var placed = DateTimeOffset.Parse("2026-10-13T10:00:00Z");
        var paid = DateTimeOffset.Parse("2026-10-13T10:05:00Z");
        var cancelled = DateTimeOffset.Parse("2026-10-13T10:10:00Z");
        var steps = OrderQueryService.Timeline(new SalesOrder
        {
            Status = "Cancelled", PlacedAt = placed, PaidAt = paid, CancelledAt = cancelled,
        });

        Assert.Equal(["placed", "paid", "cancelled"], steps.Select(s => s.Step));
        Assert.All(steps, s => Assert.True(s.Done));
        Assert.Equal(cancelled, steps[^1].At);
    }

    [Fact]
    public void Job_tra_ton_dung_ly_do_payment_timeout_va_co_the_tat_bang_cau_hinh()
    {
        Assert.Equal("payment_timeout", ReservationExpiryService.TimeoutReason);
        Assert.Equal("Orders:ExpiryJob:Enabled", ReservationExpiryJob.EnabledKey);
        Assert.Equal(200, ReservationExpiryService.BatchSize);
    }
}

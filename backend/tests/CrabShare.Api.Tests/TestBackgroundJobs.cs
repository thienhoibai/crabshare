using System.Runtime.CompilerServices;

namespace CrabShare.Api.Tests;

internal static class TestBackgroundJobs
{
    // Các API test không được chạy lịch nền trên CSDL dev. Job được gọi trực tiếp trên LocalDB test riêng.
    [ModuleInitializer]
    internal static void DisableAutomaticJobs()
    {
        Environment.SetEnvironmentVariable("Alerts__Jobs__Enabled", "false");
        Environment.SetEnvironmentVariable("Evidence__CaptureRequests__Enabled", "false");
    }

    // NH-07: job trả tồn chạy mỗi phút; test gọi ReservationExpiryService trực tiếp nên tắt lịch nền.
    [ModuleInitializer]
    internal static void DisableReservationExpiryJob() => Environment.SetEnvironmentVariable("Orders__ExpiryJob__Enabled", "false");
}

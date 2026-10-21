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

    // NH-10: job hoàn tất đơn chạy mỗi phút; test gọi OrderCompletionService trực tiếp nên tắt lịch nền.
    [ModuleInitializer]
    internal static void DisableOrderCompletionJob() => Environment.SetEnvironmentVariable("Orders__CompletionJob__Enabled", "false");

    // TH-07: job chốt vốn chạy mỗi phút; test gọi FundingCloseService trực tiếp nên tắt lịch nền.
    [ModuleInitializer]
    internal static void DisableFundingCloseJob() => Environment.SetEnvironmentVariable("Funding__CloseJob__Enabled", "false");
}

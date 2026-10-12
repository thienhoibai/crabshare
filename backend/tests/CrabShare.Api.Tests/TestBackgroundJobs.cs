using System.Runtime.CompilerServices;

namespace CrabShare.Api.Tests;

internal static class TestBackgroundJobs
{
    // Các API test không được chạy lịch nền trên CSDL dev. Job được gọi trực tiếp trên LocalDB test riêng.
    [ModuleInitializer]
    internal static void DisableAutomaticJobs() => Environment.SetEnvironmentVariable("Alerts__Jobs__Enabled", "false");
}

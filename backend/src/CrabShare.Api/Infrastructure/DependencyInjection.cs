using CrabShare.Api.Infrastructure.Detection;
using CrabShare.Api.Infrastructure.Ekyc;
using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Signing;
using CrabShare.Api.Infrastructure.Storage;
using CrabShare.Api.Features.Alerts;
using Microsoft.EntityFrameworkCore;

namespace CrabShare.Api.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var conn = config.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(conn))
            throw new InvalidOperationException("Thiếu ConnectionStrings:Default. Xem backend/README.md.");

        services.AddDbContext<AppDbContext>(o => o.UseSqlServer(conn, sql => sql.EnableRetryOnFailure(3)));
        services.AddSingleton(TimeProvider.System);
        services.Configure<AlertThresholds>(config.GetSection("Alerts:Thresholds"));
        services.AddOptions<AlertJobOptions>().Bind(config.GetSection("Alerts:Jobs"))
            .Validate(o => o.IntervalMinutes is >= 1 and <= 1440 && o.UtcOffsetHours is >= -12 and <= 14
                && o.DailyLogDueHour is >= 0 and <= 23 && o.AckWithinHours is >= 1 and <= 720, "Invalid Alerts:Jobs configuration")
            .ValidateOnStart();
        services.AddHostedService<AlertJobWorker>();

        services.Configure<StorageOptions>(config.GetSection("Storage"));
        services.AddSingleton<IFileStorage, LocalFileStorage>();

        // Dịch vụ bên ngoài: hiện dùng bản giả lập (Fake*) để dev và demo.
        // Khi có tài khoản sandbox thật, viết class mới cài cùng interface rồi đổi dòng đăng ký ở đây.
        services.AddSingleton<IPaymentGateway, FakePaymentGateway>();
        services.AddSingleton<IDigitalSigningService, FakeSigningService>();
        services.AddSingleton<IEkycProvider, FakeEkycProvider>();
        services.AddSingleton<IBankNameMatcher, FakeBankNameMatcher>();
        services.AddSingleton<ICrabDetector, NoopCrabDetector>();

        return services;
    }
}

using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Detection;
using CrabShare.Api.Infrastructure.Ekyc;
using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Signing;
using CrabShare.Api.Infrastructure.Storage;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Evidence;
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
        services.AddOptions<CaptureRequestOptions>().Bind(config.GetSection(CaptureRequestOptions.Section))
            .Validate(o => o.IntervalMinutes is >= 1 and <= 60 && o.UtcOffsetHours is >= -12 and <= 14
                && o.DailyRequestHour is >= 0 and <= 23 && o.ResponseWindowMinutes is >= 1 and <= 1440
                && o.AlertAckWithinHours is >= 1 and <= 720, "Invalid capture request configuration").ValidateOnStart();
        services.AddHostedService<CaptureRequestWorker>();
        services.AddOptions<EvidenceOptions>().Bind(config.GetSection("Evidence"))
            .Validate(o => o.SimilarityDistance is >= 0 and <= 16 && o.StaleCaptureHours is >= 1 and <= 720, "Invalid Evidence configuration")
            .ValidateOnStart();
        services.Configure<AlertThresholds>(config.GetSection("Alerts:Thresholds"));
        services.AddOptions<AlertJobOptions>().Bind(config.GetSection("Alerts:Jobs"))
            .Validate(o => o.IntervalMinutes is >= 1 and <= 1440 && o.UtcOffsetHours is >= -12 and <= 14
                && o.DailyLogDueHour is >= 0 and <= 23 && o.AckWithinHours is >= 1 and <= 720, "Invalid Alerts:Jobs configuration")
            .ValidateOnStart();
        services.AddHostedService<AlertJobWorker>();

        services.Configure<StorageOptions>(config.GetSection("Storage"));
        services.AddSingleton<LocalFileStorage>();
        var storageProvider = config["Storage:Provider"] ?? "Local";
        if (storageProvider.Equals("Cloudinary", StringComparison.OrdinalIgnoreCase))
        {
            var cloudinary = CloudinaryStorageOptions.Read(config);
            services.AddSingleton(cloudinary);
            services.AddHttpClient("CloudinaryStorage", client => client.Timeout = TimeSpan.FromSeconds(60))
                .RemoveAllLoggers()
                .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
                { AllowAutoRedirect = false, PooledConnectionLifetime = TimeSpan.FromMinutes(5) });
            services.AddSingleton<IFileStorage>(sp => new CloudinaryFileStorage(cloudinary,
                sp.GetRequiredService<LocalFileStorage>(), sp.GetRequiredService<IHttpClientFactory>().CreateClient("CloudinaryStorage"),
                sp.GetRequiredService<TimeProvider>()));
        }
        else if (storageProvider.Equals("Local", StringComparison.OrdinalIgnoreCase))
            services.AddSingleton<IFileStorage>(sp => sp.GetRequiredService<LocalFileStorage>());
        else throw new InvalidOperationException("Storage:Provider phải là Local hoặc Cloudinary.");

        // Nhật ký kiểm toán dùng chung (TH-02) + job kiểm tra chuỗi băm mỗi 6 giờ
        services.AddScoped<IAuditLog, AuditLogService>();
        services.AddHostedService<AuditChainCheckJob>();

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

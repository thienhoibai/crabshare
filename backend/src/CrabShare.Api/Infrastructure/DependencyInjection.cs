using CrabShare.Api.Common.Auditing;
using CrabShare.Api.Infrastructure.Detection;
using CrabShare.Api.Infrastructure.Ekyc;
using CrabShare.Api.Infrastructure.Payments;
using CrabShare.Api.Infrastructure.Persistence;
using CrabShare.Api.Infrastructure.Signing;
using CrabShare.Api.Infrastructure.Storage;
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

        services.Configure<StorageOptions>(config.GetSection("Storage"));
        services.AddSingleton<IFileStorage, LocalFileStorage>();

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

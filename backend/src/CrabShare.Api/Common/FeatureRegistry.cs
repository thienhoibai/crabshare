// Thiện
using CrabShare.Api.Features.Auth;
// using CrabShare.Api.Features.Funding;
// using CrabShare.Api.Features.Contracts;
using CrabShare.Api.Features.Payments;
// using CrabShare.Api.Features.Settlement;

// Viên
using CrabShare.Api.Features.Operators;
// using CrabShare.Api.Features.Boxes;
// using CrabShare.Api.Features.Batches;
// using CrabShare.Api.Features.Production;
// using CrabShare.Api.Features.Harvest;

// Nhân
using CrabShare.Api.Common.Alerts;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Features.Orders;
// using CrabShare.Api.Features.Offtake;

// Khôi
using CrabShare.Api.Features.Accounts;
// using CrabShare.Api.Features.Evidence;
// using CrabShare.Api.Features.Alerts;
// using CrabShare.Api.Features.Portfolio;
// using CrabShare.Api.Features.Admin;

namespace CrabShare.Api.Common;

/// <summary>
/// Nơi DUY NHẤT đăng ký service của các tính năng. Controller KHÔNG cần đăng ký: app.MapControllers() tự tìm
/// mọi class kế thừa ControllerBase. Làm tính năng mới (ví dụ Features/Batches) thì bỏ comment 2 dòng của mình:
///   1. using CrabShare.Api.Features.Batches; (đầu file)
///   2. services.AddScoped&lt;BatchService&gt;();
/// Các dòng xếp theo người làm, giữa các nhóm có dòng trống → hai người sửa cùng lúc vẫn merge sạch.
/// Bảng ai làm module nào: docs/feature-map.md
/// </summary>
public static class FeatureRegistry
{
    public static IServiceCollection AddFeatureServices(this IServiceCollection services)
    {
        // Thiện
        services.AddScoped<AuthService>();
        // services.AddScoped<FundingService>();      // Features/Funding
        // services.AddScoped<ContractService>();     // Features/Contracts
        // services.AddScoped<PaymentService>();      // Features/Payments
        services.AddScoped<PaymentRequestService>();  // Features/Payments — bản tối thiểu cho CS-36, TH-05 mở rộng
        // services.AddScoped<SettlementService>();   // Features/Settlement

        // Viên
        services.AddScoped<OperatorService>();        // Features/Operators
        services.AddScoped<OperatorReviewService>();  // UC05
        // services.AddScoped<BoxService>();          // Features/Boxes
        // services.AddScoped<BatchService>();        // Features/Batches
        // services.AddScoped<ProductionService>();   // Features/Production
        // services.AddScoped<HarvestService>();      // Features/Harvest

        // Nhân
        services.AddScoped<CatalogService>();
        services.AddScoped<ListingModerationService>(); // UC24 kiểm duyệt
        services.AddScoped<LowStockMonitor>();
        services.AddOptions<LowStockOptions>().BindConfiguration(LowStockOptions.Section);
        services.AddScoped<IAlertRaiser, LoggingAlertRaiser>(); // KH-05 xong → đổi sang AlertService
        services.AddScoped<OrderService>();           // Features/Orders
        services.AddOptions<OrderOptions>().BindConfiguration(OrderOptions.Section);
        // services.AddScoped<OfftakeService>();      // Features/Offtake

        // Khôi
        services.AddScoped<AccountService>();        // Features/Accounts
        services.AddScoped<PaymentProfileService>();
        // services.AddScoped<EvidenceService>();     // Features/Evidence
        // services.AddScoped<AlertService>();        // Features/Alerts
        // services.AddScoped<PortfolioService>();    // Features/Portfolio
        // services.AddScoped<AdminService>();        // Features/Admin

        return services;
    }
}

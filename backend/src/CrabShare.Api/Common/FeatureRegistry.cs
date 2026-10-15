// Thiện
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Funding;
// using CrabShare.Api.Features.Contracts;
using CrabShare.Api.Features.Payments;
// using CrabShare.Api.Features.Settlement;

// Viên
using CrabShare.Api.Features.Operators;
using CrabShare.Api.Features.Boxes;
using CrabShare.Api.Features.Batches;
// using CrabShare.Api.Features.Production;
// using CrabShare.Api.Features.Harvest;

// Nhân
using CrabShare.Api.Common.Alerts;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Features.Orders;
// using CrabShare.Api.Features.Offtake;

// Khôi
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Portfolio;
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
        services.AddScoped<FundingService>();         // Features/Funding
        services.AddSingleton<RiskDisclosureDocuments>();
        services.AddOptions<FundingOptions>().BindConfiguration("Funding");
        // services.AddScoped<ContractService>();     // Features/Contracts
        // services.AddScoped<PaymentService>();      // Features/Payments
        services.AddScoped<PaymentRequestService>();  // Features/Payments — VietQR dùng chung (TH-05)
        services.AddScoped<PaymentWebhookService>();  // Features/Payments — webhook báo có + giả lập (TH-06)
        services.AddScoped<RefundService>();          // lệnh hoàn tiền dùng chung (TH-06, NH-07, NH-11, TH-07)
        services.AddScoped<IPaymentPurposeHandler, ContributionPaymentHandler>(); // tiền góp vốn về → Confirmed
        services.AddOptions<PaymentOptions>().BindConfiguration(PaymentOptions.Section);
        // services.AddScoped<SettlementService>();   // Features/Settlement

        // Viên
        services.AddScoped<OperatorService>();        // Features/Operators
        services.AddScoped<OperatorReviewService>();  // UC05
        services.AddScoped<BoxService>();            // Features/Boxes
        services.AddScoped<BatchService>();           // Features/Batches — UC07
        services.AddScoped<BatchReviewService>();     // UC08
        services.AddScoped<TrancheScheduleResolver>();
        services.AddOptions<TrancheScheduleOptions>().BindConfiguration("Batches:Schedules")
            .Validate(o=>o.IntervalSeconds>0,"Schedule refresh interval must be positive.").ValidateOnStart();
        services.AddHostedService<TrancheScheduleJob>();
        services.AddScoped<FeeTierService>();         // Configurable fixed fees used by UC08
        // services.AddScoped<ProductionService>();   // Features/Production
        // services.AddScoped<HarvestService>();      // Features/Harvest

        // Nhân
        services.AddScoped<CatalogService>();
        services.AddScoped<ListingModerationService>(); // UC24 kiểm duyệt
        services.AddScoped<LowStockMonitor>();
        services.AddOptions<LowStockOptions>().BindConfiguration(LowStockOptions.Section);
        services.AddScoped<IAlertRaiser, AlertServiceRaiser>(); // chuyển tiếp sang AlertService (KH-05)
        services.AddScoped<OrderService>();           // Features/Orders
        services.AddOptions<OrderOptions>().BindConfiguration(OrderOptions.Section);
        services.AddScoped<IPaymentPurposeHandler, OrderPaymentHandler>(); // tiền đơn hàng về → đơn Paid, trừ tồn (NH-06)
        services.AddScoped<OrderPackingService>();    // UC29 đóng gói quét tem (NH-09)
        // services.AddScoped<OfftakeService>();      // Features/Offtake
        services.AddScoped<OrderQueryService>();        // NH-07 lịch sử + theo dõi đơn
        services.AddScoped<OrderCancellationService>(); // NH-07 huỷ đơn
        services.AddScoped<ReservationExpiryService>(); // NH-07 trả tồn khi quá hạn thanh toán
        services.AddHostedService<ReservationExpiryJob>(); // chạy mỗi phút; tắt bằng Orders:ExpiryJob:Enabled = false
        services.AddScoped<OrderFulfilmentService>();   // NH-10 giao hàng + xác nhận đã nhận (UC30)
        services.AddScoped<OrderCompletionService>();   // NH-10 hết cửa sổ đổi trả → Completed
        services.AddHostedService<OrderCompletionJob>(); // chạy mỗi phút; tắt bằng Orders:CompletionJob:Enabled = false

        // Khôi
        services.AddScoped<AccountService>();        // Features/Accounts
        services.AddScoped<PaymentProfileService>();
        services.AddScoped<AdminAccountService>();
        services.AddScoped<EvidenceService>();      // CS-44
        services.AddScoped<CaptureRequestService>();
        services.AddScoped<CaptureRequestJob>();     // CS-50
        services.AddScoped<EvidenceReviewService>(); // CS-54
        services.AddScoped<EvidenceExplanationService>(); // CS-57
        services.AddScoped<EvidenceImageReader>();
        services.AddScoped<EvidenceAccess>();
        services.AddSingleton<EvidenceImageProcessor>();
        services.AddScoped<AlertService>();          // Features/Alerts
        services.AddScoped<AlertJob>();              // CS-40
        services.AddScoped<PortfolioService>();     // CS-61
        services.AddScoped<NotificationService>();  // CS-65
        // services.AddScoped<AdminService>();        // Features/Admin

        return services;
    }
}

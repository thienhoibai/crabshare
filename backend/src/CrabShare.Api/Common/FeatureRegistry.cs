// Thiện
using CrabShare.Api.Features.Auth;
using CrabShare.Api.Features.Funding;
using CrabShare.Api.Features.Contracts;
using CrabShare.Api.Features.Payments;
using CrabShare.Api.Features.Settlement;

// Viên
using CrabShare.Api.Features.Operators;
using CrabShare.Api.Features.Boxes;
using CrabShare.Api.Features.Batches;
using CrabShare.Api.Features.Production;
using CrabShare.Api.Features.Harvest;

// Nhân
using CrabShare.Api.Common.Alerts;
using CrabShare.Api.Features.Catalog;
using CrabShare.Api.Features.Orders;
using CrabShare.Api.Features.Offtake;

// Khôi
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Portfolio;
using CrabShare.Api.Features.Admin;

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
        services.AddScoped<FundingCloseService>();    // TH-07 hết hạn giữ chỗ, chốt vốn hoặc huỷ lô + hoàn tiền
        services.AddScoped<FundingAdminService>();    // TH-07 bảng vốn vào theo lô (AdminFinance)
        services.AddHostedService<FundingCloseJob>(); // chạy mỗi phút; tắt bằng Funding:CloseJob:Enabled = false
        services.AddScoped<ContractService>();        // Features/Contracts — TH-08 sinh từ mẫu + ký số theo thứ tự
        services.AddSingleton<ContractTemplateDocuments>();
        services.AddSingleton<ContractPdfRenderer>();
        services.AddSingleton<ContractFileStore>();
        // services.AddScoped<PaymentService>();      // Features/Payments
        services.AddScoped<PaymentRequestService>();  // Features/Payments — VietQR dùng chung (TH-05)
        services.AddScoped<PaymentWebhookService>();  // Features/Payments — webhook báo có + giả lập (TH-06)
        services.AddScoped<RefundService>();          // lệnh hoàn tiền dùng chung (TH-06, NH-07, NH-11, TH-07)
        services.AddScoped<PaymentInstructionQueryService>(); // UC40 danh sách lệnh chi cho admin (TH-07, TH-10)
        services.AddScoped<DisbursementService>();    // TH-10 giải ngân theo mốc (UC18)
        services.AddScoped<PayoutSendService>();      // TH-10 gửi lệnh chi + đối soát (UC40)
        services.AddScoped<IPaymentPurposeHandler, ContributionPaymentHandler>(); // tiền góp vốn về → Confirmed
        services.AddOptions<PaymentOptions>().BindConfiguration(PaymentOptions.Section);
        services.AddScoped<SettlementService>();      // Features/Settlement — TH-12 tính quyết toán
        services.AddScoped<SettlementReviewService>(); // TH-13 công bố, sao kê, góp ý trong hạn
        services.AddScoped<SettlementPayoutService>(); // TH-14 duyệt, lệnh chi trả, đóng lô

        // Viên
        services.AddScoped<OperatorService>();        // Features/Operators
        services.AddScoped<OperatorReviewService>();  // UC05
        services.AddScoped<BoxService>();            // Features/Boxes
        services.AddScoped<BatchService>();           // Features/Batches — UC07
        services.AddScoped<BatchExploreService>();    // UC09
        services.AddScoped<BatchReviewService>();     // UC08
        services.AddScoped<TrancheScheduleResolver>();
        services.AddOptions<TrancheScheduleOptions>().BindConfiguration("Batches:Schedules")
            .Validate(o=>o.IntervalSeconds>0,"Schedule refresh interval must be positive.").ValidateOnStart();
        services.AddHostedService<TrancheScheduleJob>();
        services.AddScoped<FeeTierService>();         // Configurable fixed fees used by UC08
        services.AddScoped<StockingService>();       // Features/Production — VI-07
        services.AddScoped<ProductionLogService>();  // VI-08
        services.AddScoped<SlotEventService>();      // VI-09
        services.AddScoped<TimelineService>();       // VI-11
        services.AddScoped<HarvestService>();        // CS-71
        services.AddSingleton<IHarvestTagCodeGenerator, HarvestTagCodeGenerator>();
        services.AddScoped<TagsService>();            // CS-74 / VI-15
        services.AddScoped<TraceService>();
        services.AddOptions<TraceOptions>().BindConfiguration("Trace").Validate(o => Uri.TryCreate(o.PublicBaseUrl, UriKind.Absolute, out var uri)
            && uri.Scheme is "https" or "http", "Trace:PublicBaseUrl must be an absolute HTTP(S) URL.").ValidateOnStart();

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
        services.AddScoped<OfftakeService>();          // NH-14 cam kết bao tiêu (UC13)
        services.AddScoped<OfftakeClaimService>();     // NH-15 nhận hàng trong cửa sổ (UC23)
        services.AddScoped<OfftakeWindowService>();
        services.AddHostedService<OfftakeWindowJob>(); // tắt Offtake:WindowJob:Enabled = false
        services.AddScoped<IPaymentPurposeHandler, OfftakeDepositHandler>();
        services.AddScoped<IPaymentPurposeHandler, OfftakePaymentHandler>();
        services.AddScoped<OrderQueryService>();        // NH-07 lịch sử + theo dõi đơn
        services.AddScoped<OrderCancellationService>(); // NH-07 huỷ đơn
        services.AddScoped<ReservationExpiryService>(); // NH-07 trả tồn khi quá hạn thanh toán
        services.AddHostedService<ReservationExpiryJob>(); // chạy mỗi phút; tắt bằng Orders:ExpiryJob:Enabled = false
        services.AddScoped<OrderFulfilmentService>();   // NH-10 giao hàng + xác nhận đã nhận (UC30)
        services.AddScoped<OrderCompletionService>();   // NH-10 hết cửa sổ đổi trả → Completed
        services.AddHostedService<OrderCompletionJob>(); // chạy mỗi phút; tắt bằng Orders:CompletionJob:Enabled = false
        services.AddScoped<ComplaintService>();        // NH-11 khiếu nại + giải quyết tranh chấp (UC31, UC32)
        services.AddHostedService<ComplaintEscalationJob>(); // chạy mỗi phút; tắt bằng Orders:ComplaintEscalationJob:Enabled = false
        services.AddScoped<OrderRatingService>();     // NH-12 đánh giá đơn Completed (UC34)
        services.AddScoped<OrderReturnService>();     // NH-12 trả hàng trong hạn → Returned
        services.AddScoped<PreorderService>();          // NH-13 đặt trước có cọc (UC27)
        services.AddScoped<IPaymentPurposeHandler, PreOrderDepositHandler>();
        services.AddScoped<IPaymentPurposeHandler, PreOrderBalanceHandler>();
        services.AddScoped<PreorderBalanceService>();
        services.AddHostedService<PreorderBalanceJob>(); // tắt Orders:BalanceJob:Enabled = false

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
        services.AddScoped<AuditLogQueryService>(); // CS-76
        services.AddScoped<DashboardService>();     // CS-73

        return services;
    }
}

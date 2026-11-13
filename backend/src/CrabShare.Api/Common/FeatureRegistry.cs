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

// Nhân
using CrabShare.Api.Common.Alerts;

// Khôi
using CrabShare.Api.Features.Accounts;
using CrabShare.Api.Features.Evidence;
using CrabShare.Api.Features.Alerts;
using CrabShare.Api.Features.Portfolio;
using CrabShare.Api.Features.Admin;

// BR v1.5
using CrabShare.Api.Common.Parameters;
using CrabShare.Api.Features.Parties;
using CrabShare.Api.Features.Sales;

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
        services.AddScoped<ProductionLogService>();  // VI-08 (BR-111 nhật ký chăm sóc)
        services.AddScoped<TimelineService>();       // VI-11
        // BR v1.5 (G6): thu hoạch theo bản ghi, tem từng con, truy xuất từng con đã thay bằng phân hạng (G5) và QR đơn (Features/Delivery).

        // Nhân
        // BR v1.5 (G6): danh mục bán lẻ, giỏ hàng, đóng gói quét tem và khiếu nại cũ đã thay bằng đặt trước theo quy cách (G2)
        // và giao hàng, nghiệm thu, khiếu nại theo đợt giao (Features/Delivery).
        services.AddScoped<IAlertRaiser, AlertServiceRaiser>(); // chuyển tiếp sang AlertService (KH-05)

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

        // BR v1.5: các nhóm làm lại theo Business Rule v1.5 (G0–G8)
        services.AddScoped<PlatformParameters>();      // G0 tham số nền tảng có ngày hiệu lực (BR-217)
        services.AddScoped<ParameterAdminService>();
        services.AddScoped<PartyDirectory>();          // G0 đối tác, vai trò, người tham gia Lô
        services.AddScoped<PartyService>();
        services.AddScoped<IBatchLifecycleHooks, PreorderLedger>();     // G2 sổ đặt trước: tỷ lệ đặt trước, Lô mở, Lô huỷ
        services.AddScoped<CrabShare.Api.Features.Sales.PreorderService>(); // G2 đặt trước theo quy cách (BR-084…097, BR-234)
        services.AddScoped<IPaymentPurposeHandler, PreorderDepositHandler>();
        services.AddScoped<PreorderHoldExpiryService>();
        services.AddHostedService<PreorderHoldExpiryJob>(); // tắt bằng Sales:HoldExpiryJob:Enabled = false
        services.AddScoped<BatchAccess>();
        services.AddScoped<CrabShare.Api.Features.Quality.QcAssignmentService>(); // G3 phân ngẫu nhiên QC (BR-017)
        services.AddScoped<CrabShare.Api.Features.Sourcing.SourcingService>();     // G3 đơn mua nguồn, phiếu nhận, kiểm đầu vào
        services.AddScoped<CrabShare.Api.Features.Holding.HoldingService>();       // G3 đợt lưu nuôi, xếp hộp, sự kiện tồn
        services.AddScoped<CrabShare.Api.Features.Devices.DeviceIngestService>();  // G4 API nhận dữ liệu thiết bị (mục 11 Hướng dẫn)
        services.AddScoped<CrabShare.Api.Features.Devices.IStationMeasurementProcessor, CrabShare.Api.Features.Grading.GradingStationProcessor>();
        services.AddScoped<CrabShare.Api.Features.Devices.DeviceAdminService>();
        services.AddScoped<CrabShare.Api.Features.Devices.DeviceDataService>();
        services.AddScoped<CrabShare.Api.Features.Devices.DeviceOfflineService>();
        services.AddHostedService<CrabShare.Api.Features.Devices.DeviceOfflineJob>(); // tắt bằng Devices:OfflineJob:Enabled = false
        services.AddScoped<CrabShare.Api.Features.Grading.MeasurementSessionService>(); // G4 lượt đo mở bằng mã cua (BR-224)
        // G5 phân hạng: chuẩn và bộ quy tắc (BR-038), số đo, AI đo mai (BR-226), quyết định phân hạng (BR-155 – BR-158)
        services.AddScoped<CrabShare.Api.Features.Grading.GradingStandardService>();
        services.AddScoped<CrabShare.Api.Features.Grading.GradingService>();
        // G6 phân bổ, giao hàng theo đợt, nghiệm thu, hoá đơn, khiếu nại, đơn có hoá đơn, đơn hàng cuối, QR đơn (BR-160 – BR-185, BR-234)
        services.AddScoped<CrabShare.Api.Features.Delivery.AllocationService>();
        services.AddScoped<CrabShare.Api.Features.Grading.IGradingHooks>(sp => sp.GetRequiredService<CrabShare.Api.Features.Delivery.AllocationService>());
        services.AddScoped<CrabShare.Api.Features.Delivery.SalesLedger>();
        services.AddScoped<CrabShare.Api.Features.Delivery.DeliveryService>();
        services.AddScoped<CrabShare.Api.Features.Delivery.ClaimService>();
        services.AddScoped<CrabShare.Api.Features.Delivery.DirectSaleService>();
        services.AddScoped<CrabShare.Api.Features.Delivery.OrderTraceService>();
        services.AddScoped<IPaymentPurposeHandler, CrabShare.Api.Features.Delivery.DirectSalePaymentHandler>();
        services.AddScoped<IPaymentPurposeHandler, CrabShare.Api.Features.Delivery.PreorderBalanceHandler>();
        // G7 mốc giải ngân có cổng bằng chứng, thăm trại, sáu điều kiện chờ quyết toán, quyết toán P/T/A, thanh lý sớm, biểu quyết, ba số tiền
        services.AddScoped<CrabShare.Api.Features.Quality.SiteVisitService>();
        services.AddScoped<CrabShare.Api.Features.Settlement.SettlementReadinessService>();
        services.AddHostedService<CrabShare.Api.Features.Settlement.SettlementReadinessJob>(); // tắt bằng Settlement:Jobs:Enabled = false
        services.AddScoped<CrabShare.Api.Features.Settlement.CollectiveDecisionService>();
        services.AddScoped<CrabShare.Api.Features.Settlement.MoneySummaryService>();
        services.AddScoped<CrabShare.Api.Features.Delivery.DeliveryJobService>();
        // G8 quyền xem theo vai trò (BR-142, BR-143)
        services.AddScoped<CrabShare.Api.Features.Holding.BatchProgressService>();
        services.AddHostedService<CrabShare.Api.Features.Delivery.DeliveryJob>(); // tắt bằng Delivery:Jobs:Enabled = false
        services.AddOptions<CrabShare.Api.Features.Grading.CarapaceAiOptions>().BindConfiguration(CrabShare.Api.Features.Grading.CarapaceAiOptions.Section)
            .Validate(o => o.Mode is "None" or "Simulated" || (o.Mode == "Http" && Uri.TryCreate(o.Endpoint, UriKind.Absolute, out _)),
                "Grading:Ai:Mode phải là None, Simulated hoặc Http (Http cần Endpoint tuyệt đối).").ValidateOnStart();
        services.AddHttpClient<CrabShare.Api.Features.Grading.HttpCarapaceAi>();
        services.AddScoped<CrabShare.Api.Features.Grading.ICarapaceAi>(sp =>
            sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<CrabShare.Api.Features.Grading.CarapaceAiOptions>>().Value.Mode switch
            {
                "Http" => sp.GetRequiredService<CrabShare.Api.Features.Grading.HttpCarapaceAi>(),
                "Simulated" => new CrabShare.Api.Features.Grading.SimulatedCarapaceAi(),
                _ => new CrabShare.Api.Features.Grading.UnconfiguredCarapaceAi(),
            });

        return services;
    }
}

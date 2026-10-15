import 'helpers/discovery_fakes.dart';
import 'package:crabshare_mobile/features/investor/data/investor_repository.dart';
import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';

import 'helpers/notification_fakes.dart';

import 'package:crabshare_mobile/features/investor/data/portfolio_repository.dart';
// Dựng từng màn hình ở khổ điện thoại với dữ liệu mẫu: lỗi tràn layout hay exception sẽ làm test fail.
// Thêm màn mới thì thêm một dòng vào danh sách `pages` bên dưới.
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/account/account_page.dart';
import 'package:crabshare_mobile/features/account/payout_account_page.dart';
import 'package:crabshare_mobile/features/account/data/payout_repository.dart';
import 'package:crabshare_mobile/features/auth/login_page.dart';
import 'package:crabshare_mobile/features/common/unsupported_role_page.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_detail_page.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_explore_page.dart';
import 'package:crabshare_mobile/features/investor/home/investor_home_page.dart';
import 'package:crabshare_mobile/features/investor/kyc/kyc_page.dart';
import 'package:crabshare_mobile/features/investor/kyc/kyc_repository.dart';
import 'package:crabshare_mobile/features/investor/data/investor_models.dart';
import 'package:crabshare_mobile/features/investor/notifications/notifications_page.dart';
import 'package:crabshare_mobile/features/onboarding/onboarding_page.dart';
import 'package:crabshare_mobile/features/operator/alerts/alerts_page.dart';
import 'package:crabshare_mobile/features/operator/data/alert_repository.dart';
import 'package:crabshare_mobile/features/operator/data/operator_repository.dart';
import 'package:crabshare_mobile/features/operator/data/operator_models.dart';
import 'package:crabshare_mobile/features/operator/evidence/capture_page.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_repository.dart';
import 'package:crabshare_mobile/features/operator/evidence/capture_requests_repository.dart';
import 'package:dio/dio.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_page.dart';
import 'package:crabshare_mobile/features/operator/logs/daily_log_form_page.dart';
import 'package:crabshare_mobile/features/operator/logs/daily_logs_page.dart';
import 'package:crabshare_mobile/features/operator/packing/pack_order_page.dart';
import 'package:crabshare_mobile/features/operator/packing/pack_orders_page.dart';
import 'package:crabshare_mobile/features/operator/today/operator_today_page.dart';
import 'package:crabshare_mobile/features/trace/scan_page.dart';
import 'package:crabshare_mobile/features/trace/trace_result_page.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

const _user = AppUser(
  userId: 1,
  email: 'test@crabshare.local',
  fullName: 'Nguyễn Văn Test',
  roles: [Roles.investor, Roles.customer, Roles.operatorMember],
  operatorId: 1,
);

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));

  final pages = <String, Widget>{
    'Onboarding': const OnboardingPage(),
    'Đăng nhập': const LoginPage(),
    'Vai trò không hỗ trợ': const UnsupportedRolePage(),
    'NĐT · Tổng quan': const InvestorHomePage(),
    'NĐT · Khám phá lô': const BatchExplorePage(),
    'NĐT · Chi tiết lô đang gọi vốn': const BatchDetailPage(code: 'CS-2610-02'),
    'NĐT · Chi tiết lô đang nuôi': const BatchDetailPage(code: 'CS-2610-01'),
    'NĐT · Thông báo': const NotificationsPage(),
    'NĐT · eKYC': const KycPage(),
    'Hộ nuôi · Hôm nay': const OperatorTodayPage(),
    'Hộ nuôi · Nhật ký': const DailyLogsPage(),
    'Hộ nuôi · Form nhật ký': const DailyLogFormPage(
      initialBatchCode: 'CS-2610-01',
    ),
    'Hộ nuôi · Chụp bằng chứng': const CapturePage(initialSlot: '0014'),
    'Hộ nuôi · Cảnh báo': const AlertsPage(),
    'Hộ nuôi · Thu hoạch': const HarvestPage(batchCode: 'CS-2609-04'),
    'Quét tem': const ScanPage(),
    'Kết quả truy xuất': const TraceResultPage(tagCode: 'CSAB23CD45EF'),
    'Tài khoản': const AccountPage(),
    'Tài khoản nhận tiền': const PayoutAccountPage(),
    'Hộ nuôi · Đóng gói đơn': const PackOrdersPage(),
    'Hộ nuôi · Quét tem đóng gói': const PackOrderPage(orderNo: 'ODPACKDEMO01'),
  };

  for (final MapEntry(key: name, value: page) in pages.entries) {
    testWidgets('$name dựng được ở khổ 360×780', (tester) async {
      tester.view.physicalSize = const Size(360, 780);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            investorRepositoryProvider.overrideWithValue(ApiInvestorRepository(discoveryDio((request) =>
              jsonResponse(request.path == '/api/batches'
                ? {'items': [discoveryBatch()], 'page': 1, 'pageSize': 20, 'total': 1}
                : discoveryBatch())))),
            notificationPollIntervalProvider.overrideWithValue(null),
            notificationRepositoryProvider.overrideWithValue(
              EmptyNotificationRepository(),
            ),
            notificationReadStoreProvider.overrideWithValue(
              MemoryNotificationReadStore(),
            ),
            sessionProvider.overrideWith(
              () => SessionController(
                const SessionState(token: 't', user: _user),
              ),
            ),
            myContributionsProvider.overrideWith((ref) async => []),
            kycRepositoryProvider.overrideWithValue(_SmokeKycRepository()),
            payoutRepositoryProvider.overrideWithValue(
              _SmokePayoutRepository(),
            ),
            alertRepositoryProvider.overrideWithValue(_SmokeAlertRepository()),
            evidenceRepositoryProvider.overrideWithValue(
              _SmokeEvidenceRepository(),
            ),
            captureRequestsRepositoryProvider.overrideWithValue(
              _SmokeCaptureRequests(),
            ),
          ],
          child: MaterialApp(theme: buildAppTheme(), home: page),
        ),
      );
      // Dữ liệu mẫu trả về sau ~300 ms; chờ thêm cho animation đồng hồ chạy xong.
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(seconds: 1));

      expect(tester.takeException(), isNull);
      // Tháo cây widget để dừng các animation lặp (khung quét) trước khi test kết thúc.
      await tester.pumpWidget(const SizedBox());
    });
  }
}

class _SmokeEvidenceRepository implements EvidenceRepository {
  @override
  Future<List<BoxSlot>> boxes({CancelToken? cancelToken}) async => [
    const BoxSlot(
      slotCode: '0014',
      status: SlotStatus.occupied,
      batchCode: 'CS-2610-01',
    ),
  ];
  @override
  Future<EvidenceResult> upload({
    required BoxSlot box,
    required EvidencePhoto photo,
    int? captureRequestId,
  }) => throw UnimplementedError();
}

class _SmokeCaptureRequests implements CaptureRequestsRepository {
  @override
  Future<List<CaptureRequest>> list({CancelToken? cancelToken}) async => [];
}

class _SmokeAlertRepository implements AlertRepository {
  @override
  Future<List<AlertItem>> list() => MockOperatorRepository().alerts();
  @override
  Future<AlertItem> acknowledge(int id, String note) =>
      throw UnimplementedError();
}

class _SmokeKycRepository implements KycRepository {
  @override
  Future<KycVerification> status() async =>
      const KycVerification(status: KycStatus.unverified);
  @override
  Future<KycVerification> verify({
    required List<KycImage> images,
    required bool consent,
  }) => throw UnimplementedError();
}

class _SmokePayoutRepository implements PayoutRepository {
  @override
  Future<PayoutProfile> get(String ownerType) async => PayoutProfile(
    ownerType: ownerType,
    expectedHolderName: 'Nguyễn Văn Test',
  );
  @override
  Future<PayoutProfile> save(String ownerType, PayoutInput input) =>
      throw UnimplementedError();
}

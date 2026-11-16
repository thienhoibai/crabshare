import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/investor_routes.dart';
import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';
import 'package:crabshare_mobile/shared/widgets/app_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/investor_fixtures.dart';
import 'timeline_test.dart' show timelineFixture;

/// Các màn của khu nhà đầu tư không tràn bố cục trên điện thoại hẹp (rộng 360) với tên Lô, mã hợp đồng và số tiền dài
/// như dữ liệu thật. Màn test đủ cao để mọi dòng của danh sách đều được dựng.
const _longTitle = 'Cua thịt vỗ béo hộp nhựa tuần hoàn Năm Căn — đợt tháng 11 năm 2026';
const _code = 'CS-2611-P1';

Map<String, dynamic> _position({bool frozen = true, String code = _code}) {
  final item = portfolioItem(code: code, frozen: frozen, amount: 180000000, alerts: 12, status: frozen ? 'AwaitingSettlement' : 'Funding');
  (item['batch'] as Map<String, dynamic>)['title'] = _longTitle;
  (item['batch'] as Map<String, dynamic>)['operatorName'] = 'Hợp tác xã Nuôi cua công nghệ cao Năm Căn Cà Mau';
  return item;
}

FakeApi _api() {
  final detail = portfolioDetail(_position());
  ((detail['contributions'] as List).single as Map<String, dynamic>)['contractNo'] = 'HD20261112-000017-BS02';
  final funding = exploreBatch(code: 'CS-2610-02')..['title'] = _longTitle;
  final trade = exploreBatch(
    code: 'CS-2611-T1',
    mode: 'T',
    status: 'Sourcing',
    preorderDeadline: '2099-12-20T00:00:00Z',
    offers: [
      exploreOffer(code: 'FAT-XL-SPECIAL', price: 1520000)..['specName'] = 'Cua thịt vỗ béo size XL Đặc cấp loại chọn',
      exploreOffer(price: 380000),
    ],
  )..['title'] = _longTitle;
  final timeline = timelineFixture()..['batchCode'] = _code;
  final statement = settlementJson()
    ..['batchCode'] = _code
    ..['batchTitle'] = _longTitle
    ..['actualRevenue'] = 1234567890;
  return FakeApi()
    ..get('/api/investor/portfolio', portfolioPage([_position(), _position(frozen: false, code: 'CS-2610-02')]))
    ..get('/api/investor/portfolio/$_code', detail)
    ..get('/api/batches/$_code/money-summary', moneySummary(contributed: 180000000, disbursed: 153333333))
    ..get('/api/batches/$_code/progress', progressJson())
    ..get('/api/batches/$_code/decisions', [
      decisionJson()..['proposal'] = 'Đề xuất thanh lý sớm vì tỷ lệ cua chết vượt ngưỡng trong ba ngày liên tiếp, người nuôi không khắc phục được nguồn nước.',
      decisionJson(no: 'QD0002', status: 'Passed', canVote: false, myChoice: 'Yes', yes: 153333333),
    ])
    ..get('/api/batches/$_code/settlement-readiness', readinessJson())
    ..get('/api/batches/$_code/device-images', [for (var i = 1; i <= 7; i++) deviceImageJson(i, 'NC-R02-17${i.toString().padLeft(2, '0')}')])
    ..get('/api/batches/$_code/timeline', timeline)
    ..get('/api/me/kyc', {'verificationStatus': 'Rejected', 'verifiedAt': null, 'lastCheck': {'failureReason': 'Ảnh khuôn mặt không khớp ảnh trên giấy tờ, hãy chụp lại ở nơi đủ sáng.'}})
    ..get('/api/me/contributions', [myContributionJson()..['amount'] = 180000000])
    ..get('/api/me/contracts', [contractJson()..['contractNo'] = 'HD20261112-000017-BS02', contractJson(id: 11, nextSigner: null, status: 'FullySigned')])
    ..get('/api/me/settlements', [settlementSummaryJson()..['batchCode'] = _code..['batchTitle'] = _longTitle])
    ..get('/api/settlements/7', statement)
    ..get('/api/batches', {'items': [funding, trade], 'page': 1, 'pageSize': 100, 'total': 2})
    ..get('/api/batches/CS-2610-02', funding)
    ..get('/api/batches/CS-2610-02/progress', progressJson(participant: false))
    ..get('/api/batches/CS-2611-T1', trade)
    ..get('/api/batches/CS-2611-T1/progress', progressJson(participant: false))
    ..get('/api/batches/CS-2611-T1/availability', {
      'batchCode': 'CS-2611-T1', 'acceptingPreorders': true, 'sellableCrabs': 300, 'committedCrabs': 30, 'remainingCrabs': 270,
      'specs': [{'specCode': 'FAT-XL-SPECIAL', 'specName': 'x', 'pricePerKg': 1520000, 'conversionWeightG': 420, 'offeredQuantity': 75, 'committed': 10, 'remaining': 65}],
      'minOrderCrabs': 10, 'depositRatePct': 12.5, 'holdMinutes': 15,
    })
    ..routes['GET /api/device-images/1/file'] = ((_) => ResponseBody.fromBytes(onePixelPng, 200));
}

class _Notifications implements NotificationRepository {
  @override
  Future<List<NotificationEvent>> list({CancelToken? cancelToken}) async => [
    for (final type in ['PaymentConfirmed', 'AlertRaised', 'SettlementPublished'])
      NotificationEvent.fromJson({
        'id': '$type:1', 'type': type, 'title': 'Bảng quyết toán của Lô đã được công bố để lấy góp ý',
        'body': 'Khoản góp 180.000.000 đ cho lô $_code đã được xác nhận. Mở danh mục để theo dõi lô.',
        'at': '2026-10-15T01:00:00Z', 'batchCode': _code, 'canOpenPortfolio': true, 'amount': 180000000,
      }),
  ];
}

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));

  for (final location in [
    Routes.investorHome,
    Routes.investorBatches,
    Routes.investorNotifications,
    Routes.batch('CS-2610-02'),
    Routes.batch('CS-2611-T1'),
    Routes.kyc,
    Routes.portfolioBatch(_code),
    for (final tab in ['nhat-trinh', 'thiet-bi', 'bieu-quyet', 'quyet-toan']) InvestorRoutes.portfolioTab(_code, tab),
    InvestorRoutes.contracts,
    InvestorRoutes.votes,
    InvestorRoutes.settlements,
    InvestorRoutes.settlement(7),
  ]) {
    testWidgets('no overflow on a narrow phone: $location', (tester) async {
      await pumpInvestor(
        tester,
        _api(),
        location: location,
        size: const Size(360, 6000),
        session: testSession(roles: [Roles.investor, Roles.customer]),
        notifications: _Notifications(),
      );
      expect(tester.takeException(), isNull);
      expect(find.byType(ErrorView), findsNothing);
      expect(find.text('Thử lại'), findsNothing);
      expectNoProjection();

      // Mở hết các phần gấp để kiểm tra cả nội dung bên trong.
      for (final tile in find.byType(ExpansionTile).evaluate().toList()) {
        await tester.tap(find.byWidget(tile.widget));
        await settle(tester);
      }
      expect(tester.takeException(), isNull);
    });
  }
}

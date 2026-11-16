import 'dart:convert';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/investor_routes.dart';
import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';
import 'package:crabshare_mobile/features/investor/widgets/investor_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import 'discovery_fakes.dart';
import 'notification_fakes.dart';

/// Dữ liệu mẫu và khung dựng màn cho các test của khu nhà đầu tư (BR v1.5).

SessionState testSession({int id = 42, List<String> roles = const [Roles.investor]}) => SessionState(
  token: 'test-$id',
  user: AppUser(userId: id, email: '$id@test.local', fullName: 'Nguyễn Minh', roles: roles),
);

class TestSession extends SessionController {
  TestSession([SessionState? initial]) : super(initial ?? testSession());
  void change(int id) => state = testSession(id: id);
}

/// API giả theo bảng đường dẫn: khoá là "GET /api/..."; đường dẫn không khai thì trả 404.
class FakeApi {
  final routes = <String, Object Function(RequestOptions request)>{};
  final requests = <RequestOptions>[];

  late final Dio dio = discoveryDio((request) {
    requests.add(request);
    final handler = routes['${request.method} ${request.path}'];
    if (handler == null) return jsonResponse({'detail': 'Không có ${request.path}'}, 404);
    final result = handler(request);
    return result is ResponseBody ? result : jsonResponse(result);
  });

  void get(String path, Object body) => routes['GET $path'] = (_) => body;

  List<String> paths(String method) => [for (final r in requests) if (r.method == method) r.path];
}

final onePixelPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=',
);

Map<String, dynamic> portfolioItem({
  String code = 'CS-P1',
  bool frozen = true,
  String status = 'InProduction',
  int amount = 10200000,
  int alerts = 0,
  Map<String, dynamic>? settlement,
}) => {
  'batch': {
    'code': code, 'title': 'Cua thịt hộp $code', 'operatorName': 'HTX Năm Căn', 'crabType': 'FatteningMudCrab',
    'status': status, 'targetCapital': 17000000, 'raisedCapital': 17000000, 'minContribution': 1000000, 'cycleDays': 35,
    'seedQuantity': 40, 'fundingDeadline': '2026-10-23T12:05:47Z', 'stockedAt': '2026-10-31T12:05:47Z',
    'expectedHarvestDate': '2026-12-28', 'dayOfCycle': 13, 'aliveCount': null, 'openAlerts': alerts,
  },
  'confirmedAmount': amount, 'capitalRatio': 0.6, 'capitalBasis': frozen ? 'Frozen' : 'LiveConfirmed',
  'lastConfirmedAt': '2026-10-09T12:05:47Z', 'settlement': settlement,
};

Map<String, dynamic> portfolioPage(List<Map<String, dynamic>> items) => {
  'items': items, 'page': 1, 'pageSize': 100, 'total': items.length,
  'summary': {'totalConfirmedAmount': 0, 'activeConfirmedAmount': 0, 'totalBatches': items.length, 'activeBatches': items.length, 'approvedNetPayout': 0},
};

Map<String, dynamic> portfolioDetail(Map<String, dynamic> position) => {
  'position': position,
  'contributions': [
    {
      'id': 15, 'amount': position['confirmedAmount'], 'status': 'Confirmed', 'reservedAt': '2026-10-08T12:05:47Z',
      'confirmedAt': '2026-10-09T12:05:47Z', 'contractNo': 'HD-P1-005', 'contractStatus': 'FullySigned', 'fullySignedAt': '2026-10-09T13:00:00Z',
    },
  ],
  'timeline': [{'type': 'Stocked', 'label': 'Thả giống', 'at': '2026-10-31T12:05:47Z'}],
  'latestProduction': null,
};

Map<String, dynamic> moneySummary({int contributed = 10200000, int disbursed = 4200000}) => {
  'batchCode': 'CS-P1',
  'batch': {'contributed': 17000000, 'disbursed': 7000000, 'heldInAccount': 10000000},
  'mine': {'contributed': contributed, 'disbursed': disbursed, 'heldInAccount': contributed - disbursed},
  'note': 'Phần của bạn tính theo tỷ lệ vốn.',
};

Map<String, dynamic> progressJson({bool participant = true}) => {
  'batchCode': 'CS-P1', 'status': 'InProduction', 'crabsAlive': 38, 'daysRaised': 12, 'isParticipant': participant,
  'deadCrabs': participant ? 2 : null, 'restockedCrabs': participant ? 1 : null, 'gradedCrabs': participant ? 5 : null,
  'deliveredOrSoldCrabs': participant ? 0 : null,
};

Map<String, dynamic> decisionJson({
  String no = 'QD0001',
  String batchCode = 'CS-P1',
  String status = 'Open',
  bool canVote = true,
  String? myChoice,
  int yes = 0,
}) => {
  'decisionNo': no, 'batchCode': batchCode, 'kind': 'EarlyLiquidation', 'proposal': 'Đề xuất thanh lý sớm vì cua chết nhiều.',
  'status': status, 'openedAt': '2026-11-10T02:00:00Z', 'closesAt': '2099-11-13T02:00:00Z', 'eligibleCapital': 17000000,
  'yesCapital': yes, 'noCapital': 0, 'yesPct': yes == 0 ? 0 : 60.0, 'noPct': 0, 'myChoice': myChoice, 'canVote': canVote,
  'decidedAt': status == 'Open' ? null : '2026-11-12T02:00:00Z',
};

Map<String, dynamic> readinessJson({bool ready = false}) => {
  'batchCode': 'CS-P1', 'batchStatus': 'Harvesting', 'ready': ready,
  'conditions': [
    {'no': 1, 'code': 'crabs_closed', 'description': 'Mọi con cua đã được giao, bán, ghi chết hoặc huỷ', 'met': ready, 'pending': ready ? 0 : 40},
    for (var i = 2; i <= 6; i++) {'no': i, 'code': 'c$i', 'description': 'Điều kiện số $i', 'met': true, 'pending': 0},
  ],
};

Map<String, dynamic> settlementSummaryJson({int id = 7, String batchCode = 'CS-P1', bool feedbackOpen = true}) => {
  'settlementId': id, 'batchCode': batchCode, 'batchTitle': 'Cua thịt hộp $batchCode', 'status': feedbackOpen ? 'Proposed' : 'Approved',
  'revisionNo': 1, 'revenuePool': 9000000, 'myNetPayout': 11400000, 'feedbackDeadline': '2099-11-20T02:00:00Z',
  'feedbackOpen': feedbackOpen, 'openFeedback': 0,
};

Map<String, dynamic> settlementJson({int id = 7, String status = 'Proposed'}) => {
  'settlementId': id, 'batchCode': 'CS-P1', 'batchTitle': 'Cua thịt hộp CS-P1', 'operatorName': 'HTX Năm Căn', 'batchStatus': 'Settlement',
  'status': status, 'revisionNo': 2, 'orderRevenue': 30000000, 'forfeitedDeposits': 0, 'complaintRefunds': 0, 'actualRevenue': 30000000,
  'lockedStandardCost': 17000000, 'revenuePool': 11500000, 'operatorSharePct': 20.0, 'operatorRemuneration': 2300000,
  'distributable': 9200000, 'depreciationAmount': 0, 'taxTotal': 120000, 'uncoveredLoss': 0, 'reconciliationDifference': 0,
  'totalCapital': 17000000, 'totalNetPayout': 26080000, 'investorCount': 3, 'proposedAt': '2026-11-10T02:00:00Z',
  'feedbackDeadline': '2099-11-20T02:00:00Z', 'approvedAt': null, 'createdAt': '2026-11-09T02:00:00Z', 'updatedAt': '2026-11-10T02:00:00Z',
  'lines': [
    {
      'settlementLineId': 1, 'investorId': 42, 'investorName': 'Nguyễn Minh', 'capitalReturn': 10200000, 'profitShare': 1272000,
      'taxWithheld': 72000, 'netPayout': 11400000, 'isMine': true, 'payoutStatus': null,
    },
  ],
  'feedback': [], 'taxNotice': '', 'auditAnchors': [],
  'breakdown': {
    'mode': 'P', 'basis': 'StandardCost', 'preOrderRevenue': 30000000, 'invoicedSaleRevenue': 0, 'forfeitedDeposits': 0, 'finalOrderRevenue': 0,
    'platformFeeRatePct': 5.0, 'platformFee': 1500000, 'standardCostDeductible': 17000000, 'actualCostTotal': 0, 'excludedFaultCost': 0,
    'disbursedTotal': 15000000, 'undisbursedCost': 2000000, 'customerRefunds': 0, 'receivedCount': 40, 'deadCount': 2,
    'survivalRatePct': 95.0, 'commissionPct': null, 'commissionAmount': 0, 'supplierPayout': 0, 'isLiquidation': false,
  },
};

Map<String, dynamic> contractJson({int id = 15, String? nextSigner = 'Investor', String status = 'OperatorSigned'}) => {
  'contractId': id, 'contractNo': 'HD-$id', 'status': status, 'signingMethod': 'DigitalSignature', 'batchCode': 'CS-F1',
  'batchTitle': 'Lô đang gọi vốn', 'investorName': 'Nguyễn Minh', 'amount': 5000000, 'contributionStatus': 'Confirmed',
  'nextSigner': nextSigner, 'createdAt': '2026-11-12T15:10:34Z', 'fullySignedAt': status == 'FullySigned' ? '2026-11-12T16:00:00Z' : null,
};

Map<String, dynamic> myContributionJson({String status = 'Reserved'}) => {
  'contributionId': 17, 'batchCode': 'CS-F1', 'batchTitle': 'Lô đang gọi vốn', 'amount': 5000000, 'status': status,
  'reservedAt': '2026-11-12T15:10:08Z', 'expiresAt': '2099-11-12T15:40:08Z', 'confirmedAt': null,
};

Map<String, dynamic> deviceImageJson(int id, String slot) => {
  'deviceImageId': id, 'slotCode': slot, 'crabCode': 'CU$id', 'capturedAt': '2026-11-12T19:06:21+07:00',
  'receivedAt': '2026-11-12T12:06:21Z', 'crabDetected': null, 'detectionConfidence': null, 'deviceCode': 'RC-01', 'runId': null,
};

/// Dựng một màn của khu nhà đầu tư trên API giả. [location] khác null thì dựng cả bộ đường dẫn của khu để bấm chuyển màn.
/// Trả về danh sách địa chỉ web mà màn đã mở.
Future<List<Uri>> pumpInvestor(
  WidgetTester tester,
  FakeApi api, {
  Widget? home,
  String? location,
  SessionState? session,
  NotificationRepository? notifications,
  NotificationReadStore? readStore,
  List<Override> overrides = const [],
  Size size = const Size(390, 844),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final opened = <Uri>[];
  final router = location == null
      ? null
      : GoRouter(
          initialLocation: location,
          routes: [
            ...investorRoutes(),
            GoRoute(path: '/scan', builder: (context, state) => const Scaffold(body: Text('Màn quét QR'))),
          ],
        );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sessionProvider.overrideWith(() => TestSession(session)),
        dioProvider.overrideWithValue(api.dio),
        webLauncherProvider.overrideWithValue((uri) async {
          opened.add(uri);
          return true;
        }),
        notificationPollIntervalProvider.overrideWithValue(null),
        notificationRepositoryProvider.overrideWithValue(notifications ?? EmptyNotificationRepository()),
        notificationReadStoreProvider.overrideWithValue(readStore ?? MemoryNotificationReadStore()),
        ...overrides,
      ],
      child: router == null
          ? MaterialApp(theme: buildAppTheme(), home: home)
          : MaterialApp.router(theme: buildAppTheme(), routerConfig: router),
    ),
  );
  await settle(tester);
  return opened;
}

/// Chờ màn tải xong. Mỗi lần gọi API của Dio bắt đầu bằng một Timer 0 giây, mà pumpAndSettle chỉ chờ khung hình,
/// nên lần gọi phát sinh trong lúc dựng khung cuối sẽ treo: bơm thêm vài nhịp để các lần gọi nối tiếp nhau chạy hết.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  await tester.pumpAndSettle();
}

/// Cuộn tới một nút hoặc chip rồi bấm và chờ màn tải xong (phông chữ của test rộng hơn phông thật nên nút hay nằm ngoài khung).
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder);
  await settle(tester);
}

/// Những từ không được xuất hiện ở màn của nhà đầu tư: mọi số dự kiến về tiền nhận về.
void expectNoProjection() {
  for (final word in ['lợi nhuận', 'Lợi nhuận', 'lợi suất', 'Lợi suất', 'sinh lời', 'ROI', 'kỳ vọng']) {
    expect(find.textContaining(word), findsNothing, reason: 'Màn không được có "$word"');
  }
}

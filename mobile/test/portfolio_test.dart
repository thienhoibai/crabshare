import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';

import 'helpers/notification_fakes.dart';
import 'helpers/timeline_fakes.dart';

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crabshare_mobile/app/router.dart';
import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/data/investor_models.dart';
import 'package:crabshare_mobile/features/investor/data/portfolio_repository.dart';
import 'package:crabshare_mobile/features/investor/data/timeline_repository.dart';
import 'package:crabshare_mobile/features/investor/home/investor_home_page.dart';
import 'package:crabshare_mobile/features/investor/kyc/kyc_repository.dart';
import 'package:crabshare_mobile/features/investor/portfolio/portfolio_detail_page.dart';
import 'package:crabshare_mobile/shared/widgets/segmented_gauge.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

Map<String, dynamic> position({
  String code = 'CS61-REAL-01',
  bool frozen = true,
  double? ratio = .25,
}) => {
  'batch': <String, dynamic>{
    'code': code,
    'title': 'Cua thịt Năm Căn',
    'operatorName': 'HTX Năm Căn',
    'crabType': 'FatteningMudCrab',
    'status': 'InProduction',
    'targetCapital': 100000004,
    'raisedCapital': 100000004,
    'minContribution': 1000000,
    'cycleDays': 90,
    'seedQuantity': 100,
    'dayOfCycle': 44,
    'aliveCount': 97,
    'openAlerts': 2,
    'expectedHarvestDate': '2026-12-01',
  },
  'confirmedAmount': 25000001,
  'capitalRatio': ratio,
  'capitalBasis': frozen ? 'Frozen' : 'LiveConfirmed',
  'lastConfirmedAt': '2026-08-30T08:00:00Z',
  'settlement': null,
};
Map<String, dynamic> detailJson([Map<String, dynamic>? p]) => {
  'position': p ?? position(),
  'contributions': [
    {
      'id': 61,
      'amount': 25000001,
      'status': 'Confirmed',
      'reservedAt': '2026-08-30T07:50:00Z',
      'confirmedAt': '2026-08-30T08:00:00Z',
      'contractNo': 'CT-61',
      'contractStatus': 'FullySigned',
    },
  ],
  'timeline': [
    {'type': 'Stocked', 'label': 'Thả giống', 'at': '2026-09-01T00:00:00Z'},
  ],
  'latestProduction': {
    'logDate': '2026-10-14',
    'ph': 7.8,
    'waterTempC': 28,
    'salinityPpt': 15,
    'feedKg': 2,
    'plausibilityFlag': 'Ok',
    'verifiedAt': null,
  },
};
SessionState session(int id, {bool investor = true}) => SessionState(
  token: 'test',
  user: AppUser(
    userId: id,
    email: 'test@local',
    fullName: 'Khôi',
    roles: [investor ? Roles.investor : Roles.customer],
  ),
);

class _Session extends SessionController {
  _Session() : super(session(61));
  void change(int id) => state = session(id);
}

class _Kyc implements KycRepository {
  @override
  Future<KycVerification> status() async =>
      const KycVerification(status: KycStatus.verified);
  @override
  Future<KycVerification> verify({
    required List<KycImage> images,
    required bool consent,
  }) => throw UnimplementedError();
}

class _Repo implements PortfolioRepository {
  List<Contribution> items = [portfolioPositionFromJson(position())];
  PortfolioDetail detail = portfolioDetailFromJson(detailJson());
  bool fail = false;
  int listReads = 0;
  String? requestedCode;
  final cancels = <CancelToken?>[];
  @override
  Future<List<Contribution>> list({CancelToken? cancelToken}) async {
    listReads++;
    cancels.add(cancelToken);
    if (fail) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 503,
          data: {'detail': 'Danh mục tạm thời không tải được.'},
        ),
      );
    }
    return items;
  }

  @override
  Future<PortfolioDetail> get(String code, {CancelToken? cancelToken}) async {
    requestedCode = code;
    return detail;
  }
}

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(
        options.path.endsWith('/CS61-REAL-01')
            ? detailJson()
            : {
                'items': [
                  position(code: 'PAGE-${options.queryParameters['page']}'),
                ],
                'total': 101,
              },
      ),
      200,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<void> _showHome(WidgetTester tester, _Repo repo) async {
  tester.view.physicalSize = const Size(360, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: Routes.investorHome,
    routes: [
      GoRoute(
        path: Routes.investorHome,
        builder: (_, _) => const InvestorHomePage(),
      ),
      GoRoute(
        path: '/i/portfolio/:code',
        builder: (_, s) =>
            InvestorPortfolioDetailPage(code: s.pathParameters['code']!),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        notificationPollIntervalProvider.overrideWithValue(null),
        timelineRepositoryProvider.overrideWithValue(EmptyTimelineRepository()),
        notificationRepositoryProvider.overrideWithValue(
          EmptyNotificationRepository(),
        ),
        notificationReadStoreProvider.overrideWithValue(
          MemoryNotificationReadStore(),
        ),
        sessionProvider.overrideWith(_Session.new),
        portfolioRepositoryProvider.overrideWithValue(repo),
        kycRepositoryProvider.overrideWithValue(_Kyc()),
      ],
      child: MaterialApp.router(theme: buildAppTheme(), routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));
  test(
    'API paginates all positions and reads the real private detail',
    () async {
      final adapter = _Adapter();
      final dio = Dio(BaseOptions(baseUrl: 'https://test.local'))
        ..httpClientAdapter = adapter;
      final repo = ApiPortfolioRepository(dio);
      final cancel = CancelToken();
      final list = await repo.list(cancelToken: cancel);
      final detail = await repo.get('CS61-REAL-01');
      expect(list.map((p) => p.batch.code), ['PAGE-1', 'PAGE-2']);
      expect(list.first.amount, 25000001);
      expect(list.first.sharePct, 25);
      expect(
        adapter.requests.take(2).map((r) => r.queryParameters['pageSize']),
        [100, 100],
      );
      expect(adapter.requests.first.cancelToken, same(cancel));
      expect(detail.position.amount, 25000001);
      expect(detail.contributions.single.contractNo, 'CT-61');
      expect(detail.latestProduction!.ph, 7.8);
      expect(detail.timeline.single.label, 'Thả giống');
      expect(
        adapter.requests.last.path,
        '/api/investor/portfolio/CS61-REAL-01',
      );
    },
  );
  test(
    'unknown fields stay unknown; gauge clamps without changing actual days',
    () {
      final json = position(ratio: null);
      json['lastConfirmedAt'] = null;
      json['batch']['aliveCount'] = null;
      json['batch']['dayOfCycle'] = 100;
      final p = portfolioPositionFromJson(json);
      expect(p.sharePct, isNull);
      expect(p.paidAt, isNull);
      expect(p.batch.aliveCount, isNull);
      expect(p.ratioLabel, 'Chưa có tỷ lệ vốn');
      expect(p.batch.dayOfCycle, 100);
      expect(p.batch.cycleProgress, 1);
      expect(
        portfolioPositionFromJson(position(frozen: false)).ratioLabel,
        'Tạm tính 25% vốn lô',
      );
    },
  );
  test('approved payout keeps integer amounts and negative actual profit', () {
    final json = position();
    json['settlement'] = {
      'status': 'Approved',
      'capitalReturn': 25000001,
      'profitShare': -1000000,
      'taxWithheld': 0,
      'netPayout': 24000001,
      'inKindQtyKg': 2.5,
    };
    final p = portfolioPositionFromJson(json);
    expect(p.settlement!.netPayout, 24000001);
    expect(p.settlement!.profitShare, -1000000);
    expect(p.settlement!.inKindQtyKg, 2.5);
  });
  testWidgets(
    'home gauge and contribution open real detail with no sample finances',
    (tester) async {
      final repo = _Repo();
      await _showHome(tester, repo);
      expect(find.text('44'), findsOneWidget);
      expect(
        tester.widget<SegmentedGauge>(find.byType(SegmentedGauge)).value,
        closeTo(44 / 90, .00001),
      );
      final card = find.text('25.000.001 đ');
      await tester.ensureVisible(card);
      await tester.pumpAndSettle();
      await tester.tap(card);
      await tester.pumpAndSettle();
      expect(repo.requestedCode, 'CS61-REAL-01');
      expect(find.text('Chi tiết danh mục'), findsOneWidget);
      expect(find.text('Vốn đã chốt'), findsOneWidget);
      final contract = find.text('Hợp đồng CT-61 · Đã đủ chữ ký');
      await tester.scrollUntilVisible(
        contract,
        300,
        scrollable: find.descendant(
          of: find.byType(ListView),
          matching: find.byType(Scrollable),
        ).first,
      );
      await tester.pumpAndSettle();
      expect(contract, findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'network failure retries; empty response shows no mock positions',
    (tester) async {
      final repo = _Repo()..fail = true;
      await _showHome(tester, repo);
      expect(find.text('Danh mục tạm thời không tải được.'), findsOneWidget);
      repo.fail = false;
      repo.items = [];
      await tester.tap(find.text('Thử lại'));
      await tester.pumpAndSettle();
      expect(find.text('Bạn chưa góp vốn lô nào'), findsOneWidget);
      expect(find.byType(SegmentedGauge), findsNothing);
      expect(repo.listReads, 2);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('live ratio and large amounts fit phone cards', (tester) async {
    final json = position(frozen: false);
    json['confirmedAmount'] = 125000000001;
    final repo = _Repo()..items = [portfolioPositionFromJson(json)];
    await _showHome(tester, repo);
    final label = find.text('Tạm tính 25% vốn lô');
    await tester.ensureVisible(label);
    await tester.pumpAndSettle();
    expect(label, findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'switching user removes old holdings and cancels disposed reads',
    (tester) async {
      final repo = _Repo();
      await _showHome(tester, repo);
      final scope = ProviderScope.containerOf(
        tester.element(find.byType(InvestorHomePage)),
      );
      final firstCancel = repo.cancels.single;
      repo.items = [];
      (scope.read(sessionProvider.notifier) as _Session).change(62);
      await tester.pumpAndSettle();
      expect(find.text('Bạn chưa góp vốn lô nào'), findsOneWidget);
      expect(find.textContaining('CS61-REAL-01'), findsNothing);
      expect(firstCancel!.isCancelled, isTrue);
      expect(repo.listReads, 2);
    },
  );
  test(
    'non-investor providers and routes deny private portfolio access',
    () async {
      final repo = _Repo();
      final container = ProviderContainer(
        overrides: [
          notificationPollIntervalProvider.overrideWithValue(null),
          notificationRepositoryProvider.overrideWithValue(
            EmptyNotificationRepository(),
          ),
          notificationReadStoreProvider.overrideWithValue(
            MemoryNotificationReadStore(),
          ),
          sessionProvider.overrideWith(
            () => SessionController(session(62, investor: false)),
          ),
          portfolioRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      await expectLater(
        container.read(myContributionsProvider.future),
        throwsStateError,
      );
      expect(repo.listReads, 0);
      expect(
        redirectFor(
          session(62, investor: false),
          Routes.portfolioBatch('CS61-REAL-01'),
        ),
        Routes.unsupported,
      );
    },
  );
}

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crabshare_mobile/app/router.dart';
import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/data/investor_models.dart';
import 'package:crabshare_mobile/features/investor/data/portfolio_repository.dart';
import 'package:crabshare_mobile/features/investor/kyc/kyc_repository.dart';
import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';
import 'package:crabshare_mobile/features/investor/notifications/notifications_page.dart';
import 'package:crabshare_mobile/features/investor/portfolio/portfolio_detail_page.dart';
import 'package:crabshare_mobile/shared/models/batch_enums.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/notification_fakes.dart';

Map<String, dynamic> _json([String id = 'PaymentConfirmed:65']) => {
  'id': id,
  'type': 'PaymentConfirmed',
  'title': 'Đã nhận tiền',
  'body': 'Khoản góp 20.000.001 đ cho lô CS65-TEST đã được xác nhận.',
  'at': '2026-10-15T01:00:00Z',
  'batchCode': 'CS65-TEST',
  'canOpenPortfolio': true,
  'amount': 20000001,
};
NotificationEvent _event([String id = 'PaymentConfirmed:65']) =>
    NotificationEvent.fromJson(_json(id));
SessionState _session(int id) => SessionState(
  token: 'test',
  user: AppUser(
    userId: id,
    fullName: 'Khôi',
    email: '$id@test.local',
    roles: const [Roles.investor],
  ),
);

class _Session extends SessionController {
  _Session() : super(_session(65));
  void change(int id) => state = _session(id);
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

class _Repo implements NotificationRepository {
  List<NotificationEvent> items = [_event()];
  bool fail = false;
  int reads = 0;
  final cancels = <CancelToken?>[];
  @override
  Future<List<NotificationEvent>> list({CancelToken? cancelToken}) async {
    reads++;
    cancels.add(cancelToken);
    if (fail) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 503,
          data: {'detail': 'Không tải được thông báo.'},
        ),
      );
    }
    return items;
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
      jsonEncode({
        'items': [
          _json(
            options.queryParameters['page'] == 1
                ? 'PaymentConfirmed:65'
                : 'PaymentConfirmed:66',
          ),
        ],
        'total': 101,
        'asOf': '2026-10-15T02:00:00Z',
      }),
      200,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _SlowStore extends MemoryNotificationReadStore {
  final gate = Completer<void>();
  @override
  Future<NotificationReadMarker> update(
    int userId,
    NotificationReadMarker Function(NotificationReadMarker) change,
  ) async {
    await gate.future;
    return super.update(userId, change);
  }
}

Future<void> _show(
  WidgetTester tester,
  _Repo repo,
  MemoryNotificationReadStore store, {
  bool fullRouter = false,
}) async {
  tester.view.physicalSize = const Size(360, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        portfolioDetailProvider('CS65-TEST').overrideWith(
          (ref) async => PortfolioDetail(
            position: Contribution(
              batch: const BatchSummary(
                code: 'CS65-TEST',
                title: 'Test portfolio',
                operatorName: 'Test farm',
                crabType: CrabType.fattening,
                status: BatchStatus.funding,
                targetCapital: 50000001,
                raisedCapital: 50000001,
                minContribution: 1000000,
                cycleDays: 90,
                seedQuantity: 100,
              ),
              amount: 20000001,
              sharePct: 40,
              paidAt: DateTime.utc(2026, 10, 15),
            ),
            contributions: [],
            timeline: [],
          ),
        ),
        sessionProvider.overrideWith(_Session.new),
        notificationRepositoryProvider.overrideWithValue(repo),
        notificationReadStoreProvider.overrideWithValue(store),
        notificationPollIntervalProvider.overrideWithValue(null),
        myContributionsProvider.overrideWith((ref) async => []),
        kycRepositoryProvider.overrideWithValue(_Kyc()),
      ],
      child: fullRouter
          ? Consumer(
              builder: (context, ref, child) => MaterialApp.router(
                theme: buildAppTheme(),
                routerConfig: ref.watch(routerProvider),
              ),
            )
          : MaterialApp(
              theme: buildAppTheme(),
              home: const NotificationsPage(),
            ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));
  test(
    'API keeps integer money, fetches every page and reuses server snapshot',
    () async {
      final adapter = _Adapter();
      final dio = Dio(BaseOptions(baseUrl: 'https://test.local'))
        ..httpClientAdapter = adapter;
      final token = CancelToken();
      final list = await ApiNotificationRepository(dio)
          .list(cancelToken: token);
      expect(list.length, 2);
      expect(list.first.amount, 20000001);
      expect(list.first.title, 'Đã nhận tiền');
      expect(
        adapter.requests.last.queryParameters['until'],
        '2026-10-15T02:00:00Z',
      );
      expect(adapter.requests.first.cancelToken, same(token));
    },
  );
  test('read marker round trips, preserves single reads and handles same-time arrivals', () {
    final n = _event();
    final later = _event('PaymentConfirmed:66');
    final one = const NotificationReadMarker().one(n);
    expect(one.isUnread(n), isFalse);
    expect(one.isUnread(later), isTrue);
    final all = NotificationReadMarker.decode(one.all([n]).encode());
    expect(all.through, n.at);
    expect(all.isUnread(n), isFalse);
    expect(all.isUnread(later), isTrue);
    expect(NotificationReadMarker.decode('bad json').isUnread(n), isTrue);
    final older = NotificationEvent.fromJson({
      ..._json('PaymentConfirmed:old'),
      'at': '2026-10-14T00:00:00Z',
    });
    expect(all.all([older]).through, all.through);
  });
  testWidgets(
    'page displays actual receipt and opening does not clear unread count',
    (tester) async {
      final store = MemoryNotificationReadStore();
      await _show(tester, _Repo(), store);
      expect(find.text('Đã nhận tiền'), findsOneWidget);
      expect(find.text('1 chưa đọc'), findsOneWidget);
      expect(store.markers, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('mark all persists on this device and account across a rebuild', (
    tester,
  ) async {
    final store = MemoryNotificationReadStore();
    final repo = _Repo();
    await _show(tester, repo, store);
    await tester.tap(find.text('Đọc tất cả'));
    await tester.pumpAndSettle();
    expect(find.text('0 chưa đọc'), findsOneWidget);
    expect(store.markers[65]!.through, repo.items.single.at);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    await _show(tester, repo, store);
    expect(find.text('0 chưa đọc'), findsOneWidget);
    repo.items = [_event('PaymentConfirmed:66'), _event()];
    await tester.tap(find.byTooltip('Làm mới thông báo'));
    await tester.pumpAndSettle();
    expect(find.text('1 chưa đọc'), findsOneWidget);
  });
  testWidgets('save failure retains unread count and retry can save', (
    tester,
  ) async {
    final store = MemoryNotificationReadStore()..fail = true;
    await _show(tester, _Repo(), store);
    await tester.tap(find.text('Đọc tất cả'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Không lưu được mốc đã đọc'), findsOneWidget);
    expect(find.text('1 chưa đọc'), findsOneWidget);
    store.fail = false;
    await tester.tap(find.text('Đọc tất cả'));
    await tester.pumpAndSettle();
    expect(find.text('0 chưa đọc'), findsOneWidget);
  });
  testWidgets(
    'network error retries to an empty API feed without sample data',
    (tester) async {
      final repo = _Repo()..fail = true;
      await _show(tester, repo, MemoryNotificationReadStore());
      expect(find.text('Không tải được thông báo.'), findsOneWidget);
      repo.fail = false;
      repo.items = [];
      await tester.tap(find.text('Thử lại'));
      await tester.pumpAndSettle();
      expect(find.text('Chưa có thông báo'), findsOneWidget);
      expect(find.text('Đã nhận tiền'), findsNothing);
    },
  );
  testWidgets(
    'real investor nav badge opens notifications and private portfolio route',
    (tester) async {
      final repo = _Repo();
      await _show(
        tester,
        repo,
        MemoryNotificationReadStore(),
        fullRouter: true,
      );
      final badge = find
          .byWidgetPredicate(
            (w) =>
                w is Semantics && w.properties.label == 'Thông báo, 1 chưa đọc',
          )
          .last;
      expect(badge, findsOneWidget);
      await tester.tap(badge);
      await tester.pumpAndSettle();
      expect(find.byType(NotificationsPage), findsOneWidget);
      final link = find.text('Xem lô CS65-TEST');
      await tester.ensureVisible(link);
      await tester.pumpAndSettle();
      await tester.tap(link);
      await tester.pumpAndSettle();
      expect(find.byType(InvestorPortfolioDetailPage), findsOneWidget);
      final context = tester.element(find.byType(InvestorPortfolioDetailPage));
      expect(
        GoRouterState.of(context).matchedLocation,
        Routes.portfolioBatch('CS65-TEST'),
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'pending read write stays on the original user after switching accounts',
    (tester) async {
      final repo = _Repo();
      final store = _SlowStore();
      await _show(tester, repo, store);
      final container = ProviderScope.containerOf(
        tester.element(find.byType(NotificationsPage)),
      );
      await tester.tap(find.text('Đọc tất cả'));
      await tester.pump();
      final oldCancel = repo.cancels.single;
      repo.items = [_event('PaymentConfirmed:other')];
      (container.read(sessionProvider.notifier) as _Session).change(66);
      await tester.pumpAndSettle();
      store.gate.complete();
      await tester.pumpAndSettle();
      expect(find.text('1 chưa đọc'), findsOneWidget);
      expect(store.markers[66], isNull);
      expect(store.markers[65]!.through, isNotNull);
      expect(oldCancel!.isCancelled, isTrue);
    },
  );
  testWidgets(
    'single-read action leaves other events unread on a narrow screen',
    (tester) async {
      final repo = _Repo()..items = [_event(), _event('PaymentConfirmed:66')];
      await _show(tester, repo, MemoryNotificationReadStore());
      final button = find.text('Đã đọc').first;
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(find.text('1 chưa đọc'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

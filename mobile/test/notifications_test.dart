import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';
import 'package:crabshare_mobile/features/investor/notifications/notifications_page.dart';
import 'package:crabshare_mobile/features/investor/portfolio/portfolio_detail_page.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/investor_fixtures.dart';
import 'helpers/notification_fakes.dart';

Map<String, dynamic> _json([String id = 'PaymentConfirmed:65', String type = 'PaymentConfirmed']) => {
  'id': id,
  'type': type,
  'title': type == 'AlertRaised' ? 'Cảnh báo vận hành' : 'Đã nhận tiền',
  'body': 'Khoản góp 20.000.001 đ cho lô CS-P1 đã được xác nhận.',
  'at': '2026-10-15T01:00:00Z',
  'batchCode': 'CS-P1',
  'canOpenPortfolio': true,
  'amount': 20000001,
};
NotificationEvent _event([String id = 'PaymentConfirmed:65', String type = 'PaymentConfirmed']) =>
    NotificationEvent.fromJson(_json(id, type));

class _Repo implements NotificationRepository {
  List<NotificationEvent> items = [_event()];
  bool fail = false;
  final cancels = <CancelToken?>[];
  @override
  Future<List<NotificationEvent>> list({CancelToken? cancelToken}) async {
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

Future<void> _show(WidgetTester tester, _Repo repo, MemoryNotificationReadStore store) =>
    pumpInvestor(tester, FakeApi(), home: const NotificationsPage(), notifications: repo, readStore: store);

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
      expect(adapter.requests.first.path, '/api/me/notifications');
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

  testWidgets('page shows the feed and counts unread without marking anything by itself', (tester) async {
    final store = MemoryNotificationReadStore();
    await _show(tester, _Repo(), store);
    expect(find.text('Đã nhận tiền'), findsOneWidget);
    expect(find.text('Đọc tất cả (1)'), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Chưa đọc'), findsOneWidget);
    expect(store.markers, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mark all persists on this device and account across a rebuild', (tester) async {
    final store = MemoryNotificationReadStore();
    final repo = _Repo();
    await _show(tester, repo, store);
    await tester.tap(find.text('Đọc tất cả (1)'));
    await settle(tester);
    expect(find.textContaining('Đọc tất cả'), findsNothing);
    expect(store.markers[42]!.through, repo.items.single.at);

    await tester.pumpWidget(const SizedBox());
    await settle(tester);
    await _show(tester, repo, store);
    expect(find.textContaining('Đọc tất cả'), findsNothing);

    repo.items = [_event('PaymentConfirmed:66'), _event()];
    ProviderScope.containerOf(tester.element(find.byType(NotificationsPage))).invalidate(investorNotificationsProvider);
    await settle(tester);
    expect(find.text('Đọc tất cả (1)'), findsOneWidget);
  });

  testWidgets('save failure retains unread count and retry can save', (tester) async {
    final store = MemoryNotificationReadStore()..fail = true;
    await _show(tester, _Repo(), store);
    await tester.tap(find.text('Đọc tất cả (1)'));
    await settle(tester);
    expect(find.textContaining('Không lưu được mốc đã đọc'), findsOneWidget);
    expect(find.text('Đọc tất cả (1)'), findsOneWidget);
    store.fail = false;
    await tester.tap(find.text('Đọc tất cả (1)'));
    await settle(tester);
    expect(find.textContaining('Đọc tất cả'), findsNothing);
  });

  testWidgets('network error retries to an empty API feed without sample data', (tester) async {
    final repo = _Repo()..fail = true;
    await _show(tester, repo, MemoryNotificationReadStore());
    expect(find.text('Không tải được thông báo.'), findsOneWidget);
    repo.fail = false;
    repo.items = [];
    await tester.tap(find.text('Thử lại'));
    await settle(tester);
    expect(find.text('Chưa có thông báo'), findsOneWidget);
    expect(find.text('Đã nhận tiền'), findsNothing);
  });

  testWidgets('nav badge opens notifications; tapping an alert marks it read and opens the batch timeline', (tester) async {
    final repo = _Repo()..items = [_event('AlertRaised:3', 'AlertRaised'), _event()];
    final store = MemoryNotificationReadStore();
    final api = FakeApi()
      ..get('/api/investor/portfolio', portfolioPage([portfolioItem()]))
      ..get('/api/investor/portfolio/CS-P1', portfolioDetail(portfolioItem()))
      ..get('/api/batches/CS-P1/timeline', {'batchCode': 'CS-P1', 'timeZone': 'Asia/Ho_Chi_Minh', 'groups': [], 'hasMore': false, 'nextBefore': null});
    await pumpInvestor(tester, api, location: Routes.investorHome, notifications: repo, readStore: store);

    final badge = find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Thông báo, 2 chưa đọc').last;
    expect(badge, findsOneWidget);
    await tester.tap(badge);
    await settle(tester);
    expect(find.byType(NotificationsPage), findsOneWidget);

    await tester.tap(find.text('Cảnh báo vận hành'));
    await settle(tester);
    expect(find.byType(PortfolioDetailPage), findsOneWidget);
    final state = GoRouterState.of(tester.element(find.byType(PortfolioDetailPage)));
    expect(state.uri.toString(), '/i/portfolio/CS-P1?tab=nhat-trinh');
    expect(find.text('Chưa có ghi nhận nào'), findsOneWidget);
    expect(store.markers[42]!.itemIds, {'AlertRaised:3'});
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending read write stays on the original user after switching accounts', (tester) async {
    final repo = _Repo();
    final store = _SlowStore();
    await _show(tester, repo, store);
    final container = ProviderScope.containerOf(tester.element(find.byType(NotificationsPage)));
    await tester.tap(find.text('Đọc tất cả (1)'));
    await tester.pump();
    final oldCancel = repo.cancels.single;
    repo.items = [_event('PaymentConfirmed:other')];
    (container.read(sessionProvider.notifier) as TestSession).change(66);
    await settle(tester);
    store.gate.complete();
    await settle(tester);
    expect(find.text('Đọc tất cả (1)'), findsOneWidget);
    expect(store.markers[66], isNull);
    expect(store.markers[42]!.through, isNotNull);
    expect(oldCancel!.isCancelled, isTrue);
  });

  testWidgets('tapping one notification leaves the others unread', (tester) async {
    final store = MemoryNotificationReadStore();
    // Thông báo không mở được Lô thì bấm vào chỉ đánh dấu đã đọc.
    final repo = _Repo()
      ..items = [
        NotificationEvent.fromJson({..._json(), 'canOpenPortfolio': false}),
        NotificationEvent.fromJson({..._json('PaymentConfirmed:66'), 'canOpenPortfolio': false}),
      ];
    await _show(tester, repo, store);
    expect(find.text('Đọc tất cả (2)'), findsOneWidget);
    await tester.tap(find.text('Đã nhận tiền').first);
    await settle(tester);
    expect(find.text('Đọc tất cả (1)'), findsOneWidget);
    expect(store.markers[42]!.itemIds, {'PaymentConfirmed:65'});
    expect(tester.takeException(), isNull);
  });
}

import 'dart:async';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_detail_page.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_explore_page.dart';
import 'package:crabshare_mobile/features/investor/data/investor_repository.dart';
import 'package:crabshare_mobile/features/investor/data/timeline_repository.dart';
import 'package:crabshare_mobile/shared/models/batch_enums.dart';
import 'package:crabshare_mobile/shared/widgets/app_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/timeline_fakes.dart';

SessionState discoverySession(int id) => SessionState(
  token: 'test',
  user: AppUser(
    userId: id,
    email: 'test@local',
    fullName: 'Nhà đầu tư',
    roles: [Roles.investor],
  ),
);

class DiscoverySessionController extends SessionController {
  DiscoverySessionController() : super(discoverySession(42));
  void changeUser(int id) => state = discoverySession(id);
}

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));
  test(
    'discovery requires investor and reloads for an account change',
    () async {
      var calls = 0;
      final dio = discoveryDio((request) {
        calls++;
        return jsonResponse(
          request.path == '/api/batches'
              ? {'items': [], 'page': 1, 'pageSize': 20, 'total': 0}
              : discoveryBatch(),
        );
      });
      final signedOut = ProviderContainer(
        overrides: [dioProvider.overrideWithValue(dio)],
      );
      addTearDown(signedOut.dispose);
      await expectLater(
        signedOut.read(batchesProvider.future),
        throwsStateError,
      );
      await expectLater(
        signedOut.read(batchDetailProvider('CS42').future),
        throwsStateError,
      );
      expect(calls, 0);
      final container = ProviderContainer(
        overrides: [
          sessionProvider.overrideWith(DiscoverySessionController.new),
          timelineRepositoryProvider.overrideWithValue(EmptyTimelineRepository()),
          dioProvider.overrideWithValue(dio),
        ],
      );
      addTearDown(container.dispose);
      final listSub = container.listen(batchesProvider, (_, _) {});
      final detailSub = container.listen(
        batchDetailProvider('CS42'),
        (_, _) {},
      );
      addTearDown(listSub.close);
      addTearDown(detailSub.close);
      await container.read(batchesProvider.future);
      await container.read(batchDetailProvider('CS42').future);
      expect(calls, 2);
      (container.read(sessionProvider.notifier) as DiscoverySessionController)
          .changeUser(43);
      await container.read(batchesProvider.future);
      await container.read(batchDetailProvider('CS42').future);
      expect(calls, 4);
    },
  );
  testWidgets('cancelled detail does not imply later lifecycle stages', (
    tester,
  ) async {
    final data = discoveryBatch()..['status'] = 'Cancelled';
    final dio = discoveryDio((_) => jsonResponse(data));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith(DiscoverySessionController.new),
          timelineRepositoryProvider.overrideWithValue(EmptyTimelineRepository()),
          dioProvider.overrideWithValue(dio),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const BatchDetailPage(code: 'CS42'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Tiến trình lô'),
      250,
      scrollable: find.descendant(
        of: find.byType(ListView),
        matching: find.byType(Scrollable),
      ).first,
    );
    expect(find.text('Đã huỷ'), findsWidgets);
    expect(find.text('Đang quyết toán'), findsNothing);
    expect(find.text('Đã đóng'), findsNothing);
  });
  testWidgets('loading, error retry, empty and server filters/paging', (
    tester,
  ) async {
    final gate = Completer<void>();
    var attempts = 0;
    final requests = <Map<String, dynamic>>[];
    final dio = discoveryDio((request) {
      requests.add(Map.of(request.queryParameters));
      attempts++;
      if (attempts == 1) {
        return jsonResponse({'detail': 'Máy chủ tạm lỗi'}, 500);
      }
      return jsonResponse({
        'items': [],
        'page': request.queryParameters['page'],
        'pageSize': 20,
        'total': 25,
      });
    });
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          await gate.future;
          handler.next(options);
        },
      ),
    );
    final container = ProviderContainer(
      overrides: [
        sessionProvider.overrideWith(DiscoverySessionController.new),
        timelineRepositoryProvider.overrideWithValue(EmptyTimelineRepository()),
        dioProvider.overrideWithValue(dio),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const BatchExplorePage(),
        ),
      ),
    );
    expect(find.byType(LoadingSkeleton), findsOneWidget);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Máy chủ tạm lỗi'), findsOneWidget);
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();
    expect(find.text('Không có lô phù hợp'), findsOneWidget);
    await tester.tap(find.text('Trang sau'));
    await tester.pumpAndSettle();
    expect(requests.last['page'], 2);
    await tester.tap(find.byType(DropdownButtonFormField<CrabType>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cua gạch').last);
    await tester.pumpAndSettle();
    expect(requests.last['crabType'], 'RoeCrab');
    expect(requests.last['page'], 1);
    await tester.tap(find.byType(DropdownButtonFormField<BatchStatus>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đã đóng').last);
    await tester.pumpAndSettle();
    expect(requests.last['status'], 'Closed');
  });
  testWidgets(
    'list navigates by batch code and renders backend percent identically',
    (tester) async {
      final paths = <String>[];
      final dio = discoveryDio((request) {
        paths.add(request.path);
        return jsonResponse(
          request.path == '/api/batches'
              ? {
                  'items': [discoveryBatch()],
                  'page': 1,
                  'pageSize': 20,
                  'total': 1,
                }
              : discoveryBatch(),
        );
      });
      final router = GoRouter(
        initialLocation: '/i/batches',
        routes: [
          GoRoute(
            path: '/i/batches',
            builder: (_, _) => const BatchExplorePage(),
          ),
          GoRoute(
            path: '/batches/:code',
            builder: (_, state) =>
                BatchDetailPage(code: state.pathParameters['code']!),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionProvider.overrideWith(DiscoverySessionController.new),
            timelineRepositoryProvider.overrideWithValue(EmptyTimelineRepository()),
            dioProvider.overrideWithValue(dio),
          ],
          child: MaterialApp.router(
            theme: buildAppTheme(),
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('33,33%'), findsOneWidget);
      await tester.tap(find.text('Lô đã công bố'));
      await tester.pumpAndSettle();
      expect(paths, contains('/api/batches/CS42'));
      final detailScroll = find.descendant(
        of: find.byType(ListView),
        matching: find.byType(Scrollable),
      ).first;
      await tester.scrollUntilVisible(
        find.text('33,33% mục tiêu'), 250, scrollable: detailScroll,
      );
      expect(find.text('33,33% mục tiêu'), findsOneWidget);
      expect(find.textContaining('ROI'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Chi phí chuẩn đã khóa'), 250, scrollable: detailScroll,
      );
      expect(find.text('Chi phí chuẩn đã khóa'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('unavailable detail explains and supports retry', (tester) async {
    var unavailable = true;
    final dio = discoveryDio(
      (_) =>
          unavailable ? jsonResponse({}, 404) : jsonResponse(discoveryBatch()),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith(DiscoverySessionController.new),
          timelineRepositoryProvider.overrideWithValue(EmptyTimelineRepository()),
          dioProvider.overrideWithValue(dio),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const BatchDetailPage(code: 'CS42'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Lô không tồn tại hoặc không còn được phép xem.'),
      findsOneWidget,
    );
    unavailable = false;
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();
    expect(find.text('Lô đã công bố'), findsOneWidget);
  });
}

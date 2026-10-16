import 'dart:async';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/auth/auth_repository.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/auth/login_page.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_page.dart';
import 'package:crabshare_mobile/features/operator/packing/pack_order_page.dart';
import 'package:crabshare_mobile/features/operator/data/operator_orders_repository.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_detail_page.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_explore_page.dart';
import 'package:crabshare_mobile/features/investor/data/investor_models.dart';
import 'package:crabshare_mobile/features/investor/data/investor_repository.dart';
import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';
import 'package:crabshare_mobile/features/trace/scan_page.dart';
import 'package:crabshare_mobile/shared/widgets/app_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/notification_fakes.dart';
import 'pages_smoke_test.dart' show smokePages;

const _user = AppUser(
  userId: 69,
  email: 'offline@local',
  fullName: '',
  roles: [Roles.investor, Roles.operatorMember],
  operatorId: 1,
);
const _session = SessionState(token: 'old', user: _user);

Widget _app(Widget page, Dio dio) => ProviderScope(
  retry: (_, _) => null,
  overrides: [
    dioProvider.overrideWithValue(dio),
    sessionProvider.overrideWith(() => SessionController(_session)),
    notificationPollIntervalProvider.overrideWithValue(null),
    notificationReadStoreProvider.overrideWithValue(
      MemoryNotificationReadStore(),
    ),
  ],
  child: MaterialApp(
    theme: buildAppTheme(),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context)
          .copyWith(textScaler: const TextScaler.linear(1.3)),
      child: child!,
    ),
    home: page,
  ),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('vi_VN'));
  testWidgets(
    'harvest demo rows fit small screens and camera failures stay handled',
    (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        _app(
          const HarvestPage(batchCode: 'CS-2609-04'),
          discoveryDio((_) => jsonResponse({})),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));
      await tester.scrollUntilVisible(
        find.byType(TextField),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(find.byType(TextField), '420');
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Tạo tem minh hoạ'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Tạo tem minh hoạ'));
      await tester.pump(const Duration(milliseconds: 500));
      ScaffoldMessenger.of(tester.element(find.byType(HarvestPage)))
          .clearSnackBars();
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Ảnh minh hoạ'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      const cameraChannel = MethodChannel('plugins.flutter.io/image_picker');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            cameraChannel,
            (_) async => throw PlatformException(code: 'camera_access_denied'),
          );
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(cameraChannel, null),
      );
      await tester.tap(find.text('Ảnh minh hoạ'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Không mở được camera.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('packing manual entry enables Add as the user types', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          operatorOrdersRepositoryProvider.overrideWithValue(
            MockOperatorOrdersRepository(),
          ),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const PackOrderPage(orderNo: 'ODPACKDEMO01'),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));
    await tester.scrollUntilVisible(
      find.byType(TextField),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(find.byType(TextField), 'CSAB23CD45EF');
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Thêm'),
      100,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Thêm'))
          .onPressed,
      isNotNull,
    );
    await tester.tap(find.text('Thêm'));
    await tester.pumpAndSettle();
    expect(find.text('CSAB23CD45EF'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'contribution instructions scroll on a short phone with large text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        _app(
          const BatchDetailPage(code: 'CS42'),
          discoveryDio((_) => jsonResponse(discoveryBatch())),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Góp vốn · tối thiểu'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Mở trang góp vốn'),
        180,
        scrollable: find
            .descendant(
              of: find.byType(BottomSheet),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('Mở trang góp vốn').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  final livePages = <String>{
    'NĐT · Tổng quan',
    'NĐT · Khám phá lô',
    'NĐT · Chi tiết lô đang gọi vốn',
    'NĐT · Chi tiết lô đang nuôi',
    'NĐT · Thông báo',
    'NĐT · eKYC',
    'NĐT · Chi tiết danh mục',
    'Hộ nuôi · Bằng chứng gắn cờ',
    'Hộ nuôi · Giải trình',
    'Hộ nuôi · Chụp bằng chứng',
    'Hộ nuôi · Cảnh báo',
    'Tài khoản nhận tiền',
    'Hộ nuôi · Đóng gói đơn',
    'Hộ nuôi · Quét tem đóng gói',
    'Hộ nuôi · Hôm nay',
  };
  for (final MapEntry(key: name, value: page) in smokePages.entries) {
    testWidgets(
      '$name opens offline at 320px and refresh failures stay handled',
      (tester) async {
        tester.view.physicalSize = const Size(320, 568);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        var requests = 0;
        final dio = discoveryDio((request) {
          requests++;
          throw DioException(
            requestOptions: request,
            type: DioExceptionType.connectionError,
          );
        });
        addTearDown(() => dio.close(force: true));
        await tester.pumpWidget(_app(page, dio));
        await tester.pump(const Duration(milliseconds: 600));
        await tester.pump(const Duration(milliseconds: 100));
        expect(tester.takeException(), isNull);
        if (livePages.contains(name)) {
          expect(requests, greaterThan(0));
          expect(
            find.textContaining('Không kết nối được máy chủ.'),
            findsWidgets,
          );
          final before = requests;
          final refresh = tester
              .widget<RefreshIndicator>(find.byType(RefreshIndicator).first)
              .onRefresh();
          await tester.pump(const Duration(milliseconds: 600));
          await refresh;
          await tester.pump();
          expect(requests, greaterThan(before));
          expect(tester.takeException(), isNull);
        }
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'discovery retries successfully then handles a real offline refresh gesture',
    (tester) async {
      var offline = true;
      final dio = discoveryDio((request) {
        if (offline) {
          throw DioException(
            requestOptions: request,
            type: DioExceptionType.connectionError,
          );
        }
        return jsonResponse({
          'items': [discoveryBatch()],
          'page': 1,
          'pageSize': 20,
          'total': 1,
        });
      });
      addTearDown(() => dio.close(force: true));
      await tester.pumpWidget(_app(const BatchExplorePage(), dio));
      await tester.pumpAndSettle();
      offline = false;
      await tester.tap(find.text('Thử lại'));
      await tester.pumpAndSettle();
      expect(find.text('Lô đã công bố'), findsOneWidget);
      offline = true;
      await tester.drag(find.byType(ListView).first, const Offset(0, 500));
      await tester.pumpAndSettle();
      expect(find.textContaining('Không kết nối được máy chủ.'), findsWidgets);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'pending reads show accessible skeletons and can be left safely',
    (tester) async {
      final pending = Completer<BatchPage>();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [batchesProvider.overrideWith((ref) => pending.future)],
          child: MaterialApp(
            theme: buildAppTheme(),
            home: const BatchExplorePage(),
          ),
        ),
      );
      await tester.pump();
      expect(find.byType(LoadingSkeleton), findsOneWidget);
      expect(find.bySemanticsLabel('Đang tải nội dung'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      pending.completeError(
        DioException(
          requestOptions: RequestOptions(),
          type: DioExceptionType.connectionError,
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'manual trace remains scrollable with keyboard on a small phone',
    (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        _app(const ScanPage(), discoveryDio((_) => jsonResponse({}))),
      );
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      await tester.pump();
      await tester.scrollUntilVisible(
        find.byType(TextField),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(find.byType(TextField), 'CSAB23CD45EF');
      await tester.pump();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'leaving a pending login does not read a disposed ref or sign in',
    (tester) async {
      final pending = Completer<(String, AppUser)>();
      final repository = _PendingAuth(pending);
      final container = ProviderContainer(
        overrides: [authRepositoryProvider.overrideWithValue(repository)],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(theme: buildAppTheme(), home: const LoginPage()),
        ),
      );
      await tester.enterText(find.byType(TextFormField).at(0), 'test@local');
      await tester.enterText(find.byType(TextFormField).at(1), 'password123');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      expect(repository.calls, 1);
      await tester.pumpWidget(const SizedBox());
      pending.complete(('new', _user));
      await tester.pump();
      expect(container.read(sessionProvider).isSignedIn, isFalse);
      expect(tester.takeException(), isNull);
    },
  );

  test('malformed validation responses, cancellations and timeouts have safe messages', () {
    for (final errors in [
      {'name': 'Tên không hợp lệ'},
      {
        'name': ['A', 3, null],
        'other': 42,
      },
      {'name': null},
    ]) {
      final request = RequestOptions();
      final error = DioException(
        requestOptions: request,
        response: Response(
          requestOptions: request,
          statusCode: 400,
          data: {'errors': errors},
        ),
      );
      expect(apiErrorMessage(error), isNotEmpty);
    }
    expect(
      apiErrorMessage(
        DioException(
          requestOptions: RequestOptions(),
          type: DioExceptionType.cancel,
        ),
      ),
      contains('huỷ'),
    );
    for (final type in [
      DioExceptionType.connectionError,
      DioExceptionType.connectionTimeout,
      DioExceptionType.receiveTimeout,
    ]) {
      expect(
        apiErrorMessage(
          DioException(requestOptions: RequestOptions(), type: type),
        ),
        contains('kết nối mạng'),
      );
    }
  });

  test(
    'a stale 401 cannot log out the newer session; a current 401 signs out',
    () async {
      final controller = _SwitchSession();
      final container = ProviderContainer(
        overrides: [sessionProvider.overrideWith(() => controller)],
      );
      addTearDown(container.dispose);
      final dio = container.read(dioProvider);
      addTearDown(() => dio.close(force: true));
      dio.httpClientAdapter = DiscoveryAdapter((request) {
        if (request.path == '/stale') controller.change('new');
        return jsonResponse({}, 401);
      });
      await expectLater(
        dio.get<dynamic>('/stale'),
        throwsA(isA<DioException>()),
      );
      expect(container.read(sessionProvider).token, 'new');
      expect(controller.signOuts, 0);
      await expectLater(
        dio.get<dynamic>('/current'),
        throwsA(isA<DioException>()),
      );
      expect(container.read(sessionProvider).isSignedIn, isFalse);
      expect(controller.signOuts, 1);
    },
  );

  test('failed secure storage write leaves the user signed out', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
          (_) async => throw PlatformException(code: 'unavailable'),
        );
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
            null,
          ),
    );
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await expectLater(
      container.read(sessionProvider.notifier).signIn('new', _user),
      throwsA(isA<PlatformException>()),
    );
    expect(container.read(sessionProvider).isSignedIn, isFalse);
  });
}

class _PendingAuth extends AuthRepository {
  _PendingAuth(this.pending) : super(Dio());
  final Completer<(String, AppUser)> pending;
  int calls = 0;
  @override
  Future<(String, AppUser)> login(String email, String password) {
    calls++;
    return pending.future;
  }
}

class _SwitchSession extends SessionController {
  _SwitchSession() : super(_session);
  int signOuts = 0;
  void change(String token) => state = SessionState(token: token, user: _user);
  @override
  Future<void> signOut() async {
    signOuts++;
    state = const SessionState();
    throw PlatformException(code: 'storage_unavailable');
  }
}

import 'dart:async';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/operator/data/operator_repository.dart';
import 'package:crabshare_mobile/features/operator/logs/daily_log_form_page.dart';
import 'package:crabshare_mobile/features/operator/logs/daily_logs_page.dart';
import 'package:crabshare_mobile/features/operator/logs/production_threshold_section.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/production_fakes.dart';

// Dio schedules work on timers even with an in-memory adapter. A frame-only
// pumpAndSettle can return between the batch response and the threshold request.
Future<void> pumpUntil(
  WidgetTester tester,
  bool Function() isReady, {
  required String reason,
}) async {
  for (var attempt = 0; attempt < 250; attempt++) {
    await tester.pump(const Duration(milliseconds: 20));
    if (isReady()) {
      await tester.pumpAndSettle();
      return;
    }
  }
  fail('Timed out waiting for $reason');
}

Future<T> pumpFuture<T>(WidgetTester tester, Future<T> future) async {
  var completed = false;
  late T result;
  Object? failure;
  StackTrace? failureStack;
  future.then(
    (value) {
      result = value;
      completed = true;
    },
    onError: (Object error, StackTrace stack) {
      failure = error;
      failureStack = stack;
      completed = true;
    },
  );
  await pumpUntil(tester, () => completed, reason: 'provider response');
  if (failure != null) {
    Error.throwWithStackTrace(failure!, failureStack!);
  }
  return result;
}

Future<void> waitForConfiguration(WidgetTester tester) => pumpUntil(tester, () {
  final sections = find.byType(ProductionThresholdSection);
  if (sections.evaluate().isEmpty) return false;
  final section = tester.widget<ProductionThresholdSection>(sections);
  final container = ProviderScope.containerOf(tester.element(sections));
  return !container
      .read(productionThresholdsProvider(section.batchCode))
      .isLoading;
}, reason: 'batch and water configuration');

Future<void> openForm(
  WidgetTester tester,
  ProductionServer server, {
  Dio? dio,
}) async {
  tester.view.physicalSize = const Size(480, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [dioProvider.overrideWithValue(dio ?? server.dio())],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const DailyLogFormPage(),
      ),
    ),
  );
  await waitForConfiguration(tester);
}

Future<void> enterMeasurements(WidgetTester tester) async {
  for (final (key, value) in [
    ('log-ph', '8,3'),
    ('log-waterTempC', '-1,2'),
    ('log-salinityPpt', '17,3'),
    ('log-feedKg', '1,234'),
  ]) {
    await tester.ensureVisible(find.byKey(ValueKey(key)));
    await tester.enterText(find.byKey(ValueKey(key)), value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => initializeDateFormatting('vi_VN'));

  testWidgets(
    'Owner must configure blank water ranges before first daily log',
    (tester) async {
      final server = ProductionServer()..current = null;
      await openForm(tester, server);
      expect(find.textContaining('21/10/2026'), findsWidgets);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const ValueKey('save-log')))
            .onPressed,
        isNull,
      );
      await tester.tap(find.text('Cấu hình ngưỡng'));
      await tester.pumpAndSettle();
      for (final (key, value) in [
        ('phMin', '6,1'),
        ('phMax', '8,2'),
        ('waterTempMinC', '-2,5'),
        ('waterTempMaxC', '31,7'),
        ('salinityMinPpt', '5,3'),
        ('salinityMaxPpt', '17,3'),
      ]) {
        final field = find.byKey(ValueKey('threshold-$key'));
        expect(tester.widget<TextFormField>(field).controller!.text, isEmpty);
        await tester.ensureVisible(field);
        await tester.enterText(field, value);
      }
      await tester.ensureVisible(find.byKey(const ValueKey('save-thresholds')));
      await tester.tap(find.byKey(const ValueKey('save-thresholds')));
      await pumpUntil(
        tester,
        () => find.textContaining('phiên bản 1').evaluate().isNotEmpty,
        reason: 'saved threshold version',
      );
      await waitForConfiguration(tester);
      expect(
        server.requests
            .where((r) => r.method == 'PUT')
            .single
            .data['expectedVersionNo'],
        0,
      );
      expect(find.textContaining('phiên bản 1'), findsWidgets);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const ValueKey('save-log')))
            .onPressed,
        isNotNull,
      );
    },
  );

  testWidgets('Staff sees server ranges and cannot edit them', (tester) async {
    final server = ProductionServer()..canConfigure = false;
    await openForm(tester, server);
    expect(find.text('Cấu hình ngưỡng'), findsNothing);
    expect(find.text('Đổi ngưỡng'), findsNothing);
    expect(find.textContaining('6,1–8,2'), findsWidgets);
    expect(find.textContaining('-2,5–31,7'), findsWidgets);
    expect(find.textContaining('5,3–17,3'), findsWidgets);
  });

  testWidgets('unconfigured Staff is directed to Owner and cannot submit', (
    tester,
  ) async {
    final server = ProductionServer()
      ..canConfigure = false
      ..current = null;
    await openForm(tester, server);
    expect(find.textContaining('Owner'), findsWidgets);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('save-log')))
          .onPressed,
      isNull,
    );
    expect(find.byKey(const ValueKey('threshold-phMin')), findsNothing);
  });

  testWidgets('log form retains Harvesting and excludes Stocked', (
    tester,
  ) async {
    final server = ProductionServer()
      ..batches = [
        productionBatchJson(code: 'STOCKED', status: 'Stocked'),
        productionBatchJson(code: 'HARVEST', status: 'Harvesting'),
      ];
    await openForm(tester, server);
    expect(find.widgetWithText(ChoiceChip, 'HARVEST'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, 'STOCKED'), findsNothing);
  });

  testWidgets('409 keeps entered measurements and server problem visible', (
    tester,
  ) async {
    final server = ProductionServer()..postStatus = 409;
    await openForm(tester, server);
    await enterMeasurements(tester);
    await tester.ensureVisible(find.byKey(const ValueKey('save-log')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('save-log')));
    await pumpUntil(
      tester,
      () => find.text('Lô đã có nhật ký hôm nay.').evaluate().isNotEmpty,
      reason: 'duplicate log response',
    );
    await waitForConfiguration(tester);
    expect(find.text('Lô đã có nhật ký hôm nay.'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(find.byKey(const ValueKey('log-feedKg')))
          .controller!
          .text,
      '1,234',
    );
    expect(server.requests.where((r) => r.method == 'POST'), hasLength(1));
  });

  testWidgets('invalid precision cannot send a silently rounded log', (
    tester,
  ) async {
    final server = ProductionServer();
    await openForm(tester, server);
    await enterMeasurements(tester);
    await tester.enterText(find.byKey(const ValueKey('log-feedKg')), '1,2345');
    await tester.ensureVisible(find.byKey(const ValueKey('save-log')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('save-log')));
    await tester.pumpAndSettle();
    expect(server.requests.where((r) => r.method == 'POST'), isEmpty);
    expect(find.textContaining('3 chữ số thập phân'), findsOneWidget);
  });

  testWidgets('configuration refetch error preserves a threshold edit', (
    tester,
  ) async {
    final server = ProductionServer();
    await openForm(tester, server);
    await tester.tap(find.text('Đổi ngưỡng'));
    await tester.pumpAndSettle();
    final field = find.byKey(const ValueKey('threshold-phMin'));
    await tester.ensureVisible(field);
    await tester.enterText(field, '6,4');
    final container = ProviderScope.containerOf(
      tester.element(find.byType(DailyLogFormPage)),
    );
    server.getThresholdStatus = 503;
    container.invalidate(productionThresholdsProvider('REAL-01'));
    await pumpUntil(
      tester,
      () => container.read(productionThresholdsProvider('REAL-01')).hasError,
      reason: 'configuration refetch error',
    );
    expect(tester.widget<TextFormField>(field).controller!.text, '6,4');
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('save-log')),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('save-log')))
          .onPressed,
      isNull,
    );
  });

  testWidgets(
    'server business date permits the new day despite yesterday batch cache',
    (tester) async {
      final server = ProductionServer()
        ..batches = [
          {
            ...productionBatchJson(loggedToday: true),
            'businessDate': '2026-10-20',
          },
        ];
      await openForm(tester, server);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const ValueKey('save-log')))
            .onPressed,
        isNotNull,
      );
      expect(find.text('Lô đã có nhật ký thủ công hôm nay.'), findsNothing);
    },
  );

  testWidgets(
    'pending threshold PUT disables batch selection and log submission',
    (tester) async {
      final server = ProductionServer();
      final gate = Completer<void>();
      final dio = server.dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (request, handler) async {
              if (request.method == 'PUT') await gate.future;
              handler.next(request);
            },
          ),
        );
      await openForm(tester, server, dio: dio);
      await tester.tap(find.text('Đổi ngưỡng'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('save-thresholds')));
      await tester.tap(find.byKey(const ValueKey('save-thresholds')));
      await tester.pump();
      await tester.scrollUntilVisible(
        find.byType(ChoiceChip),
        -250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester.widget<ChoiceChip>(find.byType(ChoiceChip).first).onSelected,
        isNull,
      );
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('save-log')),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester
            .widget<FilledButton>(find.byKey(const ValueKey('save-log')))
            .onPressed,
        isNull,
      );
      gate.complete();
      await pumpUntil(
        tester,
        () => find.textContaining('phiên bản 3').evaluate().isNotEmpty,
        reason: 'released threshold PUT',
      );
      await waitForConfiguration(tester);
    },
  );

  testWidgets('successful PUT shows returned version when its refetch fails', (
    tester,
  ) async {
    final server = ProductionServer();
    await openForm(tester, server);
    await tester.tap(find.text('Đổi ngưỡng'));
    await tester.pumpAndSettle();
    server.getThresholdStatus = 503;
    await tester.ensureVisible(find.byKey(const ValueKey('save-thresholds')));
    await tester.tap(find.byKey(const ValueKey('save-thresholds')));
    await pumpUntil(
      tester,
      () => find.text('Không tải được cấu hình mới.').evaluate().isNotEmpty,
      reason: 'failed refetch after saving thresholds',
    );
    expect(find.textContaining('phiên bản 3'), findsWidgets);
    expect(find.text('Không tải được cấu hình mới.'), findsOneWidget);
  });

  testWidgets('threshold conflict keeps entered ranges and expected version', (
    tester,
  ) async {
    final server = ProductionServer()..putStatus = 409;
    await openForm(tester, server);
    await tester.tap(find.text('Đổi ngưỡng'));
    await tester.pumpAndSettle();
    final field = find.byKey(const ValueKey('threshold-phMin'));
    await tester.ensureVisible(field);
    await tester.enterText(field, '6,4');
    await tester.ensureVisible(find.byKey(const ValueKey('save-thresholds')));
    await tester.tap(find.byKey(const ValueKey('save-thresholds')));
    await pumpUntil(
      tester,
      () => find.text('Cấu hình đã thay đổi.').evaluate().isNotEmpty,
      reason: 'threshold conflict response',
    );
    expect(find.text('Cấu hình đã thay đổi.'), findsOneWidget);
    expect(tester.widget<TextFormField>(field).controller!.text, '6,4');
    expect(
      server.requests
          .where((r) => r.method == 'PUT')
          .single
          .data['expectedVersionNo'],
      2,
    );
  });

  testWidgets(
    'switching account hides earlier records while new requests are pending',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      final server = ProductionServer()..logs = [productionLogJson()];
      final gate = Completer<void>();
      var hold = false;
      final dio = server.dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (request, handler) async {
              if (hold) await gate.future;
              handler.next(request);
            },
          ),
        );
      final container = ProviderContainer(
        overrides: [dioProvider.overrideWithValue(dio)],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: buildAppTheme(),
            home: const DailyLogsPage(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('REAL-01'), findsOneWidget);
      hold = true;
      server.logs = [];
      await container
          .read(sessionProvider.notifier)
          .signIn(
            'second-token',
            const AppUser(
              userId: 2,
              email: 'b@test.local',
              fullName: 'B',
              roles: [Roles.operatorMember],
              operatorId: 2,
            ),
          );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.textContaining('REAL-01'), findsNothing);
      gate.complete();
      await tester.pumpAndSettle();
      expect(find.text('Chưa có nhật ký'), findsOneWidget);
    },
  );

  testWidgets(
    'history preserves feed and salinity precision with source and legacy status',
    (tester) async {
      final server = ProductionServer()
        ..logs = [productionLogJson(), productionLogJson(legacy: true)];
      await tester.pumpWidget(
        ProviderScope(
          overrides: [dioProvider.overrideWithValue(server.dio())],
          child: MaterialApp(
            theme: buildAppTheme(),
            home: const DailyLogsPage(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('1,234'), findsWidgets);
      expect(find.text('17,3'), findsWidgets);
      expect(find.textContaining('Manual'), findsWidgets);
      expect(find.textContaining('Người ghi #7'), findsWidgets);
      expect(find.textContaining('Chưa có phiên bản ngưỡng'), findsWidgets);
      expect(find.text('Không nhất quán'), findsOneWidget);
    },
  );

  testWidgets(
    'closing the form during POST still refreshes committed records',
    (tester) async {
      final server = ProductionServer();
      final gate = Completer<void>();
      final dio = server.dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (request, handler) async {
              if (request.method == 'POST') await gate.future;
              handler.next(request);
            },
          ),
        );
      final container = ProviderContainer(
        overrides: [dioProvider.overrideWithValue(dio)],
      );
      addTearDown(container.dispose);
      final subscriptions = [
        container.listen(dailyLogsProvider, (_, _) {}),
        container.listen(activeBatchesProvider, (_, _) {}),
        container.listen(todaySummaryProvider, (_, _) {}),
      ];
      addTearDown(() {
        for (final subscription in subscriptions) {
          subscription.close();
        }
      });
      await pumpFuture(tester, container.read(dailyLogsProvider.future));
      await pumpFuture(tester, container.read(activeBatchesProvider.future));
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: buildAppTheme(),
            home: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const DailyLogFormPage(),
                    ),
                  ),
                  child: const Text('Open'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await waitForConfiguration(tester);
      await enterMeasurements(tester);
      await tester.ensureVisible(find.byKey(const ValueKey('save-log')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('save-log')));
      await tester.pump();
      Navigator.of(tester.element(find.byType(DailyLogFormPage))).pop();
      await tester.pumpAndSettle();
      gate.complete();
      await pumpUntil(
        tester,
        () =>
            container.read(dailyLogsProvider).value?.length == 1 &&
            container.read(todaySummaryProvider).value?.done == 1,
        reason: 'refresh after closing the form',
      );
      expect(server.requests.where((r) => r.method == 'POST'), hasLength(1));
      expect(
        await pumpFuture(tester, container.read(dailyLogsProvider.future)),
        hasLength(1),
      );
      expect(
        (await pumpFuture(
          tester,
          container.read(todaySummaryProvider.future),
        )).done,
        1,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'successful submit invalidates daily lists, summary, batches and alerts',
    (tester) async {
      final server = ProductionServer();
      final container = ProviderContainer(
        overrides: [dioProvider.overrideWithValue(server.dio())],
      );
      addTearDown(container.dispose);
      final subscriptions = [
        container.listen(dailyLogsProvider, (_, _) {}),
        container.listen(activeBatchesProvider, (_, _) {}),
        container.listen(todaySummaryProvider, (_, _) {}),
        container.listen(alertsProvider, (_, _) {}),
      ];
      addTearDown(() {
        for (final subscription in subscriptions) {
          subscription.close();
        }
      });
      await pumpFuture(tester, container.read(dailyLogsProvider.future));
      await pumpFuture(tester, container.read(todaySummaryProvider.future));
      await pumpFuture(tester, container.read(alertsProvider.future));
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: buildAppTheme(),
            home: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const DailyLogFormPage(),
                    ),
                  ),
                  child: const Text('Open'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await waitForConfiguration(tester);
      await enterMeasurements(tester);
      server.requests.clear();
      await tester.ensureVisible(find.byKey(const ValueKey('save-log')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('save-log')));
      await pumpUntil(
        tester,
        () => find.byType(DailyLogFormPage).evaluate().isEmpty,
        reason: 'successful submit navigation',
      );
      expect(find.textContaining('Đã lưu nhật ký lên máy chủ'), findsOneWidget);
      expect(
        await pumpFuture(tester, container.read(dailyLogsProvider.future)),
        hasLength(1),
      );
      expect(
        (await pumpFuture(
          tester,
          container.read(todaySummaryProvider.future),
        )).done,
        1,
      );
      expect(server.requests.any((r) => r.path.endsWith('/alerts')), isTrue);
      expect(find.byType(DailyLogFormPage), findsNothing);
    },
  );
}

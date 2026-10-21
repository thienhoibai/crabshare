import 'dart:async';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_page.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_repository.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/harvest_fakes.dart';

Future<void> open(WidgetTester tester, HarvestServer server) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [dioProvider.overrideWithValue(server.dio())],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const HarvestPage(batchCode: 'REAL-01'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> reveal(WidgetTester tester, Finder finder) async {
  tester
      .state<ScrollableState>(find.byType(Scrollable).first)
      .position
      .jumpTo(0);
  await tester.pumpAndSettle();
  for (var i = 0; i < 30; i++) {
    if (finder.evaluate().isNotEmpty) {
      await tester.ensureVisible(finder.first);
      await tester.pumpAndSettle();
      return;
    }
    await tester.drag(find.byType(ListView).first, const Offset(0, -180));
    await tester.pumpAndSettle();
  }
  expect(finder, findsWidgets);
}

Future<void> fill(WidgetTester tester) async {
  await reveal(tester, find.byKey(const Key('harvest-box')));
  await tester.tap(find.byKey(const Key('harvest-box')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Hộp 0006').last);
  await tester.pumpAndSettle();
  await reveal(tester, find.byKey(const Key('harvest-weight')));
  await tester.enterText(find.byKey(const Key('harvest-weight')), '250');
  tester.testTextInput.hide();
  await reveal(tester, find.text('Vỏ mềm'));
  await tester.tap(find.text('Vỏ mềm'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'reopening an in-flight record enables exact retry after an unknown failure',
    (tester) async {
      final server = HarvestServer();
      final repository = _DelayedHarvestRepository(server.dio());
      final container = ProviderContainer(
        overrides: [harvestRepositoryProvider.overrideWithValue(repository)],
      );
      addTearDown(container.dispose);
      Widget app() => UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const HarvestPage(batchCode: 'REAL-01'),
        ),
      );
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      await fill(tester);
      await reveal(tester, find.text('Ghi nhận thu hoạch'));
      await tester.tap(find.text('Ghi nhận thu hoạch'));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(app());
      await tester.pump(const Duration(milliseconds: 50));
      final retry = find.widgetWithText(FilledButton, 'Gửi lại yêu cầu cũ');
      expect(tester.widget<FilledButton>(retry).onPressed, isNull);
      repository.pending.completeError(
        DioException(
          requestOptions: RequestOptions(),
          type: DioExceptionType.connectionError,
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.widget<FilledButton>(retry).onPressed, isNotNull);
      expect(find.byType(LinearProgressIndicator), findsNothing);
      expect(repository.input!.expectedCrabItemId, 123);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'select real crab, require shell confirmation and render only server grade/tag',
    (tester) async {
      final server = HarvestServer();
      await open(tester, server);
      await fill(tester);
      expect(find.textContaining('SOFT'), findsNothing);
      await reveal(tester, find.text('Ghi nhận thu hoạch'));
      await tester.tap(find.text('Ghi nhận thu hoạch'));
      await tester.pumpAndSettle();
      await reveal(tester, find.textContaining('23456789ABCD'));
      expect(find.textContaining('SOFT'), findsWidgets);
      expect(find.textContaining('Printed'), findsWidgets);
      expect(find.text('Ảnh minh hoạ'), findsNothing);
      final record = server.requests.singleWhere(
        (r) => r.method == 'POST' && r.path.endsWith('/crabs'),
      );
      expect(record.data['expectedCrabItemId'], 123);
      expect(record.data['shellCondition'], 'SoftShell');
      expect(record.data.containsKey('gradeCode'), isFalse);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'unknown record response locks input and retries exact request even after box changes',
    (tester) async {
      final server = HarvestServer()..lostRecordResponse = true;
      await open(tester, server);
      await fill(tester);
      await reveal(tester, find.text('Ghi nhận thu hoạch'));
      await tester.tap(find.text('Ghi nhận thu hoạch'));
      await tester.pumpAndSettle();
      await reveal(tester, find.text('Gửi lại yêu cầu cũ'));
      server.crabId = 456;
      await tester.tap(find.text('Gửi lại yêu cầu cũ'));
      await tester.pumpAndSettle();
      final posts = server.requests
          .where((r) => r.method == 'POST' && r.path.endsWith('/crabs'))
          .toList();
      expect(posts, hasLength(2));
      expect(posts[0].data, posts[1].data);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'staff can resume and read history but cannot rename, start or close sessions',
    (tester) async {
      final server = HarvestServer()..owner = false;
      server.records = [harvestRecordJson()];
      await open(tester, server);
      expect(find.text('Bắt đầu đợt'), findsNothing);
      expect(find.text('Sửa thông tin đợt'), findsNothing);
      expect(find.text('Chốt đợt'), findsNothing);
      await reveal(tester, find.textContaining('23456789ABCD'));
      expect(find.textContaining('23456789ABCD'), findsWidgets);
      expect(
        server.requests.any((r) => r.path == '/api/harvests/41/crabs'),
        isTrue,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'owner creates named session and closes manually without closing the batch',
    (tester) async {
      final server = HarvestServer()..active = false;
      await open(tester, server);
      await reveal(tester, find.byKey(const Key('harvest-name')));
      await tester.enterText(
        find.byKey(const Key('harvest-name')),
        'Buổi sáng',
      );
      tester.testTextInput.hide();
      await reveal(tester, find.text('Bắt đầu đợt'));
      await tester.tap(find.text('Bắt đầu đợt'));
      await tester.pumpAndSettle();
      expect(
        server.requests.any(
          (r) =>
              r.method == 'POST' &&
              r.path.endsWith('/harvests') &&
              r.data['name'] == 'Buổi sáng',
        ),
        isTrue,
      );
      await reveal(tester, find.text('Chốt đợt'));
      await tester.tap(find.text('Chốt đợt'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xác nhận chốt'));
      await tester.pumpAndSettle();
      expect(
        server.requests.singleWhere((r) => r.path.endsWith('/complete')).data,
        {'expectedRevision': 2},
      );
      expect(server.active, isFalse);
      await tester.pumpWidget(const SizedBox());
    },
  );
}

class _DelayedHarvestRepository extends ApiHarvestRepository {
  _DelayedHarvestRepository(super.dio);
  final pending = Completer<HarvestedCrab>();
  HarvestInput? input;
  @override
  Future<HarvestedCrab> record(HarvestInput value) {
    input = value;
    return pending.future;
  }
}

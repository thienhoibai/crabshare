import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_timeline.dart';
import 'package:crabshare_mobile/features/investor/data/timeline_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/investor_fixtures.dart';
import 'timeline_test.dart' show timelineFixture;

Widget _host(Dio dio) => ProviderScope(
  overrides: [dioProvider.overrideWithValue(dio)],
  child: const MaterialApp(home: Scaffold(body: SingleChildScrollView(child: BatchTimeline(code: 'CS59')))),
);

void main() {
  testWidgets('each record is one row; load more merges older days; refresh starts over; 403 clears the list', (tester) async {
    var denied = false;
    final dio = discoveryDio((request) {
      if (denied) return jsonResponse({'detail': 'Denied'}, 403);
      final page = timelineFixture();
      if (request.queryParameters.containsKey('before')) {
        final group = (page['groups'] as List).first as Map<String, dynamic>;
        group['date'] = '2026-10-18';
        group['items'] = [
          {'id': 'ProductionLog:8', 'type': 'ProductionLog', 'sourceId': '8', 'businessDate': '2026-10-18', 'occurredAt': null, 'timeBasis': 'Date',
            'productionLog': {'ph': 7.9, 'waterTempC': 29, 'salinityPpt': 21, 'feedKg': 1, 'source': 'Manual', 'plausibilityFlag': 'OutOfRange', 'note': null}},
        ];
        page['hasMore'] = false;
        page['nextBefore'] = null;
      }
      return jsonResponse(page);
    });
    await tester.pumpWidget(_host(dio));
    await tester.pumpAndSettle();

    expect(find.text('20/10/2026'), findsOneWidget);
    expect(find.text('Nhật ký chăm sóc'), findsOneWidget);
    expect(find.text('pH 7,5 · 28 °C · 20 ‰ · 1,25 kg thức ăn'), findsOneWidget);
    expect(find.text('Đã phân hạng'), findsOneWidget);
    expect(find.text('Cua CU2611P102 · hộp 1702 · L G1'), findsOneWidget);
    expect(find.text('Chất lượng nước'), findsOneWidget);
    expect(find.text('Hộp 001 sang hộp 002 · 1 con'), findsOneWidget);
    expect(find.text('00:10'), findsNWidgets(4));

    await tester.ensureVisible(find.text('Xem những ngày trước'));
    await tester.tap(find.text('Xem những ngày trước'));
    await tester.pumpAndSettle();
    expect(find.text('18/10/2026'), findsOneWidget);
    expect(find.text('Ngoài ngưỡng'), findsOneWidget);
    expect(find.text('Xem những ngày trước'), findsNothing);

    final container = ProviderScope.containerOf(tester.element(find.byType(BatchTimeline)));
    container.read(timelineRefreshProvider.notifier).refresh();
    await tester.pumpAndSettle();
    expect(find.text('18/10/2026'), findsNothing);
    expect(find.text('20/10/2026'), findsOneWidget);

    denied = true;
    container.read(timelineRefreshProvider.notifier).refresh();
    await tester.pumpAndSettle();
    expect(find.text('Bạn chưa có quyền xem nhật trình của Lô này'), findsOneWidget);
    expect(find.text('20/10/2026'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('evidence photo opens on demand through the authenticated file path', (tester) async {
    final paths = <String>[];
    final dio = discoveryDio((request) {
      paths.add(request.path);
      if (request.path.endsWith('/file')) return ResponseBody.fromBytes(onePixelPng, 200);
      return jsonResponse(timelineFixture());
    });
    await tester.pumpWidget(_host(dio));
    await tester.pumpAndSettle();
    expect(paths, ['/api/batches/CS59/timeline']);

    await tester.tap(find.text('Xem ảnh'));
    await tester.pumpAndSettle();
    expect(paths.last, '/api/batches/CS59/timeline/evidence/3/file');
    expect(find.byType(InteractiveViewer), findsOneWidget);
    await tester.tap(find.byTooltip('Đóng ảnh'));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('many records of one kind in a day collapse to three rows and open on demand', (tester) async {
    final dio = discoveryDio((_) => jsonResponse({
      'batchCode': 'CS59', 'timeZone': 'Asia/Ho_Chi_Minh', 'hasMore': false, 'nextBefore': null,
      'groups': [
        {'date': '2026-10-20', 'items': [
          for (var i = 1; i <= 30; i++)
            {'id': 'SlotEvent:$i', 'type': 'SlotEvent', 'sourceId': '$i', 'businessDate': '2026-10-20', 'occurredAt': '2026-10-20T02:00:00Z', 'timeBasis': 'Occurred',
              'slotEvent': {'eventType': 'Stocked', 'slotCode': 'H$i', 'destinationSlotCode': null, 'quantity': 1, 'note': null}},
          {'id': 'ProductionLog:1', 'type': 'ProductionLog', 'sourceId': '1', 'businessDate': '2026-10-20', 'occurredAt': null, 'timeBasis': 'Date',
            'productionLog': {'ph': 7.5, 'waterTempC': 28, 'salinityPpt': 20, 'feedKg': 1.25, 'source': 'Manual', 'plausibilityFlag': 'Ok', 'note': null}},
        ]},
      ],
    }));
    await tester.pumpWidget(_host(dio));
    await tester.pumpAndSettle();
    expect(find.text('Thả cua vào hộp'), findsNWidgets(3));
    expect(find.text('Nhật ký chăm sóc'), findsOneWidget);
    expect(find.text('Còn 27 ghi nhận cùng loại'), findsOneWidget);

    await tester.tap(find.text('Còn 27 ghi nhận cùng loại'));
    await tester.pumpAndSettle();
    expect(find.text('Thả cua vào hộp'), findsNWidgets(23));
    await tester.ensureVisible(find.text('Còn 7 ghi nhận cùng loại'));
    await tester.tap(find.text('Còn 7 ghi nhận cùng loại'));
    await tester.pumpAndSettle();
    expect(find.text('Thả cua vào hộp'), findsNWidgets(30));
    expect(find.textContaining('ghi nhận cùng loại'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty timeline shows one sentence and no load-more button', (tester) async {
    final dio = discoveryDio((_) => jsonResponse({
      'batchCode': 'CS59', 'timeZone': 'Asia/Ho_Chi_Minh', 'groups': [], 'hasMore': false, 'nextBefore': null,
    }));
    await tester.pumpWidget(_host(dio));
    await tester.pumpAndSettle();
    expect(find.text('Chưa có ghi nhận nào'), findsOneWidget);
    expect(find.text('Xem những ngày trước'), findsNothing);
  });
}

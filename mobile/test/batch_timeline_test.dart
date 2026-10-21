import 'package:crabshare_mobile/features/investor/batches/batch_timeline.dart';
import 'package:crabshare_mobile/features/investor/data/timeline_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'helpers/discovery_fakes.dart';
import 'timeline_test.dart' show timelineFixture;

void main() {
  testWidgets('load more merges days and refresh resets items; 403 removes old entries', (tester) async {
    var denied = false;
    final repo = ApiTimelineRepository(discoveryDio((request) {
      if (denied) return jsonResponse({'detail': 'Denied'}, 403);
      final page = timelineFixture();
      final groups = page['groups'] as List;
      // Keep this test about paging; media has a dedicated regression test.
      (groups.first['items'] as List).removeWhere((dynamic item) => item['type'] != 'ProductionLog');
      if (request.queryParameters.containsKey('before')) {
        groups.first['date'] = '2026-10-18';
        groups.first['items'][0]['id'] = 'ProductionLog:8';
        groups.first['items'][0]['businessDate'] = '2026-10-18';
        page['hasMore'] = false;
        page['nextBefore'] = null;
      }
      return jsonResponse(page);
    }));
    await tester.pumpWidget(ProviderScope(overrides: [timelineRepositoryProvider.overrideWithValue(repo)],
      child: const MaterialApp(home: Scaffold(body: SingleChildScrollView(child: BatchTimeline(code: 'CS59'))))),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Xem những ngày trước'));
    await tester.tap(find.text('Xem những ngày trước'));
    await tester.pumpAndSettle();
    expect(find.text('18/10/2026'), findsOneWidget);
    await tester.ensureVisible(find.byTooltip('Làm mới nhật trình'));
    await tester.tap(find.byTooltip('Làm mới nhật trình'));
    await tester.pumpAndSettle();
    expect(find.text('18/10/2026'), findsNothing);
    denied = true;
    await tester.tap(find.byTooltip('Làm mới nhật trình'));
    await tester.pumpAndSettle();
    expect(find.text('Bạn chưa có quyền xem nhật trình của lô này.'), findsOneWidget);
    expect(find.text('20/10/2026'), findsNothing);
  });

  testWidgets('empty timeline does not fabricate entries', (tester) async {
    final repo = ApiTimelineRepository(discoveryDio((_) => jsonResponse({
      'batchCode': 'CS59', 'timeZone': 'Asia/Ho_Chi_Minh', 'groups': [], 'hasMore': false, 'nextBefore': null,
    })));
    await tester.pumpWidget(ProviderScope(overrides: [timelineRepositoryProvider.overrideWithValue(repo)],
      child: const MaterialApp(home: Scaffold(body: BatchTimeline(code: 'CS59')))),
    );
    await tester.pumpAndSettle();
    expect(find.text('Nhật trình đang chờ những ghi nhận đầu tiên'), findsOneWidget);
    expect(find.text('Xem những ngày trước'), findsNothing);
  });
}

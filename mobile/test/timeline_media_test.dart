import 'dart:convert';
import 'dart:typed_data';
import 'package:crabshare_mobile/features/investor/batches/timeline_media.dart';
import 'package:crabshare_mobile/features/investor/data/timeline_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

class _Repository implements TimelineRepository {
  @override
  Future<TimelinePage> timeline(String code, {String? before, CancelToken? cancelToken}) => throw UnimplementedError();
  @override
  Future<Uint8List> file(String code, String id, {CancelToken? cancelToken}) async => base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=',
  );
}

void main() {
  testWidgets('removing the originating timeline clears an open private image without lifecycle errors', (tester) async {
    final visible = ValueNotifier(true);
    final item = TimelineItem.fromJson({
      'id': 'Evidence:1', 'type': 'Evidence', 'sourceId': '1',
      'businessDate': '2026-10-20', 'timeBasis': 'Capture',
      'evidence': {'mediaType': 'Photo', 'source': 'InAppCapture',
        'reviewStatus': 'Accepted', 'fileUrl': '/private'},
    });
    await tester.pumpWidget(ProviderScope(
      overrides: [timelineRepositoryProvider.overrideWithValue(_Repository())],
      child: MaterialApp(home: Scaffold(body: ValueListenableBuilder<bool>(
        valueListenable: visible,
        builder: (_, show, child) => show
          ? TimelineMedia(code: 'CS59', item: item, onDenied: () => visible.value = false)
          : const SizedBox.shrink(),
      ))),
    ));
    await tester.tap(find.text('Xem ảnh bằng chứng'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(InkWell).last);
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
    visible.value = false;
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
    expect(find.text('Phiên xem đã thay đổi. Vui lòng mở lại bằng chứng.'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byTooltip('Đóng ảnh'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    visible.dispose();
  });
}

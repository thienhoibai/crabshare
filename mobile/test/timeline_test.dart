import 'helpers/discovery_fakes.dart';
import 'package:crabshare_mobile/features/investor/data/timeline_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> timelineFixture() => {
  'batchCode': 'CS59', 'timeZone': 'Asia/Ho_Chi_Minh',
  'nextBefore': '2026-10-20', 'hasMore': true,
  'groups': [{'date': '2026-10-20', 'items': [
    {'id': 'ProductionLog:1', 'type': 'ProductionLog', 'sourceId': '1',
      'businessDate': '2026-10-20', 'occurredAt': null, 'timeBasis': 'Date',
      'productionLog': {'ph': 7.5, 'waterTempC': 28, 'salinityPpt': 20,
        'feedKg': 1.25, 'source': 'Manual', 'plausibilityFlag': 'Ok', 'note': 'Nhật ký'}},
    {'id': 'SlotEvent:2', 'type': 'SlotEvent', 'sourceId': '2',
      'businessDate': '2026-10-20', 'occurredAt': '2026-10-19T17:10:00Z', 'timeBasis': 'Occurred',
      'slotEvent': {'eventType': 'Relocated', 'slotCode': '001', 'destinationSlotCode': '002', 'quantity': 1, 'note': null}},
    {'id': 'Evidence:3', 'type': 'Evidence', 'sourceId': '3',
      'businessDate': '2026-10-20', 'occurredAt': '2026-10-19T17:10:00Z', 'timeBasis': 'Capture',
      'evidence': {'mediaType': 'Photo', 'source': 'InAppCapture', 'slotCode': '002', 'reviewStatus': 'Accepted', 'fileUrl': '/api/batches/CS59/timeline/evidence/3/file'}},
    {'id': 'Alert:4', 'type': 'Alert', 'sourceId': '4',
      'businessDate': '2026-10-20', 'occurredAt': '2026-10-19T17:10:00Z', 'timeBasis': 'Raised',
      'alert': {'type': 'WaterQuality', 'severity': 'High', 'message': 'Kiểm tra', 'status': 'Acknowledged', 'acknowledgedAt': '2026-10-20T01:00:00Z', 'escalatedAt': null}},
  ]}],
};

void main() {
  test('timeline repository sends exclusive day cursor and maps all four payloads', () async {
    final repo = ApiTimelineRepository(discoveryDio((request) {
      expect(request.path, '/api/batches/CS59/timeline');
      expect(request.queryParameters, {'days': 7, 'before': '2026-10-21'});
      return jsonResponse(timelineFixture());
    }));
    final page = await repo.timeline('CS59', before: '2026-10-21');
    expect(page.nextBefore, '2026-10-20');
    expect(page.hasMore, isTrue);
    final items = page.groups.single.items;
    expect(items[0].occurredAt, isNull);
    expect(items[0].productionLog!.feedKg, 1.25);
    expect(items[1].slotEvent!.destinationSlotCode, '002');
    expect(timelineTime(items[1].occurredAt!), '00:10');
    expect(items[2].evidence!.reviewStatus, 'Accepted');
    expect(items[3].alert!.status, 'Acknowledged');
    expect(items[3].alert!.acknowledgedAt, isNotNull);
  });
  test('append keeps groups and stable IDs unique; refresh can replace whole state', () {
    final page = TimelinePage.fromJson(timelineFixture());
    final days = mergeTimelineDays(page.groups, page.groups);
    expect(days.length, 1);
    expect(days.single.items.length, 4);
    expect(mergeTimelineDays([], page.groups).single.items.length, 4);
  });
  test('403 and canceled requests propagate without fallback', () async {
    final repo = ApiTimelineRepository(discoveryDio((_) => jsonResponse({'detail': 'Forbidden'}, 403)));
    await expectLater(repo.timeline('CS59'), throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', 403)));
    final cancel = CancelToken()..cancel();
    await expectLater(repo.timeline('CS59', cancelToken: cancel), throwsA(isA<DioException>().having((e) => e.type, 'type', DioExceptionType.cancel)));
  });
  test('file uses authenticated API path, never a storage URL', () async {
    final repo = ApiTimelineRepository(discoveryDio((request) {
      expect(request.path, '/api/batches/CS59/timeline/evidence/3/file');
      expect(request.responseType, ResponseType.bytes);
      return ResponseBody.fromBytes([1, 2, 3], 200);
    }));
    expect(await repo.file('CS59', '3'), [1, 2, 3]);
  });
}

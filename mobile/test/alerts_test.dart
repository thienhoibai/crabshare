import 'dart:convert';
import 'dart:typed_data';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/features/operator/alerts/alerts_page.dart';
import 'package:crabshare_mobile/features/operator/data/alert_repository.dart';
import 'package:crabshare_mobile/features/operator/data/operator_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

Map<String, dynamic> _json({
  String status = 'Open',
  String? note,
  String? acknowledgedAt,
}) => {
  'id': 37,
  'batchCode': 'TEST-37',
  'type': 'WaterQuality',
  'severity': 'High',
  'message': 'Cần điều chỉnh nước',
  'raisedAt': '2026-10-12T03:00:00Z',
  'ackDeadline': '2026-10-12T05:00:00Z',
  'status': status,
  'responseNote': note,
  'acknowledgedAt': acknowledgedAt,
};

class _Repository implements AlertRepository {
  int calls = 0;
  bool fail = false;
  @override
  Future<List<AlertItem>> list() async => [AlertItem.fromJson(_json())];
  @override
  Future<AlertItem> acknowledge(int id, String note) async {
    calls++;
    expect(id, 37);
    if (fail) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 409,
          data: {'detail': 'Trạng thái đã thay đổi.'},
        ),
      );
    }
    return AlertItem.fromJson(
      _json(
        status: 'Escalated',
        note: note,
        acknowledgedAt: '2026-10-12T06:00:00Z',
      ),
    );
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
    if (requestStream != null) await requestStream.drain<void>();
    return ResponseBody.fromString(
      jsonEncode(
        options.method == 'GET'
            ? [_json()]
            : _json(status: 'Acknowledged', note: 'Đã thay nước'),
      ),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('repository uses real endpoints and parses server result', () async {
    final adapter = _Adapter();
    final dio = Dio()..httpClientAdapter = adapter;
    final repo = ApiAlertRepository(dio);
    expect((await repo.list()).single.severity, AlertSeverity.high);
    expect(
      (await repo.acknowledge(37, 'Đã thay nước')).status,
      AlertStatus.acknowledged,
    );
    expect(adapter.requests.map((r) => r.path), [
      '/api/operators/me/alerts',
      '/api/alerts/37/acknowledge',
    ]);
    expect(adapter.requests.last.data, {'responseNote': 'Đã thay nước'});
  });

  testWidgets(
    'empty note is rejected and late response keeps the server escalation status',
    (tester) async {
      final repo = _Repository();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [alertRepositoryProvider.overrideWithValue(repo)],
          child: MaterialApp(theme: buildAppTheme(), home: const AlertsPage()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xác nhận'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Gửi xác nhận'));
      await tester.pumpAndSettle();
      expect(find.text('Vui lòng ghi cách xử lý cảnh báo.'), findsOneWidget);
      expect(repo.calls, 0);
      await tester.enterText(find.byType(TextFormField), 'Đã thay nước');
      await tester.tap(find.text('Gửi xác nhận'));
      await tester.pumpAndSettle();
      expect(repo.calls, 1);
      expect(find.text('Phản hồi: Đã thay nước'), findsOneWidget);
      expect(find.text('Xác nhận'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('API error is shown without changing the alert status', (
    tester,
  ) async {
    final repo = _Repository()..fail = true;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [alertRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp(theme: buildAppTheme(), home: const AlertsPage()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Xác nhận'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'Đã thay nước');
    await tester.tap(find.text('Gửi xác nhận'));
    await tester.pumpAndSettle();
    expect(find.text('Trạng thái đã thay đổi.'), findsOneWidget);
    expect(find.text('Phản hồi: Đã thay nước'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

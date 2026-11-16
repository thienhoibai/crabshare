import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/features/operator/data/care_log_repository.dart';
import 'package:crabshare_mobile/features/operator/data/operator_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/operator_core_fixtures.dart';

void main() {
  test('Lô đang lưu nuôi kèm tình trạng nhật ký hôm nay', () async {
    final server = FarmServer()
      ..careBatches = [
        careBatchJson(loggedToday: true),
        careBatchJson(code: 'CS-H1', status: 'Harvesting'),
        careBatchJson(code: 'CS-S1', status: 'Stocked'),
      ];
    final batches = await ApiCareLogRepository(server.dio()).batches();

    expect(batches.map((b) => (b.code, b.recordable, b.loggedToday)), [('CS-P1', true, true), ('CS-H1', true, false), ('CS-S1', false, false)]);
    expect((batches.first.dayOfCycle, batches.first.cycleDays), (13, 35));
    expect(batches.first.latestLog?.feedKg, 0.72);
    expect(server.requests.single.path, '/api/operators/me/production-batches');
    expect(server.requests.single.queryParameters, {'page': 1, 'pageSize': 100});
  });

  test('các bản đã ghi: một trang mới nhất, giữ cờ ngoài khoảng và nguồn', () async {
    final server = FarmServer()
      ..logs = [
        careLogJson(id: 1, flag: 'OutOfRange', note: 'Mưa lớn'),
        careLogJson(id: 2, source: 'Device'),
        for (var i = 3; i <= 40; i++) careLogJson(id: i),
      ];
    final page = await ApiCareLogRepository(server.dio()).logs();

    expect((page.items.length, page.total), (30, 40));
    expect((page.items.first.flag, page.items.first.note, page.items[1].source), ('OutOfRange', 'Mưa lớn', 'Device'));
    expect(page.items.first.logDate, DateTime(2026, 11, 11));
    expect((page.items.first.ph, page.items.first.waterTempC, page.items.first.salinityPpt), (7.8, 27.5, 15.0));
    expect(server.requests.single.path, '/api/operators/me/production-logs');
    expect(server.requests.single.queryParameters, {'page': 1, 'pageSize': 30});
  });

  test('ghi nhật ký gửi đúng bốn số đo; số đo cảm biến mới nhất để điền sẵn', () async {
    final server = FarmServer()
      ..water = [
        {
          'measuredAt': '2026-11-12T00:05:00Z',
          'temperatureC': 28.1,
          'salinityPpt': 15.1,
          'ph': 7.85,
          'quality': 'Calibrated',
          'deviceCode': 'WS-NC-01',
        },
        {
          'measuredAt': '2026-11-12T06:05:00Z',
          'temperatureC': 27.64,
          'salinityPpt': 15.25,
          'ph': 7.98,
          'quality': 'Calibrated',
          'deviceCode': 'WS-NC-01',
        },
      ];
    final repo = ApiCareLogRepository(server.dio());

    final reading = await repo.latestWater('CS-P1');
    expect((reading!.measuredAt, reading.temperatureC, reading.salinityPpt, reading.ph), (DateTime.utc(2026, 11, 12, 6, 5), 27.64, 15.25, 7.98));
    expect(server.requests.last.path, '/api/batches/CS-P1/water-readings');
    server.water = [];
    expect(await repo.latestWater('CS-P1'), isNull);

    final log = await repo.submit(
      const DailyLogInput(batchCode: 'CS-P1', feedKg: 0.725, ph: 8, waterTempC: 27.6, salinityPpt: 15.3, note: 'Thay nước'),
    );
    expect(log.batchCode, 'CS-P1');
    expect(server.requests.last.method, 'POST');
    expect(server.requests.last.path, '/api/batches/CS-P1/production-logs');
    // Máy chủ từ chối trường lạ: chỉ gửi năm trường này.
    expect(server.requests.last.data, {'ph': 8.0, 'waterTempC': 27.6, 'salinityPpt': 15.3, 'feedKg': 0.725, 'note': 'Thay nước'});
  });

  test('ghi xong thì tải lại tình trạng hôm nay; lỗi tải số đo cảm biến không chặn việc ghi', () async {
    final server = FarmServer()..failures['GET /api/batches/CS-P1/water-readings'] = (403, 'Không có quyền.');
    final container = ProviderContainer(retry: (count, error) => null, overrides: [dioProvider.overrideWithValue(server.dio())]);
    addTearDown(container.dispose);
    final batches = container.listen(careBatchesProvider, (_, _) {});
    final dashboard = container.listen(operatorDashboardProvider, (_, _) {});

    expect(await container.read(latestWaterProvider('CS-P1').future), isNull);
    expect((await container.read(careBatchesProvider.future)).single.loggedToday, isFalse);
    expect((await container.read(operatorDashboardProvider.future)).logsDue, hasLength(1));

    await container.read(careLogActionsProvider).submit(const DailyLogInput(batchCode: 'CS-P1', feedKg: 1, ph: 8, waterTempC: 28, salinityPpt: 15));
    expect((await container.read(careBatchesProvider.future)).single.loggedToday, isTrue);
    expect((await container.read(operatorDashboardProvider.future)).logsDue, isEmpty);

    server.failures['POST /api/batches/CS-P1/production-logs'] = (409, 'Lô này đã có nhật ký thủ công cho hôm nay.');
    await expectLater(
      container.read(careLogActionsProvider).submit(const DailyLogInput(batchCode: 'CS-P1', feedKg: 1, ph: 8, waterTempC: 28, salinityPpt: 15)),
      throwsA(isA<DioException>().having(apiErrorMessage, 'câu báo lỗi', 'Lô này đã có nhật ký thủ công cho hôm nay.')),
    );
    batches.close();
    dashboard.close();
  });
}

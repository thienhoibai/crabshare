import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/batch_enums.dart';
import 'operator_models.dart';
export 'alert_repository.dart' show alertsProvider;

/// Hợp đồng dữ liệu của tính năng Hộ nuôi.
/// Hiện dùng [MockOperatorRepository]; khi backend có endpoint thì viết ApiOperatorRepository
/// (dùng dioProvider) và đổi một dòng ở operatorRepositoryProvider.
abstract interface class OperatorRepository {
  Future<List<OperatorBatch>> activeBatches();
  Future<TodaySummary> todaySummary();
  Future<List<CaptureRequest>> captureRequests();
  Future<List<DailyLog>> logs();
  Future<void> submitLog(DailyLogInput input);
  Future<List<AlertItem>> alerts();
  Future<void> acknowledgeAlert(int alertId, String note);
  Future<List<BoxSlot>> boxes();

  /// Ghi một con cua đã cân → backend xếp hạng, tạo crab_tag và gửi lệnh in. Trả về mã tem.
  Future<String> recordHarvestedCrab({required String batchCode, required int weightG});
}

final operatorRepositoryProvider = Provider<OperatorRepository>((ref) => MockOperatorRepository());

final activeBatchesProvider = FutureProvider((ref) => ref.watch(operatorRepositoryProvider).activeBatches());
final todaySummaryProvider = FutureProvider((ref) => ref.watch(operatorRepositoryProvider).todaySummary());
final captureRequestsProvider = FutureProvider((ref) => ref.watch(operatorRepositoryProvider).captureRequests());
final dailyLogsProvider = FutureProvider((ref) => ref.watch(operatorRepositoryProvider).logs());
final boxesProvider = FutureProvider((ref) => ref.watch(operatorRepositoryProvider).boxes());

/// Dữ liệu mẫu để dựng giao diện (số liệu ví dụ, không lấy từ backend).
class MockOperatorRepository implements OperatorRepository {
  static final _now = DateTime.now();
  static final _random = Random();

  Future<T> _delay<T>(T value) => Future.delayed(const Duration(milliseconds: 300), () => value);

  @override
  Future<List<OperatorBatch>> activeBatches() => _delay([
        OperatorBatch(
          code: 'CS-2610-01',
          title: 'Cua thịt vỗ béo',
          crabType: CrabType.fattening,
          status: BatchStatus.inProduction,
          cycleDays: 90,
          dayOfCycle: 45,
          seedQuantity: 1200,
          aliveCount: 1180,
          loggedToday: true,
          latestLog: DailyLog(batchCode: 'CS-2610-01', logDate: _now, ph: 7.8, waterTempC: 28.5, salinityPpt: 15, feedKg: 2.4, recordedAt: _now.subtract(const Duration(hours: 3))),
        ),
        OperatorBatch(
          code: 'CS-2609-04',
          title: 'Cua thịt lô tháng 9',
          crabType: CrabType.fattening,
          status: BatchStatus.harvesting,
          cycleDays: 90,
          dayOfCycle: 88,
          seedQuantity: 800,
          aliveCount: 776,
          loggedToday: false,
          latestLog: DailyLog(
            batchCode: 'CS-2609-04',
            logDate: _now.subtract(const Duration(days: 1)),
            ph: 8.1,
            waterTempC: 29.0,
            salinityPpt: 27,
            feedKg: 1.6,
            flag: PlausibilityFlag.outOfRange,
            recordedAt: _now.subtract(const Duration(hours: 26)),
          ),
        ),
      ]);

  @override
  Future<TodaySummary> todaySummary() => _delay(const TodaySummary(done: 3, total: 5));

  @override
  Future<List<CaptureRequest>> captureRequests() => _delay([
        CaptureRequest(id: 1, batchCode: 'CS-2610-01', slotCode: '0014', dueAt: _now.add(const Duration(minutes: 45))),
        CaptureRequest(id: 2, batchCode: 'CS-2609-04', slotCode: '1437', dueAt: _now.add(const Duration(hours: 3))),
      ]);

  @override
  Future<List<DailyLog>> logs() => _delay([
        for (var d = 0; d < 6; d++) ...[
          DailyLog(
            batchCode: 'CS-2610-01',
            logDate: _now.subtract(Duration(days: d)),
            ph: 7.8 - d * 0.05,
            waterTempC: 28.5 - d * 0.2,
            salinityPpt: 15,
            feedKg: 2.4,
            recordedAt: _now.subtract(Duration(days: d, hours: 3)),
          ),
          if (d > 0)
            DailyLog(
              batchCode: 'CS-2609-04',
              logDate: _now.subtract(Duration(days: d)),
              ph: 8.1,
              waterTempC: 29,
              salinityPpt: d == 1 ? 27 : 18,
              feedKg: 1.6,
              flag: d == 1 ? PlausibilityFlag.outOfRange : PlausibilityFlag.ok,
              note: d == 1 ? 'Mưa lớn, đã thay nước một phần' : null,
              recordedAt: _now.subtract(Duration(days: d, hours: 2)),
            ),
        ],
      ]);

  @override
  Future<void> submitLog(DailyLogInput input) => _delay(null);

  @override
  Future<List<AlertItem>> alerts() => _delay([
        AlertItem(
          id: 11,
          batchCode: 'CS-2609-04',
          type: AlertType.waterQuality,
          severity: AlertSeverity.medium,
          message: 'Độ mặn 27‰ vượt ngưỡng cấu hình của lô.',
          raisedAt: _now.subtract(const Duration(hours: 9)),
          ackDeadline: _now.add(const Duration(hours: 3)),
          status: AlertStatus.open,
        ),
        AlertItem(
          id: 10,
          batchCode: 'CS-2609-04',
          type: AlertType.dataSilence,
          severity: AlertSeverity.low,
          message: 'Chưa có nhật ký hôm nay.',
          raisedAt: _now.subtract(const Duration(hours: 1)),
          ackDeadline: _now.add(const Duration(hours: 11)),
          status: AlertStatus.open,
        ),
        AlertItem(
          id: 7,
          batchCode: 'CS-2610-01',
          type: AlertType.mortality,
          severity: AlertSeverity.high,
          message: '6 con chết trong 24 giờ (hộp 0005, 0112, 0319, 0521, 0733, 1048).',
          raisedAt: _now.subtract(const Duration(days: 3)),
          ackDeadline: _now.subtract(const Duration(days: 2, hours: 12)),
          status: AlertStatus.resolved,
          responseNote: 'Đã thay cua bù trong hạn thay giống.',
        ),
      ]);

  @override
  Future<void> acknowledgeAlert(int alertId, String note) => _delay(null);

  /// Mỗi con cua một hộp: lô 01 dùng hộp 0001–1200, lô 04 dùng 1201–2000 (trại sức chứa 2.000 hộp).
  @override
  Future<List<BoxSlot>> boxes() => _delay([
        for (var i = 1; i <= 2000; i++)
          BoxSlot(
            slotCode: i.toString().padLeft(4, '0'),
            status: i % 97 == 0 ? SlotStatus.maintenance : SlotStatus.occupied,
            batchCode: i % 97 == 0 ? null : (i <= 1200 ? 'CS-2610-01' : 'CS-2609-04'),
          ),
      ]);

  @override
  Future<String> recordHarvestedCrab({required String batchCode, required int weightG}) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final code = 'CS${List.generate(10, (_) => chars[_random.nextInt(chars.length)]).join()}'; // CHAR(12) như crab_tag.tag_code
    return _delay(code);
  }
}

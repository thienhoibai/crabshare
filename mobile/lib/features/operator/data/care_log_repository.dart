import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import 'alert_repository.dart';
import 'operator_repository.dart';

/// Nhật ký chăm sóc: mỗi Lô một bản ghi tay mỗi ngày gồm thức ăn, pH, nhiệt độ nước, độ mặn.
class DailyLog {
  const DailyLog({
    required this.id,
    required this.batchCode,
    required this.logDate,
    this.ph,
    this.waterTempC,
    this.salinityPpt,
    this.feedKg,
    this.note,
    this.source = 'Manual',
    this.flag = 'Ok',
  });

  final int id;
  final String batchCode;
  final DateTime logDate;
  final double? ph;
  final double? waterTempC;
  final double? salinityPpt;
  final double? feedKg;
  final String? note;

  /// Manual, FarmApi hoặc Device.
  final String source;

  /// Ok, OutOfRange hoặc Inconsistent.
  final String flag;

  factory DailyLog.fromJson(Json j) => DailyLog(
    id: intOf(j, 'id'),
    batchCode: str(j, 'batchCode'),
    logDate: dateOf(j, 'logDate'),
    ph: doubleOrNull(j, 'ph'),
    waterTempC: doubleOrNull(j, 'waterTempC'),
    salinityPpt: doubleOrNull(j, 'salinityPpt'),
    feedKg: doubleOrNull(j, 'feedKg'),
    note: strOrNull(j, 'note'),
    source: str(j, 'source', 'Manual'),
    flag: str(j, 'plausibilityFlag', 'Ok'),
  );
}

/// Lô đang lưu nuôi kèm tình trạng nhật ký hôm nay: GET /api/operators/me/production-batches.
class CareBatch {
  const CareBatch({
    required this.code,
    required this.title,
    required this.status,
    this.dayOfCycle,
    this.cycleDays = 0,
    this.loggedToday = false,
    this.latestLog,
  });

  final String code;
  final String title;
  final String status;
  final int? dayOfCycle;
  final int cycleDays;
  final bool loggedToday;
  final DailyLog? latestLog;

  /// Máy chủ chỉ nhận nhật ký của Lô đang lưu nuôi hoặc đang thu hoạch.
  bool get recordable => status == 'InProduction' || status == 'Harvesting';

  factory CareBatch.fromJson(Json j) {
    final latest = asJsonOrNull(j['latestLog']);
    return CareBatch(
      code: str(j, 'batchCode'),
      title: str(j, 'title'),
      status: str(j, 'status'),
      dayOfCycle: intOrNull(j, 'dayOfCycle'),
      cycleDays: intOf(j, 'cycleDays'),
      loggedToday: boolOf(j, 'loggedToday'),
      latestLog: latest == null ? null : DailyLog.fromJson(latest),
    );
  }
}

/// Số đo người nuôi nhập; ngày ghi và người ghi do máy chủ xác định.
class DailyLogInput {
  const DailyLogInput({
    required this.batchCode,
    required this.feedKg,
    required this.ph,
    required this.waterTempC,
    required this.salinityPpt,
    this.note,
  });

  final String batchCode;
  final double feedKg;
  final double ph;
  final double waterTempC;
  final double salinityPpt;
  final String? note;

  Json toJson() => {'ph': ph, 'waterTempC': waterTempC, 'salinityPpt': salinityPpt, 'feedKg': feedKg, 'note': note};
}

/// Số đo gần nhất của cảm biến nước, dùng để điền sẵn ba chỉ số nước.
class WaterReading {
  const WaterReading({required this.measuredAt, this.temperatureC, this.salinityPpt, this.ph});
  final DateTime measuredAt;
  final double? temperatureC;
  final double? salinityPpt;
  final double? ph;

  factory WaterReading.fromJson(Json j) => WaterReading(
    measuredAt: dateOf(j, 'measuredAt'),
    temperatureC: doubleOrNull(j, 'temperatureC'),
    salinityPpt: doubleOrNull(j, 'salinityPpt'),
    ph: doubleOrNull(j, 'ph'),
  );
}

abstract interface class CareLogRepository {
  Future<List<CareBatch>> batches();

  /// Các bản đã ghi của hộ nuôi, mới nhất đứng trước.
  Future<Paged<DailyLog>> logs({int page = 1, int pageSize = 30});
  Future<DailyLog> submit(DailyLogInput input);

  /// Số đo cảm biến mới nhất trong bảy ngày qua; null khi Lô chưa có cảm biến gửi số.
  Future<WaterReading?> latestWater(String batchCode);
}

class ApiCareLogRepository implements CareLogRepository {
  ApiCareLogRepository(this.dio);
  final Dio dio;

  static String _batch(String code) => '/api/batches/${Uri.encodeComponent(code)}';

  @override
  Future<List<CareBatch>> batches() async {
    final page = await dio.getJson('/api/operators/me/production-batches', query: {'page': 1, 'pageSize': 100});
    return [for (final b in asJsonList(page['items'])) CareBatch.fromJson(b)];
  }

  @override
  Future<Paged<DailyLog>> logs({int page = 1, int pageSize = 30}) async =>
      Paged.fromJson(await dio.getJson('/api/operators/me/production-logs', query: {'page': page, 'pageSize': pageSize}), DailyLog.fromJson);

  @override
  Future<DailyLog> submit(DailyLogInput input) async =>
      DailyLog.fromJson(await dio.postJson('${_batch(input.batchCode)}/production-logs', data: input.toJson()));

  @override
  Future<WaterReading?> latestWater(String batchCode) async {
    final readings = await dio.getList('${_batch(batchCode)}/water-readings');
    return readings.isEmpty ? null : WaterReading.fromJson(readings.last);
  }
}

final careLogRepositoryProvider = Provider<CareLogRepository>((ref) => ApiCareLogRepository(ref.watch(dioProvider)));

final careBatchesProvider = FutureProvider.autoDispose<List<CareBatch>>((ref) {
  ref.watch(farmAccountProvider);
  return ref.watch(careLogRepositoryProvider).batches();
}, retry: (_, _) => null);

final careLogsProvider = FutureProvider.autoDispose<Paged<DailyLog>>((ref) {
  ref.watch(farmAccountProvider);
  return ref.watch(careLogRepositoryProvider).logs();
}, retry: (_, _) => null);

/// Số đo cảm biến gần nhất của một Lô. Lỗi tải không chặn việc ghi nhật ký: coi như chưa có số để điền sẵn.
final latestWaterProvider = FutureProvider.autoDispose.family<WaterReading?, String>((ref, code) async {
  ref.watch(farmAccountProvider);
  try {
    return await ref.watch(careLogRepositoryProvider).latestWater(code);
  } catch (_) {
    return null;
  }
}, retry: (_, _) => null);

/// Ghi nhật ký rồi tải lại các danh sách chịu ảnh hưởng, kể cả khi form đã đóng.
final careLogActionsProvider = Provider<CareLogActions>(CareLogActions.new);

class CareLogActions {
  CareLogActions(this._ref);
  final Ref _ref;

  Future<DailyLog> submit(DailyLogInput input) async {
    final log = await _ref.read(careLogRepositoryProvider).submit(input);
    if (_ref.mounted) {
      _ref.invalidate(careBatchesProvider);
      _ref.invalidate(careLogsProvider);
      _ref.invalidate(operatorDashboardProvider);
      _ref.invalidate(alertsProvider);
    }
    return log;
  }
}

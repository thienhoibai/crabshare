import 'package:dio/dio.dart';

import 'alert_repository.dart';
import 'operator_models.dart';
import 'operator_repository.dart';
import '../harvest/harvest_models.dart';
import '../harvest/harvest_repository.dart';

class ApiOperatorRepository implements OperatorRepository {
  ApiOperatorRepository(this.dio);

  final Dio dio;
  // Keep unrelated box consumers on their existing implementation.
  final OperatorRepository _legacyFeatures = MockOperatorRepository();

  Future<List<T>> _allPages<T>(
    String path,
    T Function(Map<String, dynamic>) decode, {
    Map<String, dynamic> query = const {},
  }) async {
    final items = <T>[];
    var page = 1;
    while (true) {
      final response = await dio.get<Map<String, dynamic>>(
        path,
        queryParameters: {...query, 'page': page, 'pageSize': 100},
      );
      final data = response.data!;
      final values = data['items'] as List;
      items.addAll(
        values.map((item) => decode(Map<String, dynamic>.from(item as Map))),
      );
      if (values.isEmpty || items.length >= (data['total'] as int)) break;
      page++;
    }
    return items;
  }

  @override
  Future<List<OperatorBatch>> activeBatches() =>
      _allPages('/api/operators/me/production-batches', OperatorBatch.fromJson);

  @override
  Future<TodaySummary> todaySummary() async =>
      TodaySummary.fromBatches(await activeBatches());

  @override
  Future<List<DailyLog>> logs({DateTime? from, DateTime? to}) => _allPages(
    '/api/operators/me/production-logs',
    DailyLog.fromJson,
    query: {
      if (from != null) 'from': _date(from),
      if (to != null) 'to': _date(to),
    },
  );

  @override
  Future<void> submitLog(DailyLogInput input) async {
    await dio.post<Map<String, dynamic>>(
      '/api/batches/${Uri.encodeComponent(input.batchCode)}/production-logs',
      data: input.toJson(),
    );
  }

  @override
  Future<ProductionThresholds> thresholds(String batchCode) async {
    final response = await dio.get<Map<String, dynamic>>(
      '/api/batches/${Uri.encodeComponent(batchCode)}/production-thresholds',
    );
    return ProductionThresholds.fromJson(response.data!);
  }

  @override
  Future<ProductionThresholdVersion> saveThresholds(
    String batchCode,
    ProductionThresholdInput input,
  ) async {
    final response = await dio.put<Map<String, dynamic>>(
      '/api/batches/${Uri.encodeComponent(batchCode)}/production-thresholds',
      data: input.toJson(),
    );
    return ProductionThresholdVersion.fromJson(response.data!);
  }

  @override
  Future<List<AlertItem>> alerts() => ApiAlertRepository(dio).list();

  @override
  Future<void> acknowledgeAlert(int alertId, String note) async {
    await ApiAlertRepository(dio).acknowledge(alertId, note);
  }

  @override
  Future<List<BoxSlot>> boxes() => _legacyFeatures.boxes();

  @override
  Future<HarvestedCrab> recordHarvestedCrab({
    required int harvestId,
    required String requestId,
    required String slotCode,
    required int expectedCrabItemId,
    required int weightG,
    required ShellCondition shellCondition,
  }) => ApiHarvestRepository(dio).record(
    HarvestInput(
      harvestId: harvestId,
      requestId: requestId,
      slotCode: slotCode,
      expectedCrabItemId: expectedCrabItemId,
      weightG: weightG,
      shellCondition: shellCondition,
    ),
  );

  static String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
}

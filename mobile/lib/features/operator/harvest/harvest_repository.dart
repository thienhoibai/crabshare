import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import 'harvest_models.dart';

abstract interface class HarvestRepository {
  Future<HarvestContext> context(String batchCode, {String? slotCode});
  Future<List<BoxSlot>> boxes(String batchCode);
  Future<HarvestPageResult<HarvestSession>> sessions(
    String batchCode, {
    int page = 1,
  });
  Future<HarvestSession> get(int id);
  Future<HarvestPageResult<HarvestedCrab>> records(int id, {int page = 1});
  Future<HarvestSession> start(
    String batchCode, {
    required String requestId,
    String? name,
    String? note,
  });
  Future<HarvestSession> update(
    int id, {
    required int expectedRevision,
    String? name,
    String? note,
  });
  Future<HarvestSession> complete(int id, {required int expectedRevision});
  Future<HarvestedCrab> record(HarvestInput input);
}

class ApiHarvestRepository implements HarvestRepository {
  ApiHarvestRepository(this.dio);
  final Dio dio;
  String _batch(String code, String suffix) =>
      '/api/batches/${Uri.encodeComponent(code)}/$suffix';
  @override
  Future<HarvestContext> context(String batchCode, {String? slotCode}) async =>
      HarvestContext.fromJson(
        (await dio.get<Map<String, dynamic>>(
          _batch(batchCode, 'harvest-context'),
          queryParameters: {'slotCode': ?slotCode},
        )).data!,
      );
  @override
  Future<List<BoxSlot>> boxes(String batchCode) async {
    final boxes = <BoxSlot>[];
    var loaded = 0;
    for (var page = 1; ; page++) {
      final response = await dio.get<Map<String, dynamic>>(
        '/api/boxes',
        queryParameters: {
          'status': 'Occupied',
          'batchCode': batchCode,
          'page': page,
          'pageSize': 100,
        },
      );
      final json = response.data!;
      final items = json['items'] as List;
      loaded += items.length;
      for (final raw in items) {
        final item = Map<String, dynamic>.from(raw as Map);
        if (item['status'] == 'Occupied' && item['batchCode'] == batchCode) {
          boxes.add(
            BoxSlot(
              slotCode: item['slotCode'] as String,
              status: SlotStatus.occupied,
              batchCode: batchCode,
            ),
          );
        }
      }
      if (items.isEmpty || loaded >= (json['total'] as int)) break;
    }
    return boxes;
  }

  @override
  Future<HarvestPageResult<HarvestSession>> sessions(
    String batchCode, {
    int page = 1,
  }) async => HarvestPageResult.fromJson(
    (await dio.get<Map<String, dynamic>>(
      _batch(batchCode, 'harvests'),
      queryParameters: {'page': page, 'pageSize': 20},
    )).data!,
    HarvestSession.fromJson,
  );
  @override
  Future<HarvestSession> get(int id) async => HarvestSession.fromJson(
    (await dio.get<Map<String, dynamic>>('/api/harvests/$id')).data!,
  );
  @override
  Future<HarvestPageResult<HarvestedCrab>> records(
    int id, {
    int page = 1,
  }) async => HarvestPageResult.fromJson(
    (await dio.get<Map<String, dynamic>>(
      '/api/harvests/$id/crabs',
      queryParameters: {'page': page, 'pageSize': 20},
    )).data!,
    HarvestedCrab.fromJson,
  );
  @override
  Future<HarvestSession> start(
    String batchCode, {
    required String requestId,
    String? name,
    String? note,
  }) async => HarvestSession.fromJson(
    (await dio.post<Map<String, dynamic>>(
      _batch(batchCode, 'harvests'),
      data: {'requestId': requestId, 'name': name, 'note': note},
    )).data!,
  );
  @override
  Future<HarvestSession> update(
    int id, {
    required int expectedRevision,
    String? name,
    String? note,
  }) async => HarvestSession.fromJson(
    (await dio.patch<Map<String, dynamic>>(
      '/api/harvests/$id',
      data: {'expectedRevision': expectedRevision, 'name': name, 'note': note},
    )).data!,
  );
  @override
  Future<HarvestSession> complete(
    int id, {
    required int expectedRevision,
  }) async => HarvestSession.fromJson(
    (await dio.post<Map<String, dynamic>>(
      '/api/harvests/$id/complete',
      data: {'expectedRevision': expectedRevision},
    )).data!,
  );
  @override
  Future<HarvestedCrab> record(HarvestInput input) async =>
      HarvestedCrab.fromJson(
        (await dio.post<Map<String, dynamic>>(
          '/api/harvests/${input.harvestId}/crabs',
          data: input.toJson(),
        )).data!,
      );
}

final harvestRepositoryProvider = Provider<HarvestRepository>(
  (ref) => ApiHarvestRepository(ref.watch(dioProvider)),
);
final harvestContextProvider = FutureProvider.autoDispose
    .family<HarvestContext, (String, String?)>((ref, key) {
      ref.watch(productionAccountProvider);
      return ref
          .watch(harvestRepositoryProvider)
          .context(key.$1, slotCode: key.$2);
    }, retry: (_, _) => null);
final harvestBoxesProvider = FutureProvider.autoDispose
    .family<List<BoxSlot>, String>((ref, code) {
      ref.watch(productionAccountProvider);
      return ref.watch(harvestRepositoryProvider).boxes(code);
    }, retry: (_, _) => null);
final harvestSessionsProvider = FutureProvider.autoDispose
    .family<HarvestPageResult<HarvestSession>, (String, int)>((ref, key) {
      ref.watch(productionAccountProvider);
      return ref
          .watch(harvestRepositoryProvider)
          .sessions(key.$1, page: key.$2);
    }, retry: (_, _) => null);
final harvestSessionProvider = FutureProvider.autoDispose
    .family<HarvestSession, int>((ref, id) {
      ref.watch(productionAccountProvider);
      return ref.watch(harvestRepositoryProvider).get(id);
    }, retry: (_, _) => null);
final harvestRecordsProvider = FutureProvider.autoDispose
    .family<HarvestPageResult<HarvestedCrab>, (int, int)>((ref, key) {
      ref.watch(productionAccountProvider);
      return ref.watch(harvestRepositoryProvider).records(key.$1, page: key.$2);
    }, retry: (_, _) => null);

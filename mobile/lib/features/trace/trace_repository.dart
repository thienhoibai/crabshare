import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/json.dart';

/// Lô nguồn của cua trong đơn: vùng xuất xứ và ngày thu.
class TraceSourceLot {
  const TraceSourceLot({required this.originRegion, required this.harvestedOn, required this.species});
  final String? originRegion;
  final DateTime? harvestedOn;
  final String species;

  factory TraceSourceLot.fromJson(Json j) => TraceSourceLot(
    originRegion: strOrNull(j, 'originRegion'),
    harvestedOn: dateOrNull(j, 'harvestedOn'),
    species: str(j, 'species'),
  );
}

/// Một quy cách đã duyệt trong đơn và số con của quy cách đó.
class TraceLine {
  const TraceLine({required this.specCode, required this.specName, required this.crabs});
  final String specCode;
  final String specName;
  final int crabs;

  factory TraceLine.fromJson(Json j) =>
      TraceLine(specCode: str(j, 'specCode'), specName: str(j, 'specName'), crabs: intOf(j, 'crabs'));
}

/// Trang truy xuất của mã QR đơn: Lô, trại, lô nguồn, quy cách đã duyệt, các lần đã giao.
/// Không có thông tin cá nhân và không có mã từng con cua.
class OrderTrace {
  const OrderTrace({
    required this.traceCode,
    required this.batchCode,
    required this.batchTitle,
    required this.crabType,
    required this.farmName,
    required this.sourceLots,
    required this.lines,
    required this.deliveries,
    required this.standardNote,
  });
  final String traceCode;
  final String batchCode;
  final String batchTitle;
  final String crabType;
  final String farmName;
  final List<TraceSourceLot> sourceLots;
  final List<TraceLine> lines;
  final List<DateTime> deliveries;
  final String standardNote;

  int get totalCrabs => lines.fold(0, (sum, l) => sum + l.crabs);

  factory OrderTrace.fromJson(Json j) => OrderTrace(
    traceCode: str(j, 'traceCode'),
    batchCode: str(j, 'batchCode'),
    batchTitle: str(j, 'batchTitle'),
    crabType: str(j, 'crabType'),
    farmName: str(j, 'farmName'),
    sourceLots: [for (final s in asJsonList(j['sourceLots'])) TraceSourceLot.fromJson(s)],
    lines: [for (final l in asJsonList(j['lines'])) TraceLine.fromJson(l)],
    deliveries: [
      for (final d in (j['deliveries'] as List?) ?? const [])
        if (d is String && DateTime.tryParse(d) != null) DateTime.parse(d),
    ],
    standardNote: str(j, 'standardNote'),
  );
}

abstract interface class TraceRepository {
  Future<OrderTrace> lookup(String traceCode);
}

class ApiTraceRepository implements TraceRepository {
  ApiTraceRepository(this.dio);
  final Dio dio;

  @override
  Future<OrderTrace> lookup(String traceCode) async =>
      OrderTrace.fromJson(await dio.getJson('/api/trace/orders/${Uri.encodeComponent(traceCode)}'));
}

final traceRepositoryProvider = Provider.autoDispose<TraceRepository>((ref) => ApiTraceRepository(ref.watch(dioProvider)));

final traceProvider = FutureProvider.autoDispose.family<OrderTrace, String>(
  (ref, traceCode) => ref.watch(traceRepositoryProvider).lookup(traceCode),
  retry: (_, _) => null,
);

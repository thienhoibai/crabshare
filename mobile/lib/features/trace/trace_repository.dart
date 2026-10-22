import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';

class TraceResult {
  const TraceResult({
    required this.tagCode,
    required this.batchCode,
    required this.crabType,
    required this.itemStatus,
    required this.weightG,
    required this.gradeCode,
    required this.gradeName,
    required this.stockedAt,
    required this.harvestedAt,
    required this.slotCode,
    required this.events,
  });

  final String tagCode;
  final String batchCode;
  final String crabType;
  final String itemStatus;
  final int? weightG;
  final String? gradeCode;
  final String? gradeName;
  final DateTime stockedAt;
  final DateTime? harvestedAt;
  final String slotCode;
  final List<TraceEvent> events;

  factory TraceResult.fromJson(Map<String, dynamic> json) => TraceResult(
    tagCode: json['tagCode'] as String,
    batchCode: json['batchCode'] as String,
    crabType: json['crabType'] as String,
    itemStatus: json['itemStatus'] as String,
    weightG: (json['weightG'] as num?)?.toInt(),
    gradeCode: json['gradeCode'] as String?,
    gradeName: json['gradeName'] as String?,
    stockedAt: DateTime.parse(json['stockedAt'] as String).toLocal(),
    harvestedAt: json['harvestedAt'] == null
        ? null
        : DateTime.parse(json['harvestedAt'] as String).toLocal(),
    slotCode: json['slotCode'] as String,
    events: (json['events'] as List<dynamic>? ?? const [])
        .map((event) => TraceEvent.fromJson(Map<String, dynamic>.from(event as Map)))
        .toList(growable: false),
  );
}

class TraceEvent {
  const TraceEvent({required this.eventType, required this.occurredAt});

  final String eventType;
  final DateTime occurredAt;

  factory TraceEvent.fromJson(Map<String, dynamic> json) => TraceEvent(
    eventType: json['eventType'] as String,
    occurredAt: DateTime.parse(json['occurredAt'] as String).toLocal(),
  );
}

abstract interface class TraceRepository {
  Future<TraceResult> lookup(String tagCode);
}

class ApiTraceRepository implements TraceRepository {
  ApiTraceRepository(this.dio);

  final Dio dio;

  @override
  Future<TraceResult> lookup(String tagCode) async {
    final response = await dio.get<Map<String, dynamic>>(
      '/api/trace/${Uri.encodeComponent(tagCode)}',
    );
    return TraceResult.fromJson(response.data!);
  }
}

final traceRepositoryProvider = Provider.autoDispose<TraceRepository>(
  (ref) => ApiTraceRepository(ref.watch(dioProvider)),
);
final traceProvider = FutureProvider.autoDispose.family<TraceResult, String>(
  (ref, tagCode) => ref.watch(traceRepositoryProvider).lookup(tagCode),
);

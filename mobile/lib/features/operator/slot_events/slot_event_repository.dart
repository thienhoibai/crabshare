import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import '../evidence/evidence_repository.dart';

enum SlotEventType {
  molted('Molted', 'Lột xác'),
  mortality('Mortality', 'Cua chết'),
  restocked('Restocked', 'Thả bù'),
  relocated('Relocated', 'Chuyển hộp');

  const SlotEventType(this.apiValue, this.label);
  final String apiValue;
  final String label;
  bool get needsPhoto => this == mortality || this == restocked;
}

/// UUID v4 without an additional dependency. Keep this ID with an immutable
/// submission until its outcome is known; a changed payload gets a fresh ID.
String newSlotEventRequestId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class SlotEventInput {
  const SlotEventInput({
    required this.requestId,
    required this.slotCode,
    required this.eventType,
    required this.occurredAt,
    this.note,
    this.destinationSlotCode,
    this.replacesCrabItemId,
    this.evidenceId,
  });
  final String requestId, slotCode;
  final SlotEventType eventType;
  final DateTime occurredAt;
  final String? note, destinationSlotCode;
  final int? replacesCrabItemId, evidenceId;
  Map<String, dynamic> toJson() => {
    'requestId': requestId,
    'slotCode': slotCode,
    'eventType': eventType.apiValue,
    'occurredAt': occurredAt.toUtc().toIso8601String(),
    'quantity': 1,
    if (note != null && note!.isNotEmpty) 'note': note,
    if (eventType == SlotEventType.relocated)
      'destinationSlotCode': destinationSlotCode,
    if (eventType == SlotEventType.restocked)
      'replacesCrabItemId': replacesCrabItemId,
    if (eventType.needsPhoto) 'evidenceId': evidenceId,
  };
}

class SlotEventPolicy {
  SlotEventPolicy.fromJson(Map<String, dynamic> json)
    : current = json['current'] == null
          ? null
          : Map<String, dynamic>.from(json['current'] as Map),
      restockDeadline = json['restockDeadline'] as String?,
      businessDate = json['businessDate'] as String;
  final Map<String, dynamic>? current;
  final String? restockDeadline;
  final String businessDate;
  String? get formula {
    final policy = current;
    if (policy == null) return null;
    final days = policy['restockCutoffDays'];
    return policy['restockCutoffBasis'] == 'AfterStocking'
        ? '$days ngày sau ngày thả giống (giờ Việt Nam)'
        : '$days ngày trước ngày dự kiến thu hoạch (ngày thả giống + chu kỳ, giờ Việt Nam)';
  }
}

class SlotCrab {
  SlotCrab.fromJson(Map<String, dynamic> json)
    : id = json['id'] as int,
      itemUuid = json['itemUuid'] as String,
      diedAt = json['diedAt'] == null
          ? null
          : DateTime.parse(json['diedAt'] as String);
  final int id;
  final String itemUuid;
  final DateTime? diedAt;
}

class SlotEventContext {
  SlotEventContext.fromJson(Map<String, dynamic> json)
    : status = json['status'] as String,
      currentCrab = json['currentCrab'] == null
          ? null
          : SlotCrab.fromJson(
              Map<String, dynamic>.from(json['currentCrab'] as Map),
            ),
      replacementCandidates = (json['replacementCandidates'] as List)
          .map((v) => SlotCrab.fromJson(Map<String, dynamic>.from(v as Map)))
          .toList(),
      restockDeadline = json['restockDeadline'] as String?,
      canRecord = json['canRecord'] as bool,
      aliveCount = json['aliveCount'] as int;
  final String status;
  final SlotCrab? currentCrab;
  final List<SlotCrab> replacementCandidates;
  final String? restockDeadline;
  final bool canRecord;
  final int aliveCount;
}

class SlotEvent {
  SlotEvent.fromJson(Map<String, dynamic> json)
    : id = json['id'] as int,
      slotCode = json['slotCode'] as String,
      eventType = json['eventType'] as String,
      occurredAt = DateTime.parse(json['occurredAt'] as String),
      itemUuid = json['itemUuid'] as String?,
      destinationSlotCode = json['destinationSlotCode'] as String?,
      note = json['note'] as String?,
      aliveCount = json['aliveCount'] as int?;
  final int id;
  final int? aliveCount;
  final String slotCode;
  final String? itemUuid;
  final String? destinationSlotCode, note;
  final String eventType;
  final DateTime occurredAt;
  String get eventTypeLabel => switch (eventType) {
    'Stocked' => 'Thả giống',
    'Harvested' => 'Thu hoạch',
    _ =>
      SlotEventType.values
              .where((type) => type.apiValue == eventType)
              .firstOrNull
              ?.label ??
          eventType,
  };
}

class SlotEventHistory {
  SlotEventHistory.fromJson(Map<String, dynamic> json)
    : items = (json['items'] as List)
          .map((v) => SlotEvent.fromJson(Map<String, dynamic>.from(v as Map)))
          .toList(),
      total = json['total'] as int;
  final List<SlotEvent> items;
  final int total;
}

abstract interface class SlotEventRepository {
  Future<List<BoxSlot>> sourceBoxes(String batchCode);
  Future<List<BoxSlot>> destinations();
  Future<SlotEventPolicy> policy(String batchCode);
  Future<SlotEventContext> context(String batchCode, String slotCode);
  Future<SlotEventHistory> history(String batchCode, int page);
  Future<SlotEvent> record(String batchCode, SlotEventInput input);
}

class ApiSlotEventRepository implements SlotEventRepository {
  ApiSlotEventRepository(this.dio);
  final Dio dio;
  String _path(String code, String suffix) =>
      '/api/batches/${Uri.encodeComponent(code)}/$suffix';
  Future<List<BoxSlot>> _boxes({String? status}) async {
    final result = <BoxSlot>[];
    for (var page = 1; ; page++) {
      final response = await dio.get<Map<String, dynamic>>(
        '/api/boxes',
        queryParameters: {'status': ?status, 'page': page, 'pageSize': 100},
      );
      final json = response.data!;
      final items = json['items'] as List;
      for (final raw in items) {
        final item = Map<String, dynamic>.from(raw as Map);
        if (item['status'] != 'Occupied' && item['status'] != 'Available') {
          continue;
        }
        result.add(
          BoxSlot(
            slotCode: item['slotCode'] as String,
            status: item['status'] == 'Available'
                ? SlotStatus.available
                : SlotStatus.occupied,
            batchCode: item['batchCode'] as String?,
          ),
        );
      }
      if (items.isEmpty || page * 100 >= (json['total'] as int)) break;
    }
    return result;
  }

  @override
  Future<List<BoxSlot>> sourceBoxes(String batchCode) async => (await _boxes())
      .where(
        (box) =>
            box.status == SlotStatus.available || box.batchCode == batchCode,
      )
      .toList();
  @override
  Future<List<BoxSlot>> destinations() => _boxes(status: 'Available');
  @override
  Future<SlotEventPolicy> policy(String batchCode) async =>
      SlotEventPolicy.fromJson(
        (await dio.get<Map<String, dynamic>>(
          _path(batchCode, 'slot-event-policy'),
        )).data!,
      );
  @override
  Future<SlotEventContext> context(String batchCode, String slotCode) async =>
      SlotEventContext.fromJson(
        (await dio.get<Map<String, dynamic>>(
          _path(batchCode, 'slot-event-context'),
          queryParameters: {'slotCode': slotCode},
        )).data!,
      );
  @override
  Future<SlotEventHistory> history(String batchCode, int page) async =>
      SlotEventHistory.fromJson(
        (await dio.get<Map<String, dynamic>>(
          _path(batchCode, 'slot-events'),
          queryParameters: {'page': page, 'pageSize': 10},
        )).data!,
      );
  @override
  Future<SlotEvent> record(String batchCode, SlotEventInput input) async =>
      SlotEvent.fromJson(
        (await dio.post<Map<String, dynamic>>(
          _path(batchCode, 'slot-events'),
          data: input.toJson(),
        )).data!,
      );
}

final slotEventRepositoryProvider = Provider<SlotEventRepository>(
  (ref) => ApiSlotEventRepository(ref.watch(dioProvider)),
);
final slotEventSourcesProvider = FutureProvider.autoDispose
    .family<List<BoxSlot>, String>((ref, code) {
      ref.watch(productionAccountProvider);
      return ref.watch(slotEventRepositoryProvider).sourceBoxes(code);
    }, retry: (_, _) => null);
final slotEventDestinationsProvider = FutureProvider.autoDispose<List<BoxSlot>>(
  (ref) {
    ref.watch(productionAccountProvider);
    return ref.watch(slotEventRepositoryProvider).destinations();
  },
  retry: (_, _) => null,
);
final slotEventPolicyProvider = FutureProvider.autoDispose
    .family<SlotEventPolicy, String>((ref, code) {
      ref.watch(productionAccountProvider);
      return ref.watch(slotEventRepositoryProvider).policy(code);
    }, retry: (_, _) => null);
final slotEventContextProvider = FutureProvider.autoDispose
    .family<SlotEventContext, (String, String)>((ref, key) {
      ref.watch(productionAccountProvider);
      return ref.watch(slotEventRepositoryProvider).context(key.$1, key.$2);
    }, retry: (_, _) => null);
final slotEventHistoryProvider = FutureProvider.autoDispose
    .family<SlotEventHistory, (String, int)>((ref, key) {
      ref.watch(productionAccountProvider);
      return ref.watch(slotEventRepositoryProvider).history(key.$1, key.$2);
    }, retry: (_, _) => null);

final slotEventActionsProvider = Provider(SlotEventActions.new);

class SlotEventActions {
  SlotEventActions(this.ref);
  final Ref ref;
  Future<SlotEvent> record(String batchCode, SlotEventInput input) async {
    final account = ref.read(productionAccountProvider);
    final event = await ref
        .read(slotEventRepositoryProvider)
        .record(batchCode, input);
    if (ref.mounted && ref.read(productionAccountProvider) == account) {
      ref.invalidate(activeBatchesProvider);
      ref.invalidate(todaySummaryProvider);
      ref.invalidate(boxesProvider);
      ref.invalidate(alertsProvider);
      ref.invalidate(captureBoxesProvider);
      ref.invalidate(slotEventSourcesProvider);
      ref.invalidate(slotEventDestinationsProvider);
      ref.invalidate(slotEventContextProvider);
      ref.invalidate(slotEventHistoryProvider);
      ref.invalidate(slotEventPolicyProvider(batchCode));
    }
    return event;
  }
}

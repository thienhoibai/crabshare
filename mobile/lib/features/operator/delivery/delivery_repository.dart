import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../measure/work_common.dart';
import 'delivery_models.dart';

/// Giao hàng theo đợt: lập chuyến cho đợt đến hạn, xuất hàng với cân lần một, ghi cân lần hai khi giao tới khách.
/// Khách xác nhận nghiệm thu ở phía khách; bán có hoá đơn, khiếu nại, huỷ đợt làm trên web.
abstract interface class DeliveryRepository {
  /// Các Lô của người nuôi (tối đa 100 Lô gần nhất).
  Future<List<WorkBatch>> batches();
  Future<List<DeliveryTranche>> tranches(String batchCode);
  Future<Shipment> createShipment(
    int trancheId, {
    required DateTime scheduledAt,
    String? transportCondition,
    required bool allowSubstitution,
  });
  Future<Shipment> shipment(String shipmentNo);

  /// Mã cua đã xuất theo một đợt của đơn: (mã cua, mã quy cách).
  Future<List<(String, String)>> shippedCrabs(String batchCode, {required String orderNo, required int trancheSeq});
  Future<Shipment> dispatch(String shipmentNo, List<DispatchLine> lines, {String? transportCondition});
  Future<Shipment> recordReceipt(
    String shipmentNo,
    List<ReceiptLine> lines, {
    List<String> rejectedCrabCodes = const [],
    String? discrepancyReason,
  });
}

final deliveryRepositoryProvider = Provider<DeliveryRepository>((ref) => ApiDeliveryRepository(ref.watch(dioProvider)));

class ApiDeliveryRepository implements DeliveryRepository {
  ApiDeliveryRepository(this.dio);
  final Dio dio;

  static String _shipment(String no) => '/api/shipments/${Uri.encodeComponent(no)}';
  static String _batch(String code) => '/api/batches/${Uri.encodeComponent(code)}';

  @override
  Future<List<WorkBatch>> batches() async => [
    for (final j in asJsonList((await dio.getJson('/api/operators/me/batches', query: {'pageSize': 100}))['items']))
      WorkBatch.fromJson(j),
  ];

  @override
  Future<List<DeliveryTranche>> tranches(String batchCode) async => [
    for (final j in await dio.getList('${_batch(batchCode)}/delivery-tranches')) DeliveryTranche.fromJson(j, batchCode),
  ];

  @override
  Future<Shipment> createShipment(
    int trancheId, {
    required DateTime scheduledAt,
    String? transportCondition,
    required bool allowSubstitution,
  }) async => Shipment.fromJson(
    await dio.postJson(
      '/api/delivery-tranches/$trancheId/shipments',
      data: {
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        'transportCondition': _textOrNull(transportCondition),
        'allowSubstitution': allowSubstitution,
      },
    ),
  );

  @override
  Future<Shipment> shipment(String shipmentNo) async => Shipment.fromJson(await dio.getJson(_shipment(shipmentNo)));

  @override
  Future<List<(String, String)>> shippedCrabs(String batchCode, {required String orderNo, required int trancheSeq}) async => [
    for (final j in await dio.getList('${_batch(batchCode)}/allocations'))
      if (j['orderNo'] == orderNo && j['trancheSeq'] == trancheSeq && j['status'] == 'Shipped')
        (str(j, 'crabCode'), strOrNull(j, 'crabSpecCode') ?? str(j, 'lineSpecCode')),
  ];

  @override
  Future<Shipment> dispatch(String shipmentNo, List<DispatchLine> lines, {String? transportCondition}) async => Shipment.fromJson(
    await dio.postJson(
      '${_shipment(shipmentNo)}/dispatch',
      data: {'lines': [for (final l in lines) l.toJson()], 'transportCondition': _textOrNull(transportCondition)},
    ),
  );

  @override
  Future<Shipment> recordReceipt(
    String shipmentNo,
    List<ReceiptLine> lines, {
    List<String> rejectedCrabCodes = const [],
    String? discrepancyReason,
  }) async => Shipment.fromJson(
    await dio.postJson(
      '${_shipment(shipmentNo)}/receipt',
      data: {
        'lines': [for (final l in lines) l.toJson()],
        'rejectedCrabCodes': rejectedCrabCodes.isEmpty ? null : rejectedCrabCodes,
        'discrepancyReason': _textOrNull(discrepancyReason),
      },
    ),
  );

  static String? _textOrNull(String? value) => value == null || value.trim().isEmpty ? null : value.trim();
}

/// Việc giao hàng ở mọi Lô đã mở của người nuôi. Làm mới bằng `ref.invalidate(deliveryBoardProvider)`.
final deliveryBoardProvider = FutureProvider.autoDispose<DeliveryBoard>((ref) async {
  final repo = ref.watch(deliveryRepositoryProvider);
  final batches = [for (final b in await repo.batches()) if (b.isOpened) b];
  final perBatch = await Future.wait([for (final b in batches) repo.tranches(b.code)]);
  final tranches = [for (final list in perBatch) ...list]
    ..sort((a, b) {
      final byDue = (a.dueDate ?? DateTime(9999)).compareTo(b.dueDate ?? DateTime(9999));
      return byDue != 0 ? byDue : a.seq.compareTo(b.seq);
    });
  // Chuyến đang giao: hỏi thêm để biết đã ghi cân lần hai chưa, tách việc của người nuôi khỏi việc chờ khách.
  final inTransit = [for (final t in tranches) if (t.inTransit && t.shipmentNo != null) t.shipmentNo!];
  final shipments = await Future.wait([
    for (final no in inTransit) repo.shipment(no).then<Shipment?>((s) => s, onError: (_) => null),
  ]);
  return DeliveryBoard(
    tranches: tranches,
    awaitingCustomer: {for (final s in shipments) if (s != null && s.awaitingCustomer) s.shipmentNo},
  );
}, retry: (_, _) => null);

/// Khoá của một chuyến giao: mã chuyến và mã Lô nếu màn gọi đã biết (đỡ phải dò qua các Lô).
typedef ShipmentKey = ({String shipmentNo, String? batchCode});

/// Một chuyến giao kèm đợt giao và mã cua đã xuất. Làm mới bằng `ref.invalidate(shipmentViewProvider(key))`.
final shipmentViewProvider = FutureProvider.autoDispose.family<ShipmentView, ShipmentKey>((ref, key) async {
  final repo = ref.watch(deliveryRepositoryProvider);
  final shipment = await repo.shipment(key.shipmentNo);
  bool mine(DeliveryTranche t) => t.orderNo == shipment.orderNo && t.seq == shipment.trancheSeq;

  // Chuyến giao chỉ mang mã đơn, không mang mã Lô: chưa biết Lô thì tìm đợt giao của nó trong các Lô đã mở.
  final List<DeliveryTranche> candidates;
  if (key.batchCode != null) {
    candidates = await repo.tranches(key.batchCode!);
  } else {
    final batches = [for (final b in await repo.batches()) if (b.isOpened) b];
    candidates = [for (final list in await Future.wait([for (final b in batches) repo.tranches(b.code)])) ...list];
  }
  final tranche = candidates.where(mine).firstOrNull;
  final batchCode = key.batchCode ?? tranche?.batchCode;
  final shipped = shipment.canRecordReceipt && batchCode != null
      ? await repo.shippedCrabs(batchCode, orderNo: shipment.orderNo, trancheSeq: shipment.trancheSeq)
      : const <(String, String)>[];
  return ShipmentView(shipment: shipment, batchCode: batchCode, tranche: tranche, shippedCrabs: shipped);
}, retry: (_, _) => null);

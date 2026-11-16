import '../../../core/api/json.dart';

/// Model của giao hàng theo đợt: đợt giao của đơn đặt trước, chuyến giao với hai lần cân, biên bản nghiệm thu.

class TrancheLine {
  const TrancheLine({
    required this.lineId,
    required this.specCode,
    required this.orderedCrabs,
    required this.allocatedCrabs,
    required this.substitutedCrabs,
  });

  final int lineId;
  final String specCode;
  final int orderedCrabs;

  /// Số con đã duyệt hạng đang được giữ cho dòng này.
  final int allocatedCrabs;
  final int substitutedCrabs;

  factory TrancheLine.fromJson(Json j) => TrancheLine(
    lineId: intOf(j, 'lineId'),
    specCode: str(j, 'specCode'),
    orderedCrabs: intOf(j, 'orderedCrabs'),
    allocatedCrabs: intOf(j, 'allocatedCrabs'),
    substitutedCrabs: intOf(j, 'substitutedCrabs'),
  );
}

/// Một đợt giao của đơn đặt trước, kèm chuyến giao nếu đã lập.
class DeliveryTranche {
  const DeliveryTranche({
    required this.trancheId,
    required this.batchCode,
    required this.orderNo,
    required this.seq,
    required this.dueDate,
    required this.status,
    required this.recipientName,
    required this.recipientPhone,
    required this.deliveryAddress,
    required this.lines,
    required this.shipmentNo,
    required this.shipmentStatus,
  });

  final int trancheId;
  final String batchCode;
  final String orderNo;
  final int seq;
  final DateTime? dueDate;
  final String status;
  final String recipientName;
  final String recipientPhone;
  final String deliveryAddress;
  final List<TrancheLine> lines;
  final String? shipmentNo;
  final String? shipmentStatus;

  bool get isOpen => status == 'Planned' || status == 'Allocated';

  /// Đợt còn chờ lập chuyến giao.
  bool get needsShipment => isOpen && shipmentNo == null;
  bool get toDispatch => shipmentStatus == 'Scheduled';
  bool get inTransit => shipmentStatus == 'Dispatched';

  int get orderedCrabs => lines.fold(0, (n, l) => n + l.orderedCrabs);
  int get allocatedCrabs => lines.fold(0, (n, l) => n + l.allocatedCrabs);

  /// Đến hạn trong [days] ngày tới hoặc đã quá hạn.
  bool dueWithin(int days, DateTime now) {
    final due = dueDate;
    if (due == null) return true;
    final today = DateTime(now.year, now.month, now.day);
    return !DateTime(due.year, due.month, due.day).isAfter(today.add(Duration(days: days)));
  }

  bool overdue(DateTime now) {
    final due = dueDate;
    return due != null && DateTime(due.year, due.month, due.day).isBefore(DateTime(now.year, now.month, now.day));
  }

  factory DeliveryTranche.fromJson(Json j, String batchCode) => DeliveryTranche(
    trancheId: intOf(j, 'trancheId'),
    batchCode: batchCode,
    orderNo: str(j, 'orderNo'),
    seq: intOf(j, 'seq'),
    dueDate: dateOrNull(j, 'dueDate'),
    status: str(j, 'status'),
    recipientName: str(j, 'recipientName'),
    recipientPhone: str(j, 'recipientPhone'),
    deliveryAddress: str(j, 'deliveryAddress'),
    lines: [for (final l in asJsonList(j['lines'])) TrancheLine.fromJson(l)],
    shipmentNo: strOrNull(j, 'shipmentNo'),
    shipmentStatus: strOrNull(j, 'shipmentStatus'),
  );
}

class ShipmentLine {
  const ShipmentLine({
    required this.lineId,
    required this.specCode,
    required this.pricePerKg,
    required this.dispatchedCrabs,
    required this.dispatchedKg,
    required this.receivedCrabs,
    required this.receivedKg,
    required this.acceptedCrabs,
    required this.acceptedKg,
    required this.rejectedCrabs,
    required this.goodsValue,
  });

  final int lineId;
  final String specCode;
  final int pricePerKg;
  final int? dispatchedCrabs;
  final double? dispatchedKg;
  final int? receivedCrabs;
  final double? receivedKg;
  final int? acceptedCrabs;
  final double? acceptedKg;
  final int? rejectedCrabs;
  final int? goodsValue;

  factory ShipmentLine.fromJson(Json j) => ShipmentLine(
    lineId: intOf(j, 'lineId'),
    specCode: str(j, 'specCode'),
    pricePerKg: intOf(j, 'pricePerKg'),
    dispatchedCrabs: intOrNull(j, 'dispatchedCrabs'),
    dispatchedKg: doubleOrNull(j, 'dispatchedKg'),
    receivedCrabs: intOrNull(j, 'receivedCrabs'),
    receivedKg: doubleOrNull(j, 'receivedKg'),
    acceptedCrabs: intOrNull(j, 'acceptedCrabs'),
    acceptedKg: doubleOrNull(j, 'acceptedKg'),
    rejectedCrabs: intOrNull(j, 'rejectedCrabs'),
    goodsValue: intOrNull(j, 'goodsValue'),
  );
}

/// Biên bản nghiệm thu: người nuôi ghi sau cân lần hai, khách xác nhận.
class Acceptance {
  const Acceptance({
    required this.status,
    required this.acceptedCrabs,
    required this.acceptedKg,
    required this.rejectedCrabs,
    required this.discrepancyReason,
    required this.customerConfirmedAt,
    required this.goodsValue,
    required this.depositApplied,
    required this.balanceDue,
    required this.balanceDueAt,
    required this.balancePaidAt,
  });

  final String status;
  final int acceptedCrabs;
  final double acceptedKg;
  final int rejectedCrabs;
  final String? discrepancyReason;
  final DateTime? customerConfirmedAt;
  final int? goodsValue;
  final int? depositApplied;
  final int? balanceDue;
  final DateTime? balanceDueAt;
  final DateTime? balancePaidAt;

  bool get isPending => status == 'Pending';

  factory Acceptance.fromJson(Json j) => Acceptance(
    status: str(j, 'status'),
    acceptedCrabs: intOf(j, 'acceptedCrabs'),
    acceptedKg: doubleOf(j, 'acceptedKg'),
    rejectedCrabs: intOf(j, 'rejectedCrabs'),
    discrepancyReason: strOrNull(j, 'discrepancyReason'),
    customerConfirmedAt: dateOrNull(j, 'customerConfirmedAt'),
    goodsValue: intOrNull(j, 'goodsValue'),
    depositApplied: intOrNull(j, 'depositApplied'),
    balanceDue: intOrNull(j, 'balanceDue'),
    balanceDueAt: dateOrNull(j, 'balanceDueAt'),
    balancePaidAt: dateOrNull(j, 'balancePaidAt'),
  );
}

class Shipment {
  const Shipment({
    required this.shipmentNo,
    required this.orderNo,
    required this.trancheSeq,
    required this.status,
    required this.scheduledAt,
    required this.dispatchedAt,
    required this.returnWindowEndsAt,
    required this.transportCondition,
    required this.lines,
    required this.acceptance,
    required this.balanceStatus,
    required this.traceCode,
  });

  final String shipmentNo;
  final String orderNo;
  final int trancheSeq;
  final String status;
  final DateTime? scheduledAt;
  final DateTime? dispatchedAt;
  final DateTime? returnWindowEndsAt;
  final String? transportCondition;
  final List<ShipmentLine> lines;
  final Acceptance? acceptance;

  /// Trạng thái yêu cầu thanh toán phần còn lại của khách, nếu có.
  final String? balanceStatus;

  /// Mã QR của đơn (một mã cho cả đơn, không có mã cho từng con).
  final String? traceCode;

  bool get refused => status == 'Refused' || acceptance?.status == 'Refused';

  /// Việc của người nuôi lúc này: xuất hàng (cân lần một).
  bool get needsDispatch => status == 'Scheduled';

  /// Việc của người nuôi lúc này: ghi cân lần hai khi giao tới khách. Biên bản còn chờ khách thì vẫn ghi lại được.
  bool get canRecordReceipt => status == 'Dispatched' && (acceptance == null || acceptance!.isPending);

  /// Đã ghi biên bản, đang chờ khách xác nhận.
  bool get awaitingCustomer => status == 'Dispatched' && (acceptance?.isPending ?? false);

  factory Shipment.fromJson(Json j) => Shipment(
    shipmentNo: str(j, 'shipmentNo'),
    orderNo: str(j, 'orderNo'),
    trancheSeq: intOf(j, 'trancheSeq'),
    status: str(j, 'status'),
    scheduledAt: dateOrNull(j, 'scheduledAt'),
    dispatchedAt: dateOrNull(j, 'dispatchedAt'),
    returnWindowEndsAt: dateOrNull(j, 'returnWindowEndsAt'),
    transportCondition: strOrNull(j, 'transportCondition'),
    lines: [for (final l in asJsonList(j['lines'])) ShipmentLine.fromJson(l)],
    acceptance: j['acceptance'] == null ? null : Acceptance.fromJson(asJson(j['acceptance'])),
    balanceStatus: asJsonOrNull(j['balance'])?['status']?.toString(),
    traceCode: strOrNull(j, 'traceCode'),
  );
}

/// Số cân lần một của một dòng khi xuất hàng.
class DispatchLine {
  const DispatchLine({required this.lineId, required this.crabs, required this.kg});
  final int lineId;
  final int crabs;
  final double kg;

  Json toJson() => {'lineId': lineId, 'dispatchedCrabs': crabs, 'dispatchedKg': kg};
}

/// Số cân lần hai và số khách chấp nhận của một dòng khi giao tới khách.
class ReceiptLine {
  const ReceiptLine({
    required this.lineId,
    required this.receivedCrabs,
    required this.receivedKg,
    required this.acceptedCrabs,
    required this.acceptedKg,
  });

  final int lineId;
  final int receivedCrabs;
  final double receivedKg;
  final int acceptedCrabs;
  final double acceptedKg;

  Json toJson() => {
    'lineId': lineId,
    'receivedCrabs': receivedCrabs,
    'receivedKg': receivedKg,
    'acceptedCrabs': acceptedCrabs,
    'acceptedKg': acceptedKg,
  };
}

/// Việc giao hàng ở mọi Lô của người nuôi, đã xếp theo hạn giao.
class DeliveryBoard {
  const DeliveryBoard({required this.tranches, required this.awaitingCustomer});

  final List<DeliveryTranche> tranches;

  /// Mã các chuyến đã ghi cân lần hai, đang chờ khách xác nhận.
  final Set<String> awaitingCustomer;

  /// Chuyến chờ xuất hàng.
  List<DeliveryTranche> get toDispatch => [for (final t in tranches) if (t.toDispatch) t];

  /// Chuyến đang giao, chưa ghi cân lần hai.
  List<DeliveryTranche> get toReceive => [
    for (final t in tranches)
      if (t.inTransit && !awaitingCustomer.contains(t.shipmentNo)) t,
  ];

  List<DeliveryTranche> get waitingCustomer => [
    for (final t in tranches)
      if (t.inTransit && awaitingCustomer.contains(t.shipmentNo)) t,
  ];

  /// Đợt chưa có chuyến, đến hạn trong 7 ngày tới hoặc đã quá hạn.
  List<DeliveryTranche> dueNow(DateTime now) => [for (final t in tranches) if (t.needsShipment && t.dueWithin(7, now)) t];

  List<DeliveryTranche> later(DateTime now) => [for (final t in tranches) if (t.needsShipment && !t.dueWithin(7, now)) t];

  /// Chuyến đã nghiệm thu hoặc bị từ chối.
  List<DeliveryTranche> get finished => [
    for (final t in tranches)
      if (t.shipmentNo != null && !t.toDispatch && !t.inTransit) t,
  ];
}

/// Một chuyến giao kèm đợt giao của nó (người nhận, số con đã phân bổ) và mã các con đã xuất.
class ShipmentView {
  const ShipmentView({required this.shipment, required this.batchCode, required this.tranche, required this.shippedCrabs});

  final Shipment shipment;

  /// Mã Lô của chuyến; null khi không còn tìm thấy đợt giao của chuyến trong các Lô đã mở.
  final String? batchCode;
  final DeliveryTranche? tranche;

  /// Mã cua đã xuất theo chuyến, để đánh dấu con khách từ chối: (mã cua, mã quy cách).
  final List<(String, String)> shippedCrabs;

  /// Số con đã phân bổ cho một dòng; đợt không còn mở thì bằng 0.
  int allocatedOf(int lineId) {
    for (final l in tranche?.lines ?? const <TrancheLine>[]) {
      if (l.lineId == lineId) return l.allocatedCrabs;
    }
    return 0;
  }
}

import '../../../core/api/json.dart';
import '../../../core/capture/captured_photo.dart';
import 'customer_models.dart';

/// Model phần giao hàng và sau giao của khu khách hàng: chuyến giao, cân hai lần, nghiệm thu, hoá đơn, khiếu nại, đánh giá.
/// Tên trường theo đúng JSON của backend (OrderDeliveriesResponse, ShipmentResponse, ClaimResponse, OrderRatingResponse).

class ShipmentLine {
  const ShipmentLine({
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

/// Biên bản nghiệm thu của một chuyến giao.
class Acceptance {
  const Acceptance({
    required this.status,
    required this.acceptedCrabs,
    required this.acceptedKg,
    required this.rejectedCrabs,
    required this.discrepancyReason,
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
  final int? goodsValue;
  final int? depositApplied;
  final int? balanceDue;
  final DateTime? balanceDueAt;
  final DateTime? balancePaidAt;

  factory Acceptance.fromJson(Json j) => Acceptance(
    status: str(j, 'status'),
    acceptedCrabs: intOf(j, 'acceptedCrabs'),
    acceptedKg: doubleOf(j, 'acceptedKg'),
    rejectedCrabs: intOf(j, 'rejectedCrabs'),
    discrepancyReason: strOrNull(j, 'discrepancyReason'),
    goodsValue: intOrNull(j, 'goodsValue'),
    depositApplied: intOrNull(j, 'depositApplied'),
    balanceDue: intOrNull(j, 'balanceDue'),
    balanceDueAt: dateOrNull(j, 'balanceDueAt'),
    balancePaidAt: dateOrNull(j, 'balancePaidAt'),
  );
}

/// Chuyến giao đang ở bước nào đối với khách.
enum ShipmentStage { accept, pay, transit, scheduled, done, closed }

class Shipment {
  const Shipment({
    required this.shipmentNo,
    required this.orderNo,
    required this.trancheSeq,
    required this.status,
    required this.scheduledAt,
    required this.dispatchedAt,
    required this.deliveredAt,
    required this.returnWindowEndsAt,
    required this.lines,
    required this.acceptance,
    required this.balance,
  });
  final String shipmentNo;
  final String orderNo;
  final int trancheSeq;
  final String status;
  final DateTime? scheduledAt;
  final DateTime? dispatchedAt;
  final DateTime? deliveredAt;
  final DateTime? returnWindowEndsAt;
  final List<ShipmentLine> lines;
  final Acceptance? acceptance;
  final PaymentStart? balance;

  ShipmentStage get stage {
    final a = acceptance;
    return switch (status) {
      'Dispatched' => a?.status == 'Pending' ? ShipmentStage.accept : ShipmentStage.transit,
      'Scheduled' => ShipmentStage.scheduled,
      'Accepted' =>
        a?.status == 'Confirmed' && (a?.balanceDue ?? 0) > 0 && a?.balancePaidAt == null ? ShipmentStage.pay : ShipmentStage.done,
      _ => ShipmentStage.closed,
    };
  }

  /// Chuyến đã nghiệm thu và còn trong hạn đổi trả.
  bool inReturnWindow([DateTime? now]) =>
      status == 'Accepted' && returnWindowEndsAt != null && returnWindowEndsAt!.isAfter(now ?? DateTime.now());

  /// Tiền hàng theo số cân nghiệm thu của các dòng.
  int get goodsValue => lines.fold(0, (sum, l) => sum + (l.goodsValue ?? 0));

  /// Số con và số kg mới nhất đã biết: nghiệm thu nếu có, không thì số xuất.
  int get crabs => lines.fold(0, (sum, l) => sum + (l.acceptedCrabs ?? l.dispatchedCrabs ?? 0));
  double get kg => lines.fold(0, (sum, l) => sum + (l.acceptedKg ?? l.dispatchedKg ?? 0));

  factory Shipment.fromJson(Json j) => Shipment(
    shipmentNo: str(j, 'shipmentNo'),
    orderNo: str(j, 'orderNo'),
    trancheSeq: intOf(j, 'trancheSeq'),
    status: str(j, 'status'),
    scheduledAt: dateOrNull(j, 'scheduledAt'),
    dispatchedAt: dateOrNull(j, 'dispatchedAt'),
    deliveredAt: dateOrNull(j, 'deliveredAt'),
    returnWindowEndsAt: dateOrNull(j, 'returnWindowEndsAt'),
    lines: [for (final l in asJsonList(j['lines'])) ShipmentLine.fromJson(l)],
    acceptance: asJsonOrNull(j['acceptance']) == null ? null : Acceptance.fromJson(asJson(j['acceptance'])),
    balance: asJsonOrNull(j['balance']) == null ? null : PaymentStart.fromJson(asJson(j['balance'])),
  );
}

class Invoice {
  const Invoice({required this.invoiceNo, required this.trancheSeq, required this.amount, required this.status, required this.issuedAt});
  final String invoiceNo;
  final int? trancheSeq;
  final int amount;
  final String status;
  final DateTime? issuedAt;

  factory Invoice.fromJson(Json j) => Invoice(
    invoiceNo: str(j, 'invoiceNo'),
    trancheSeq: intOrNull(j, 'trancheSeq'),
    amount: intOf(j, 'amount'),
    status: str(j, 'status'),
    issuedAt: dateOrNull(j, 'issuedAt'),
  );
}

/// Chuyến giao, nghiệm thu và hoá đơn của một đơn.
class OrderDeliveries {
  const OrderDeliveries({
    required this.orderNo,
    required this.depositAmount,
    required this.depositApplied,
    required this.traceCode,
    required this.shipments,
    required this.invoices,
  });
  final String orderNo;
  final int depositAmount;
  final int depositApplied;
  final String? traceCode;
  final List<Shipment> shipments;
  final List<Invoice> invoices;

  /// Tiền cọc chưa trừ vào tiền hàng.
  int get depositCredit => depositAmount > depositApplied ? depositAmount - depositApplied : 0;

  factory OrderDeliveries.fromJson(Json j) => OrderDeliveries(
    orderNo: str(j, 'orderNo'),
    depositAmount: intOf(j, 'depositAmount'),
    depositApplied: intOf(j, 'depositApplied'),
    traceCode: strOrNull(j, 'traceCode'),
    shipments: [for (final s in asJsonList(j['shipments'])) Shipment.fromJson(s)],
    invoices: [for (final i in asJsonList(j['invoices'])) Invoice.fromJson(i)],
  );
}

class Claim {
  const Claim({
    required this.claimNo,
    required this.orderNo,
    required this.shipmentNo,
    required this.specCode,
    required this.claimType,
    required this.issueType,
    required this.affectedCrabs,
    required this.affectedKg,
    required this.description,
    required this.status,
    required this.responseDueAt,
    required this.operatorResponse,
    required this.adminDecision,
    required this.refundKg,
    required this.refundAmount,
    required this.createdAt,
  });
  final String claimNo;
  final String orderNo;
  final String shipmentNo;
  final String specCode;
  final String claimType;
  final String issueType;
  final int? affectedCrabs;
  final double? affectedKg;
  final String description;
  final String status;
  final DateTime? responseDueAt;
  final String? operatorResponse;
  final String? adminDecision;
  final double? refundKg;
  final int? refundAmount;
  final DateTime? createdAt;

  /// Người nuôi đã phản hồi, tới lượt khách đồng ý hay không.
  bool get awaitsMyReply => status == 'OperatorAccepted' || status == 'OperatorRejected';

  /// "3 con · 0,8 kg".
  String get affected => [
    if (affectedCrabs != null) '$affectedCrabs con',
    if (affectedKg != null) formatKg(affectedKg),
  ].join(' · ');

  factory Claim.fromJson(Json j) => Claim(
    claimNo: str(j, 'claimNo'),
    orderNo: str(j, 'orderNo'),
    shipmentNo: str(j, 'shipmentNo'),
    specCode: str(j, 'specCode'),
    claimType: str(j, 'claimType'),
    issueType: str(j, 'issueType'),
    affectedCrabs: intOrNull(j, 'affectedCrabs'),
    affectedKg: doubleOrNull(j, 'affectedKg'),
    description: str(j, 'description'),
    status: str(j, 'status'),
    responseDueAt: dateOrNull(j, 'responseDueAt'),
    operatorResponse: strOrNull(j, 'operatorResponse'),
    adminDecision: strOrNull(j, 'adminDecision'),
    refundKg: doubleOrNull(j, 'refundKg'),
    refundAmount: intOrNull(j, 'refundAmount'),
    createdAt: dateOrNull(j, 'createdAt'),
  );
}

/// Nội dung khiếu nại khách điền trên máy, gửi dạng multipart kèm ảnh chụp trong ứng dụng.
class ClaimDraft {
  const ClaimDraft({
    required this.shipmentNo,
    required this.specCode,
    required this.claimType,
    required this.issueType,
    required this.description,
    required this.photo,
    this.affectedCrabs,
    this.affectedKg,
  });
  final String shipmentNo;
  final String specCode;
  final String claimType;
  final String issueType;
  final int? affectedCrabs;
  final double? affectedKg;
  final String description;
  final CapturedPhoto photo;
}

class OrderRating {
  const OrderRating({required this.orderNo, required this.stars, required this.comment});
  final String orderNo;
  final int stars;
  final String? comment;

  factory OrderRating.fromJson(Json j) =>
      OrderRating(orderNo: str(j, 'orderNo'), stars: intOf(j, 'stars'), comment: strOrNull(j, 'comment'));
}

/// Đơn của hộ nuôi (GET /api/operators/me/orders?status=Paid|Packed|Shipping|Delivered|Completed).
class OperatorOrderSummary {
  const OperatorOrderSummary({
    required this.orderNo,
    required this.status,
    required this.placedAt,
    required this.batchCode,
    required this.customerName,
    required this.lineCount,
    required this.totalKg,
    required this.totalAmount,
    this.paidAt,
  });

  final String orderNo;
  final String status;
  final DateTime placedAt;
  final DateTime? paidAt;
  final String batchCode;
  final String customerName;
  final int lineCount;
  final double totalKg;
  final int totalAmount;

  factory OperatorOrderSummary.fromJson(Map<String, dynamic> json) =>
      OperatorOrderSummary(
        orderNo: json['orderNo'] as String,
        status: json['status'] as String,
        placedAt: DateTime.parse(json['placedAt'] as String).toLocal(),
        paidAt: json['paidAt'] == null
            ? null
            : DateTime.parse(json['paidAt'] as String).toLocal(),
        batchCode: json['batchCode'] as String,
        customerName: json['customerName'] as String,
        lineCount: json['lineCount'] as int,
        totalKg: (json['totalKg'] as num).toDouble(),
        totalAmount: (json['totalAmount'] as num).toInt(),
      );
}

class PackedTag {
  const PackedTag({
    required this.tagCode,
    required this.weightG,
    required this.gradeCode,
  });

  final String tagCode;
  final int weightG;
  final String gradeCode;

  factory PackedTag.fromJson(Map<String, dynamic> json) => PackedTag(
    tagCode: json['tagCode'] as String,
    weightG: json['weightG'] as int,
    gradeCode: json['gradeCode'] as String,
  );
}

class OperatorOrderLine {
  const OperatorOrderLine({
    required this.orderLineId,
    required this.title,
    required this.gradeCode,
    required this.gradeName,
    required this.quantityKg,
    required this.assignedKg,
    required this.assignedCount,
    required this.tags,
  });

  final int orderLineId;
  final String title;
  final String gradeCode;
  final String gradeName;
  final double quantityKg;
  final double assignedKg;
  final int assignedCount;
  final List<PackedTag> tags;

  factory OperatorOrderLine.fromJson(Map<String, dynamic> json) =>
      OperatorOrderLine(
        orderLineId: json['orderLineId'] as int,
        title: json['title'] as String,
        gradeCode: json['gradeCode'] as String,
        gradeName: json['gradeName'] as String,
        quantityKg: (json['quantityKg'] as num).toDouble(),
        assignedKg: (json['assignedKg'] as num).toDouble(),
        assignedCount: json['assignedCount'] as int,
        tags: [
          for (final t in json['tags'] as List<dynamic>? ?? const [])
            PackedTag.fromJson(Map<String, dynamic>.from(t as Map)),
        ],
      );
}

class OperatorOrderDetail {
  const OperatorOrderDetail({
    required this.orderNo,
    required this.status,
    required this.placedAt,
    required this.batchCode,
    required this.customerName,
    required this.recipientName,
    required this.recipientPhone,
    required this.shippingAddress,
    required this.totalAmount,
    required this.totalKg,
    required this.lines,
    this.paidAt,
    this.shipment,
  });

  final String orderNo;
  final String status;
  final DateTime placedAt;
  final DateTime? paidAt;
  final String batchCode;
  final String customerName;
  final String recipientName;
  final String recipientPhone;
  final String shippingAddress;
  final int totalAmount;
  final double totalKg;
  final List<OperatorOrderLine> lines;
  final OrderShipment? shipment;

  factory OperatorOrderDetail.fromJson(Map<String, dynamic> json) =>
      OperatorOrderDetail(
        orderNo: json['orderNo'] as String,
        status: json['status'] as String,
        placedAt: DateTime.parse(json['placedAt'] as String).toLocal(),
        paidAt: json['paidAt'] == null
            ? null
            : DateTime.parse(json['paidAt'] as String).toLocal(),
        batchCode: json['batchCode'] as String,
        customerName: json['customerName'] as String,
        recipientName: json['recipientName'] as String,
        recipientPhone: json['recipientPhone'] as String,
        shippingAddress: json['shippingAddress'] as String,
        totalAmount: (json['totalAmount'] as num).toInt(),
        totalKg: (json['totalKg'] as num).toDouble(),
        lines: [
          for (final l in json['lines'] as List<dynamic>? ?? const [])
            OperatorOrderLine.fromJson(Map<String, dynamic>.from(l as Map)),
        ],
        shipment: json['shipment'] == null
            ? null
            : OrderShipment.fromJson(
                Map<String, dynamic>.from(json['shipment'] as Map),
              ),
      );
}

/// Nhãn tiếng Việt của trạng thái đơn phía hộ nuôi.
const operatorOrderStatusLabels = <String, String>{
  'Paid': 'Chờ đóng gói',
  'Packed': 'Chờ giao',
  'Shipping': 'Đang giao',
  'Delivered': 'Đã giao',
  'Completed': 'Hoàn tất',
};

String operatorOrderStatusLabel(String status) =>
    operatorOrderStatusLabels[status] ?? status;

/// Thông tin giao nhận hộ nuôi khai (TL-31 §6.1). Nền tảng không vận chuyển, không thu phí ship.
/// Đơn demo cũ có thể có shippedAt mà không có carrierName/driverPhone.
class OrderShipment {
  const OrderShipment({
    this.carrierName,
    this.vehiclePlate,
    this.driverPhone,
    this.expectedArrivalAt,
    this.note,
    this.shippedAt,
    this.deliveredAt,
    this.receivedAt,
    this.returnWindowEndsAt,
    this.completedAt,
  });

  final String? carrierName;
  final String? vehiclePlate;
  final String? driverPhone;
  final DateTime? expectedArrivalAt;
  final String? note;
  final DateTime? shippedAt;
  final DateTime? deliveredAt;
  final DateTime? receivedAt;
  final DateTime? returnWindowEndsAt;
  final DateTime? completedAt;

  static DateTime? _date(Object? v) =>
      v == null ? null : DateTime.parse(v as String).toLocal();

  factory OrderShipment.fromJson(Map<String, dynamic> json) => OrderShipment(
    carrierName: json['carrierName'] as String?,
    vehiclePlate: json['vehiclePlate'] as String?,
    driverPhone: json['driverPhone'] as String?,
    expectedArrivalAt: _date(json['expectedArrivalAt']),
    note: json['note'] as String?,
    shippedAt: _date(json['shippedAt']),
    deliveredAt: _date(json['deliveredAt']),
    receivedAt: _date(json['receivedAt']),
    returnWindowEndsAt: _date(json['returnWindowEndsAt']),
    completedAt: _date(json['completedAt']),
  );
}

/// Thân POST /api/orders/{orderNo}/ship. Không có phí ship.
class ShipOrderInput {
  const ShipOrderInput({
    required this.carrierName,
    required this.driverPhone,
    this.vehiclePlate,
    this.expectedArrivalAt,
    this.note,
  });

  final String carrierName;
  final String driverPhone;
  final String? vehiclePlate;
  final DateTime? expectedArrivalAt;
  final String? note;

  Map<String, dynamic> toJson() => {
    'carrierName': carrierName,
    'driverPhone': driverPhone,
    if (vehiclePlate != null) 'vehiclePlate': vehiclePlate,
    if (expectedArrivalAt != null)
      'expectedArrivalAt': expectedArrivalAt!.toUtc().toIso8601String(),
    if (note != null) 'note': note,
  };
}

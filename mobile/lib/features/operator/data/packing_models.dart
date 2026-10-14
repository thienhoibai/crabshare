/// Đơn của hộ nuôi cần đóng gói (GET /api/operators/me/orders).
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

  factory OperatorOrderSummary.fromJson(Map<String, dynamic> json) => OperatorOrderSummary(
        orderNo: json['orderNo'] as String,
        status: json['status'] as String,
        placedAt: DateTime.parse(json['placedAt'] as String).toLocal(),
        paidAt: json['paidAt'] == null ? null : DateTime.parse(json['paidAt'] as String).toLocal(),
        batchCode: json['batchCode'] as String,
        customerName: json['customerName'] as String,
        lineCount: json['lineCount'] as int,
        totalKg: (json['totalKg'] as num).toDouble(),
        totalAmount: (json['totalAmount'] as num).toInt(),
      );
}

class PackedTag {
  const PackedTag({required this.tagCode, required this.weightG, required this.gradeCode});

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

  factory OperatorOrderLine.fromJson(Map<String, dynamic> json) => OperatorOrderLine(
        orderLineId: json['orderLineId'] as int,
        title: json['title'] as String,
        gradeCode: json['gradeCode'] as String,
        gradeName: json['gradeName'] as String,
        quantityKg: (json['quantityKg'] as num).toDouble(),
        assignedKg: (json['assignedKg'] as num).toDouble(),
        assignedCount: json['assignedCount'] as int,
        tags: [for (final t in json['tags'] as List<dynamic>? ?? const []) PackedTag.fromJson(Map<String, dynamic>.from(t as Map))],
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

  factory OperatorOrderDetail.fromJson(Map<String, dynamic> json) => OperatorOrderDetail(
        orderNo: json['orderNo'] as String,
        status: json['status'] as String,
        placedAt: DateTime.parse(json['placedAt'] as String).toLocal(),
        paidAt: json['paidAt'] == null ? null : DateTime.parse(json['paidAt'] as String).toLocal(),
        batchCode: json['batchCode'] as String,
        customerName: json['customerName'] as String,
        recipientName: json['recipientName'] as String,
        recipientPhone: json['recipientPhone'] as String,
        shippingAddress: json['shippingAddress'] as String,
        totalAmount: (json['totalAmount'] as num).toInt(),
        totalKg: (json['totalKg'] as num).toDouble(),
        lines: [for (final l in json['lines'] as List<dynamic>? ?? const []) OperatorOrderLine.fromJson(Map<String, dynamic>.from(l as Map))],
      );
}

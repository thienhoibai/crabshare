import '../../../core/api/json.dart';

/// Lưu nuôi trong hộp (BR v1.5): trạng thái từng hộp của Lô, từng con cua, đợt lưu nuôi.

/// Một hộp của Lô: GET /api/batches/{code}/boxes.
class BoxState {
  const BoxState({required this.slotCode, this.slotStatus = 'Occupied', this.rackNo, this.tierNo, this.columnNo, this.crabCode, this.crabCondition});
  final String slotCode;
  final String slotStatus;
  final int? rackNo;
  final int? tierNo;
  final int? columnNo;

  /// Con cua đang ở hộp; null là hộp trống.
  final String? crabCode;
  final String? crabCondition;

  bool get hasCrab => crabCode != null;
  bool get inMaintenance => slotStatus == 'Maintenance';

  /// "Dàn 2 · tầng 1 · cột 3"; rỗng khi hộp chưa khai vị trí.
  String get place => [if (rackNo != null) 'Dàn $rackNo', if (tierNo != null) 'tầng $tierNo', if (columnNo != null) 'cột $columnNo'].join(' · ');

  factory BoxState.fromJson(Json j) => BoxState(
    slotCode: str(j, 'slotCode'),
    // GET /api/boxes dùng tên trường `status`, GET /api/batches/{code}/boxes dùng `slotStatus`.
    slotStatus: str(j, 'slotStatus', str(j, 'status', 'Available')),
    rackNo: intOrNull(j, 'rackNo'),
    tierNo: intOrNull(j, 'tierNo'),
    columnNo: intOrNull(j, 'columnNo'),
    crabCode: strOrNull(j, 'crabCode'),
    crabCondition: strOrNull(j, 'crabCondition'),
  );
}

/// Một lần con cua ở một hộp.
class BoxStay {
  const BoxStay({required this.slotCode, required this.assignedAt, this.leftAt, this.reason = 'Stock', this.leaveReason});
  final String slotCode;
  final DateTime assignedAt;
  final DateTime? leftAt;
  final String reason;
  final String? leaveReason;

  factory BoxStay.fromJson(Json j) => BoxStay(
    slotCode: str(j, 'slotCode'),
    assignedAt: dateOf(j, 'assignedAt'),
    leftAt: dateOrNull(j, 'leftAt'),
    reason: str(j, 'reason'),
    leaveReason: strOrNull(j, 'leaveReason'),
  );
}

/// Một sự kiện tồn của con cua (nhận, xếp hộp, chuyển hộp, lột xác, chết...).
class CrabEvent {
  const CrabEvent({required this.type, required this.occurredAt, this.slotCode, this.weightG, this.reason, this.source = 'App', this.evidenceId});
  final String type;
  final DateTime occurredAt;
  final String? slotCode;
  final double? weightG;
  final String? reason;
  final String source;
  final int? evidenceId;

  factory CrabEvent.fromJson(Json j) => CrabEvent(
    type: str(j, 'eventType'),
    occurredAt: dateOf(j, 'occurredAt'),
    slotCode: strOrNull(j, 'slotCode'),
    weightG: doubleOrNull(j, 'weightG'),
    reason: strOrNull(j, 'reason'),
    source: str(j, 'source', 'App'),
    evidenceId: intOrNull(j, 'evidenceId'),
  );
}

/// Một con cua trong tồn: GET /api/batches/{code}/crab-units, GET /api/crab-units/{crabCode}.
class CrabUnit {
  const CrabUnit({
    required this.crabCode,
    required this.batchCode,
    required this.inventoryStatus,
    this.condition = 'Healthy',
    this.sex = '',
    this.maturity = '',
    this.species = '',
    this.lotCode = '',
    this.originRegion = '',
    this.harvestedOn,
    this.receivedWeightG = 0,
    this.receivedAt,
    this.currentSlotCode,
    this.replacesCrabCode,
    this.boxes = const [],
    this.events = const [],
  });

  final String crabCode;
  final String batchCode;
  final String inventoryStatus;
  final String condition;
  final String sex;
  final String maturity;
  final String species;
  final String lotCode;
  final String originRegion;
  final DateTime? harvestedOn;
  final double receivedWeightG;
  final DateTime? receivedAt;
  final String? currentSlotCode;

  /// Con này được thả bù thay cho con đã chết có mã này.
  final String? replacesCrabCode;
  final List<BoxStay> boxes;
  final List<CrabEvent> events;

  /// Vừa nhận vào tồn, chưa ở hộp nào.
  bool get isWaiting => inventoryStatus == 'Received';
  bool get isDead => inventoryStatus == 'Dead';
  String? get lastSlotCode => boxes.isEmpty ? null : boxes.last.slotCode;

  factory CrabUnit.fromJson(Json j) => CrabUnit(
    crabCode: str(j, 'crabCode'),
    batchCode: str(j, 'batchCode'),
    inventoryStatus: str(j, 'inventoryStatus'),
    condition: str(j, 'condition', 'Healthy'),
    sex: str(j, 'sex'),
    maturity: str(j, 'maturity'),
    species: str(j, 'species'),
    lotCode: str(j, 'lotCode'),
    originRegion: str(j, 'originRegion'),
    harvestedOn: dateOrNull(j, 'harvestedOn'),
    receivedWeightG: doubleOf(j, 'receivedWeightG'),
    receivedAt: dateOrNull(j, 'receivedAt'),
    currentSlotCode: strOrNull(j, 'currentSlotCode'),
    replacesCrabCode: strOrNull(j, 'replacesCrabCode'),
    boxes: [for (final b in asJsonList(j['boxes'])) BoxStay.fromJson(b)],
    events: [for (final e in asJsonList(j['events'])) CrabEvent.fromJson(e)],
  );
}

/// Đợt lưu nuôi của Lô: GET /api/batches/{code}/holding (404 khi Lô chưa thả con nào).
class Holding {
  const Holding({
    required this.holdingCode,
    required this.status,
    required this.stockedAt,
    this.expectedEndDate,
    this.method = '',
    this.boxed = 0,
    this.dead = 0,
    this.restocked = 0,
    this.maxRestock = 0,
    this.received = 0,
  });

  final String holdingCode;
  final String status;
  final DateTime stockedAt;
  final DateTime? expectedEndDate;
  final String method;

  /// Số con đang ở hộp.
  final int boxed;
  final int dead;
  final int restocked;
  final int maxRestock;
  final int received;

  factory Holding.fromJson(Json j) => Holding(
    holdingCode: str(j, 'holdingCode'),
    status: str(j, 'status'),
    stockedAt: dateOf(j, 'stockedAt'),
    expectedEndDate: dateOrNull(j, 'expectedEndDate'),
    method: str(j, 'method'),
    boxed: intOf(j, 'boxed'),
    dead: intOf(j, 'dead'),
    restocked: intOf(j, 'restocked'),
    maxRestock: intOf(j, 'maxRestock'),
    received: intOf(j, 'received'),
  );
}

/// Hộp có cua đã chết mà chưa thả bù: số hộp → mã con đã chết. Hộp là hộp cuối cùng con đó ở.
Map<String, String> restockSlots(List<CrabUnit> crabs) {
  final replaced = {
    for (final c in crabs)
      if (c.replacesCrabCode != null) c.replacesCrabCode!,
  };
  return {
    for (final c in crabs)
      if (c.isDead && c.lastSlotCode != null && !replaced.contains(c.crabCode)) c.lastSlotCode!: c.crabCode,
  };
}

/// Nhãn sự kiện tồn của một con cua (status_labels.dart chưa có nhóm này).
String crabEventLabel(String code) =>
    const {
      'Received': 'Nhận vào tồn',
      'Boxed': 'Xếp vào hộp',
      'Moved': 'Chuyển hộp',
      'Died': 'Chết',
      'Molted': 'Lột xác',
      'AbnormalFeeding': 'Ăn kém',
      'Inspected': 'Đã kiểm tra',
      'Graded': 'Phân hạng',
      'Destroyed': 'Loại bỏ',
      'Allocated': 'Phân bổ cho đơn',
      'Released': 'Nhả phân bổ',
      'Shipped': 'Xuất hàng',
      'Delivered': 'Đã giao',
      'Returned': 'Trả về tồn',
      'Sold': 'Đã bán',
    }[code] ??
    code;

String boxReasonLabel(String code) => const {'Stock': 'Thả ban đầu', 'Restock': 'Thả bù', 'Move': 'Chuyển hộp'}[code] ?? code;

String leaveReasonLabel(String? code) =>
    code == null ? '' : const {'Moved': 'Chuyển hộp', 'Died': 'Cua chết', 'Harvested': 'Thu hoạch'}[code] ?? code;

String holdingStatusLabel(String code) =>
    const {'Active': 'Đang lưu nuôi', 'Harvesting': 'Đang thu hoạch', 'Ended': 'Đã kết thúc', 'Closed': 'Đã kết thúc'}[code] ?? code;

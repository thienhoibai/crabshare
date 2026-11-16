import '../../../core/api/json.dart';

/// Mô hình dữ liệu khu người nuôi (BR v1.5). Mã trạng thái giữ nguyên chuỗi backend trả về;
/// nhãn tiếng Việt lấy từ shared/status_labels.dart.

/// Lô của hộ nuôi: GET /api/operators/me/batches.
class FarmBatch {
  const FarmBatch({
    required this.code,
    required this.title,
    required this.status,
    this.mode = 'P',
    this.crabType = '',
    this.plannedQuantity = 0,
    this.fundedQuantity,
    this.hasHolding = true,
    this.holdingDays,
    this.restockCutoffDays = 0,
  });

  final String code;
  final String title;
  final String status;

  /// P, T hoặc A.
  final String mode;
  final String crabType;
  final int plannedQuantity;
  final int? fundedQuantity;

  /// Lô có lưu nuôi trong hộp. Lô không lưu nuôi thì không có sơ đồ hộp.
  final bool hasHolding;
  final int? holdingDays;
  final int restockCutoffDays;

  int get quantity => fundedQuantity ?? plannedQuantity;

  /// Lô đang có việc tại trại: nhận cua, lưu nuôi, thu hoạch, bán và giao.
  bool get onFarm => const {'Sourcing', 'Stocked', 'InProduction', 'Harvesting', 'Selling', 'Liquidating'}.contains(status);

  /// Xếp cua vào hộp và thả bù chỉ làm được khi Lô đang nhận cua hoặc đang lưu nuôi.
  bool get canBox => hasHolding && (status == 'Sourcing' || status == 'InProduction');
  bool get isHarvesting => status == 'Harvesting';
  bool get canLog => status == 'InProduction' || status == 'Harvesting';

  factory FarmBatch.fromJson(Json j) => FarmBatch(
    code: str(j, 'batchCode'),
    title: str(j, 'title'),
    status: str(j, 'status'),
    mode: str(j, 'batchMode', 'P'),
    crabType: str(j, 'crabType'),
    plannedQuantity: intOf(j, 'plannedQuantity'),
    fundedQuantity: intOrNull(j, 'fundedQuantity'),
    hasHolding: boolOf(j, 'hasHolding'),
    holdingDays: intOrNull(j, 'holdingDays'),
    restockCutoffDays: intOf(j, 'restockCutoffDays'),
  );
}

/// Một Lô trong trang tổng quan: đã ghi nhật ký hôm nay chưa, còn mấy cảnh báo mở.
class DashboardBatch {
  const DashboardBatch({required this.code, required this.title, required this.status, this.openAlerts = 0, this.loggedToday = false});
  final String code;
  final String title;
  final String status;
  final int openAlerts;
  final bool loggedToday;

  factory DashboardBatch.fromJson(Json j) => DashboardBatch(
    code: str(j, 'batchCode'),
    title: str(j, 'title'),
    status: str(j, 'status'),
    openAlerts: intOf(j, 'openAlerts'),
    loggedToday: boolOf(j, 'loggedToday'),
  );
}

/// GET /api/operators/me/dashboard: phần màn "Hôm nay" cần.
class FarmDashboard {
  const FarmDashboard({required this.farmName, this.asOf, this.batches = const []});
  final String farmName;
  final DateTime? asOf;
  final List<DashboardBatch> batches;

  /// Lô đang lưu nuôi chưa có nhật ký hôm nay.
  List<DashboardBatch> get logsDue => [
    for (final b in batches)
      if (b.status == 'InProduction' && !b.loggedToday) b,
  ];

  factory FarmDashboard.fromJson(Json j) => FarmDashboard(
    farmName: str(j, 'farmName'),
    asOf: dateOrNull(j, 'asOf'),
    batches: [for (final b in asJsonList(j['batches'])) DashboardBatch.fromJson(b)],
  );
}

/// Yêu cầu chụp ngẫu nhiên một hộp trước hạn.
class CaptureRequest {
  const CaptureRequest({required this.id, required this.batchCode, required this.slotCode, required this.dueAt, this.status = 'Open'});
  final int id;
  final String batchCode;
  final String slotCode;
  final DateTime dueAt;
  final String status;

  factory CaptureRequest.fromJson(Json j) => CaptureRequest(
    id: intOf(j, 'id'),
    batchCode: str(j, 'batchCode'),
    slotCode: str(j, 'slotCode'),
    dueAt: dateOf(j, 'dueAt'),
    status: str(j, 'status', 'Open'),
  );
}

/// Cảnh báo vận hành của hộ nuôi. Loại, mức và trạng thái là mã backend (nhãn: alertType, severity, alert).
class AlertItem {
  const AlertItem({
    required this.id,
    required this.batchCode,
    required this.type,
    required this.severity,
    required this.message,
    required this.raisedAt,
    required this.ackDeadline,
    required this.status,
    this.responseNote,
    this.acknowledgedAt,
  });

  final int id;
  final String batchCode;
  final String type;
  final String severity;
  final String message;
  final DateTime raisedAt;
  final DateTime ackDeadline;
  final String status;
  final String? responseNote;
  final DateTime? acknowledgedAt;

  bool get isOpen => status == 'Open' || status == 'Escalated';
  bool get canAcknowledge => isOpen && acknowledgedAt == null;

  factory AlertItem.fromJson(Json j) => AlertItem(
    id: intOf(j, 'id'),
    batchCode: str(j, 'batchCode'),
    type: str(j, 'type'),
    severity: str(j, 'severity'),
    message: str(j, 'message'),
    raisedAt: dateOf(j, 'raisedAt'),
    ackDeadline: dateOf(j, 'ackDeadline'),
    status: str(j, 'status'),
    responseNote: strOrNull(j, 'responseNote'),
    acknowledgedAt: dateOrNull(j, 'acknowledgedAt'),
  );
}

/// Ảnh bằng chứng gần nhất của một hộp.
class BoxEvidenceSummary {
  const BoxEvidenceSummary({required this.id, required this.receivedAt, required this.reviewStatus});
  final int id;
  final DateTime receivedAt;
  final String reviewStatus;

  factory BoxEvidenceSummary.fromJson(Json j) =>
      BoxEvidenceSummary(id: intOf(j, 'id'), receivedAt: dateOf(j, 'receivedAt'), reviewStatus: str(j, 'reviewStatus'));
}

/// Một hộp của trại trong danh sách chọn hộp (GET /api/boxes).
class BoxSlot {
  const BoxSlot({required this.slotCode, this.status = 'Occupied', this.batchCode, this.latestEvidence});
  final String slotCode;
  final String status;
  final String? batchCode;
  final BoxEvidenceSummary? latestEvidence;

  factory BoxSlot.fromJson(Json j) {
    final evidence = asJsonOrNull(j['latestEvidence']);
    return BoxSlot(
      slotCode: str(j, 'slotCode'),
      status: str(j, 'status'),
      batchCode: strOrNull(j, 'batchCode'),
      latestEvidence: evidence == null ? null : BoxEvidenceSummary.fromJson(evidence),
    );
  }
}

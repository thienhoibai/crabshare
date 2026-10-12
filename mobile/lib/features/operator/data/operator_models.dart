import '../../../shared/models/batch_enums.dart';

/// Lô đang chạy của hộ nuôi (màn "Hôm nay").
class OperatorBatch {
  const OperatorBatch({
    required this.code,
    required this.title,
    required this.crabType,
    required this.status,
    required this.cycleDays,
    required this.seedQuantity,
    required this.aliveCount,
    required this.loggedToday,
    this.dayOfCycle,
    this.latestLog,
  });

  final String code;
  final String title;
  final CrabType crabType;
  final BatchStatus status;
  final int cycleDays;
  final int seedQuantity;
  final int aliveCount;
  final bool loggedToday;
  final int? dayOfCycle;
  final DailyLog? latestLog;

  double get survivalRate => seedQuantity == 0 ? 0 : aliveCount / seedQuantity;
}

/// Khớp CHECK ck_production_log_plausibility_flag.
enum PlausibilityFlag {
  ok('Ok', 'Bình thường'),
  outOfRange('OutOfRange', 'Ngoài ngưỡng'),
  inconsistent('Inconsistent', 'Không nhất quán');

  const PlausibilityFlag(this.apiValue, this.label);
  final String apiValue;
  final String label;
}

/// Nhật ký ngày của một lô — bảng production_log (người nuôi tự nhập, không có hệ thống nước).
class DailyLog {
  const DailyLog({
    required this.batchCode,
    required this.logDate,
    this.waterTempC,
    this.salinityPpt,
    this.ph,
    this.feedKg,
    this.note,
    this.flag = PlausibilityFlag.ok,
    this.recordedAt,
  });

  final String batchCode;
  final DateTime logDate;
  final double? waterTempC;
  final double? salinityPpt;
  final double? ph;
  final double? feedKg;
  final String? note;
  final PlausibilityFlag flag;
  final DateTime? recordedAt;
}

/// Dữ liệu gửi lên khi lưu nhật ký (POST /api/production-logs — xem backend Features/Production).
class DailyLogInput {
  const DailyLogInput({
    required this.batchCode,
    this.waterTempC,
    this.salinityPpt,
    this.ph,
    this.feedKg,
    this.note,
  });

  final String batchCode;
  final double? waterTempC;
  final double? salinityPpt;
  final double? ph;
  final double? feedKg;
  final String? note;

  Map<String, dynamic> toJson() => {
    'batchCode': batchCode,
    'waterTempC': waterTempC,
    'salinityPpt': salinityPpt,
    'ph': ph,
    'feedKg': feedKg,
    'note': note,
  };
}

/// Yêu cầu chụp ngẫu nhiên — bảng capture_request.
class CaptureRequest {
  const CaptureRequest({
    required this.id,
    required this.batchCode,
    required this.slotCode,
    required this.dueAt,
  });

  final int id;
  final String batchCode;
  final String slotCode;
  final DateTime dueAt;
}

/// Khớp CHECK ck_alert_alert_type.
enum AlertType {
  mortality('Mortality', 'Hao hụt'),
  waterQuality('WaterQuality', 'Chất lượng nước'),
  milestoneDelay('MilestoneDelay', 'Trễ mốc'),
  lowStock('LowStock', 'Sắp hết hàng'),
  dataSilence('DataSilence', 'Thiếu dữ liệu'),
  evidenceFlag('EvidenceFlag', 'Bằng chứng bị gắn cờ');

  const AlertType(this.apiValue, this.label);
  final String apiValue;
  final String label;
}

enum AlertSeverity {
  low('Low', 'Thấp'),
  medium('Medium', 'Trung bình'),
  high('High', 'Cao'),
  critical('Critical', 'Nghiêm trọng');

  const AlertSeverity(this.apiValue, this.label);
  final String apiValue;
  final String label;
}

enum AlertStatus {
  open('Open', 'Chờ phản hồi'),
  acknowledged('Acknowledged', 'Đã xác nhận'),
  escalated('Escalated', 'Đã leo thang'),
  resolved('Resolved', 'Đã xử lý');

  const AlertStatus(this.apiValue, this.label);
  final String apiValue;
  final String label;
}

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
  final AlertType type;
  final AlertSeverity severity;
  final String message;
  final DateTime raisedAt;
  final DateTime ackDeadline;
  final AlertStatus status;
  final String? responseNote;
  final DateTime? acknowledgedAt;
  bool get canAcknowledge =>
      (status == AlertStatus.open || status == AlertStatus.escalated) &&
      acknowledgedAt == null;

  factory AlertItem.fromJson(Map<String, dynamic> json) => AlertItem(
    id: json['id'] as int,
    batchCode: json['batchCode'] as String,
    type: AlertType.values.firstWhere(
      (value) => value.apiValue == json['type'],
    ),
    severity: AlertSeverity.values.firstWhere(
      (value) => value.apiValue == json['severity'],
    ),
    message: json['message'] as String,
    raisedAt: DateTime.parse(json['raisedAt'] as String).toLocal(),
    ackDeadline: DateTime.parse(json['ackDeadline'] as String).toLocal(),
    status: AlertStatus.values.firstWhere(
      (value) => value.apiValue == json['status'],
    ),
    responseNote: json['responseNote'] as String?,
    acknowledgedAt: json['acknowledgedAt'] == null
        ? null
        : DateTime.parse(json['acknowledgedAt'] as String).toLocal(),
  );

  AlertItem copyWith({AlertStatus? status, String? responseNote}) => AlertItem(
    id: id,
    batchCode: batchCode,
    type: type,
    severity: severity,
    message: message,
    raisedAt: raisedAt,
    ackDeadline: ackDeadline,
    status: status ?? this.status,
    responseNote: responseNote ?? this.responseNote,
    acknowledgedAt: acknowledgedAt,
  );
}

/// Khớp CHECK ck_physical_slot_status.
enum SlotStatus { available, occupied, maintenance }

/// Một hộp nuôi đã đánh số (bảng physical_slot). Không cần sơ đồ trại — chỉ cần số hộp.
class BoxSlot {
  const BoxSlot({required this.slotCode, required this.status, this.batchCode});

  final String slotCode;
  final SlotStatus status;
  final String? batchCode;
}

class TodaySummary {
  const TodaySummary({required this.done, required this.total});
  final int done;
  final int total;
}

/// Một con cua đã cân lúc thu hoạch, kèm tem đã in.
class HarvestedCrab {
  const HarvestedCrab({
    required this.tagCode,
    required this.weightG,
    required this.gradeCode,
    this.activated = false,
  });

  final String tagCode;
  final int weightG;
  final String gradeCode;
  final bool activated;

  HarvestedCrab activate() => HarvestedCrab(
    tagCode: tagCode,
    weightG: weightG,
    gradeCode: gradeCode,
    activated: true,
  );
}

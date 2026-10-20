import '../../../shared/models/batch_enums.dart';
import 'production_thresholds.dart';
export 'production_thresholds.dart';

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
    this.canRecord = false,
    this.businessDate,
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
  final bool canRecord;
  final DateTime? businessDate;

  bool get allowsDailyLog =>
      status == BatchStatus.inProduction || status == BatchStatus.harvesting;

  factory OperatorBatch.fromJson(Map<String, dynamic> json) => OperatorBatch(
    code: json['batchCode'] as String,
    title: json['title'] as String,
    crabType: CrabType.fromApi(json['crabType'] as String),
    status: BatchStatus.fromApi(json['status'] as String),
    cycleDays: json['cycleDays'] as int,
    seedQuantity: json['seedQuantity'] as int,
    aliveCount: json['aliveCount'] as int,
    dayOfCycle: json['dayOfCycle'] as int?,
    loggedToday: json['loggedToday'] as bool,
    canRecord: json['canRecord'] as bool,
    businessDate: DateTime.parse(json['businessDate'] as String),
    latestLog: json['latestLog'] == null
        ? null
        : DailyLog.fromJson(
            Map<String, dynamic>.from(json['latestLog'] as Map),
          ),
  );

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
    this.id,
    this.source = 'Manual',
    this.recordedBy,
    this.thresholdVersion,
    this.thresholdsApplied,
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
  final int? id;
  final String source;
  final int? recordedBy;
  final int? thresholdVersion;
  final ProductionThresholdVersion? thresholdsApplied;

  factory DailyLog.fromJson(Map<String, dynamic> json) => DailyLog(
    id: json['id'] as int,
    batchCode: json['batchCode'] as String,
    logDate: DateTime.parse(json['logDate'] as String),
    ph: (json['ph'] as num?)?.toDouble(),
    waterTempC: (json['waterTempC'] as num?)?.toDouble(),
    salinityPpt: (json['salinityPpt'] as num?)?.toDouble(),
    feedKg: (json['feedKg'] as num?)?.toDouble(),
    note: json['note'] as String?,
    source: json['source'] as String,
    flag: PlausibilityFlag.values.firstWhere(
      (value) => value.apiValue == json['plausibilityFlag'],
    ),
    recordedBy: json['recordedBy'] as int?,
    recordedAt: DateTime.parse(json['createdAt'] as String).toLocal(),
    thresholdVersion: json['thresholdVersion'] as int?,
    thresholdsApplied: json['thresholdsApplied'] == null
        ? null
        : ProductionThresholdVersion.fromJson(
            Map<String, dynamic>.from(json['thresholdsApplied'] as Map),
          ),
  );
}

/// Measurements only; the server owns date, source, actor and evaluation.
class DailyLogInput {
  const DailyLogInput({
    required this.batchCode,
    required this.waterTempC,
    required this.salinityPpt,
    required this.ph,
    required this.feedKg,
    this.note,
  });

  final String batchCode;
  final double waterTempC;
  final double salinityPpt;
  final double ph;
  final double feedKg;
  final String? note;

  Map<String, dynamic> toJson() => {
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
    this.status = 'Open',
  });

  final int id;
  final String batchCode;
  final String slotCode;
  final DateTime dueAt;
  final String status;
  factory CaptureRequest.fromJson(Map<String, dynamic> json) => CaptureRequest(
    id: json['id'] as int,
    batchCode: json['batchCode'] as String,
    slotCode: json['slotCode'] as String,
    dueAt: DateTime.parse(json['dueAt'] as String).toLocal(),
    status: json['status'] as String,
  );
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
  const BoxSlot({
    required this.slotCode,
    required this.status,
    this.batchCode,
    this.latestEvidence,
  });

  final String slotCode;
  final SlotStatus status;
  final String? batchCode;
  final BoxEvidenceSummary? latestEvidence;
}

class BoxEvidenceSummary {
  const BoxEvidenceSummary({
    required this.id,
    required this.receivedAt,
    required this.reviewStatus,
  });
  final int id;
  final DateTime receivedAt;
  final String reviewStatus;

  factory BoxEvidenceSummary.fromJson(Map<String, dynamic> json) =>
      BoxEvidenceSummary(
        id: json['id'] as int,
        receivedAt: DateTime.parse(json['receivedAt'] as String).toLocal(),
        reviewStatus: json['reviewStatus'] as String,
      );
}

class TodaySummary {
  const TodaySummary({
    required this.done,
    required this.total,
    this.businessDate,
  });
  final int done;
  final int total;
  final DateTime? businessDate;

  factory TodaySummary.fromBatches(List<OperatorBatch> batches) {
    final dailyBatches = batches
        .where((batch) => batch.allowsDailyLog)
        .toList();
    return TodaySummary(
      done: dailyBatches.where((batch) => batch.loggedToday).length,
      total: dailyBatches.length,
      businessDate: batches.isEmpty ? null : batches.first.businessDate,
    );
  }
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

import '../../../core/api/json.dart';
import 'work_common.dart';

/// Model của màn đo cua: con cua còn chờ đo, trạm đo, lượt đo, số đo, đề xuất phân hạng, tổng hợp của Lô.

/// Con cua còn chờ đo, kèm hộp đang ở (Lô có lưu nuôi).
class WaitingCrab {
  const WaitingCrab({required this.crabCode, required this.slotCode, required this.receivedWeightG});
  final String crabCode;
  final String? slotCode;
  final double? receivedWeightG;

  factory WaitingCrab.fromJson(Json j) => WaitingCrab(
    crabCode: str(j, 'crabCode'),
    slotCode: strOrNull(j, 'currentSlotCode'),
    receivedWeightG: doubleOrNull(j, 'receivedWeightG'),
  );
}

/// Trạm đo của trại.
class Station {
  const Station({required this.code, required this.status, required this.calibrationDue});
  final String code;
  final String status;
  final bool calibrationDue;

  bool get online => status == 'Active';

  factory Station.fromJson(Json j) =>
      Station(code: str(j, 'deviceCode'), status: str(j, 'status'), calibrationDue: boolOf(j, 'calibrationDue'));
}

class MeasureSession {
  const MeasureSession({
    required this.sessionNo,
    required this.batchCode,
    required this.crabCode,
    required this.procedure,
    required this.stationCode,
    required this.status,
    required this.openedAt,
    required this.receivedAt,
    required this.weightG,
    required this.hasWhiteImage,
    required this.hasRedImage,
    required this.failReason,
  });

  final String sessionNo;
  final String batchCode;
  final String crabCode;
  final String procedure;
  final String? stationCode;
  final String status;
  final DateTime? openedAt;
  final DateTime? receivedAt;
  final double? weightG;
  final bool hasWhiteImage;
  final bool hasRedImage;
  final String? failReason;

  bool get isManual => procedure == 'Manual';

  /// Còn chờ trạm gửi bản tin hoặc chờ hệ thống xử lý.
  bool get isWaitingStation => !isManual && (status == 'Open' || status == 'Received');

  String get apiPath => '/api/measurement-sessions/${Uri.encodeComponent(sessionNo)}';

  factory MeasureSession.fromJson(Json j) => MeasureSession(
    sessionNo: str(j, 'sessionNo'),
    batchCode: str(j, 'batchCode'),
    crabCode: str(j, 'crabCode'),
    procedure: str(j, 'procedure', 'Station'),
    stationCode: strOrNull(j, 'stationCode'),
    status: str(j, 'status'),
    openedAt: dateOrNull(j, 'openedAt'),
    receivedAt: dateOrNull(j, 'receivedAt'),
    weightG: doubleOrNull(j, 'weightG'),
    hasWhiteImage: boolOf(j, 'hasWhiteImage'),
    hasRedImage: boolOf(j, 'hasRedImage'),
    failReason: strOrNull(j, 'failReason'),
  );
}

class MeasuredValue {
  const MeasuredValue({required this.metric, required this.value, required this.unit, required this.method});
  final String metric;
  final double value;
  final String unit;
  final String method;

  factory MeasuredValue.fromJson(Json j) =>
      MeasuredValue(metric: str(j, 'metric'), value: doubleOf(j, 'value'), unit: str(j, 'unit'), method: str(j, 'method'));
}

/// Kết quả AI đọc một ảnh của trạm (đèn trắng hoặc soi đỏ).
class AiReading {
  const AiReading({required this.imageKind, required this.status, required this.imageQuality, required this.isSimulated});
  final String imageKind;
  final String status;
  final String? imageQuality;
  final bool isSimulated;

  factory AiReading.fromJson(Json j) => AiReading(
    imageKind: str(j, 'imageKind'),
    status: str(j, 'status'),
    imageQuality: strOrNull(j, 'imageQuality'),
    isSimulated: boolOf(j, 'isSimulated'),
  );
}

/// Đề xuất phân hạng của một con cua. Người nuôi chỉ xem; Nhân viên kiểm phẩm duyệt hạng cuối.
class GradeDecision {
  const GradeDecision({
    required this.decisionNo,
    required this.crabCode,
    required this.sessionNo,
    required this.status,
    required this.weightG,
    required this.carapaceLengthCm,
    required this.cIndex,
    required this.proposedSize,
    required this.proposedGrade,
    required this.holdReasons,
    required this.finalSize,
    required this.finalGrade,
    required this.reason,
    required this.createdAt,
  });

  final String decisionNo;
  final String crabCode;
  final String sessionNo;
  final String status;
  final double? weightG;
  final double? carapaceLengthCm;
  final double? cIndex;
  final String? proposedSize;
  final String? proposedGrade;
  final List<String> holdReasons;
  final String? finalSize;
  final String? finalGrade;
  final String? reason;
  final DateTime? createdAt;

  String? get size => finalSize ?? proposedSize;
  String? get grade => finalGrade ?? proposedGrade;

  /// Lý do giữ lại mà người nuôi tự gỡ được bằng thước kẹp.
  bool get needsCaliper => holdReasons.any(const {'CaliperRequired', 'ImageQuality', 'LowConfidence'}.contains);

  factory GradeDecision.fromJson(Json j) => GradeDecision(
    decisionNo: str(j, 'decisionNo'),
    crabCode: str(j, 'crabCode'),
    sessionNo: str(j, 'sessionNo'),
    status: str(j, 'status'),
    weightG: doubleOrNull(j, 'weightG'),
    carapaceLengthCm: doubleOrNull(j, 'carapaceLengthCm'),
    cIndex: doubleOrNull(j, 'cIndex'),
    proposedSize: strOrNull(j, 'proposedSize'),
    proposedGrade: strOrNull(j, 'proposedGrade'),
    holdReasons: [for (final r in (j['holdReasons'] as List?) ?? const []) r.toString()],
    finalSize: strOrNull(j, 'finalSize'),
    finalGrade: strOrNull(j, 'finalGrade'),
    reason: strOrNull(j, 'reason'),
    createdAt: dateOrNull(j, 'createdAt'),
  );
}

/// Một lượt đo kèm số đo, kết quả AI và đề xuất hiện hành.
class SessionDetail {
  const SessionDetail({required this.session, required this.values, required this.readings, required this.decision});
  final MeasureSession session;
  final List<MeasuredValue> values;
  final List<AiReading> readings;
  final GradeDecision? decision;

  factory SessionDetail.fromJson(Json j) => SessionDetail(
    session: MeasureSession.fromJson(asJson(j['session'])),
    values: [for (final v in asJsonList(j['values'])) MeasuredValue.fromJson(v)],
    readings: [for (final a in asJsonList(j['inferences'])) AiReading.fromJson(a)],
    decision: j['decision'] == null ? null : GradeDecision.fromJson(asJson(j['decision'])),
  );
}

class GradingSummary {
  const GradingSummary({
    required this.received,
    required this.notMeasured,
    required this.draft,
    required this.hold,
    required this.approved,
    required this.rejected,
  });

  final int received;
  final int notMeasured;
  final int draft;
  final int hold;
  final int approved;
  final int rejected;

  /// Đã có đề xuất, chờ Nhân viên kiểm phẩm duyệt.
  int get waitingQc => draft + hold;

  factory GradingSummary.fromJson(Json j) => GradingSummary(
    received: intOf(j, 'received'),
    notMeasured: intOf(j, 'notMeasured'),
    draft: intOf(j, 'draft'),
    hold: intOf(j, 'hold'),
    approved: intOf(j, 'approved'),
    rejected: intOf(j, 'rejected'),
  );
}

/// Số đo nhập tay gửi lên máy chủ; ô để trống thì không gửi.
class ManualValues {
  const ManualValues({this.weightG, this.carapaceLengthCm, this.carapaceWidthCm, this.edgeBandMm});
  final double? weightG;
  final double? carapaceLengthCm;
  final double? carapaceWidthCm;
  final double? edgeBandMm;

  bool get isEmpty => weightG == null && carapaceLengthCm == null && carapaceWidthCm == null && edgeBandMm == null;

  Json toJson() => {
    'weightG': weightG,
    'carapaceLengthCm': carapaceLengthCm,
    'carapaceWidthCm': carapaceWidthCm,
    'edgeBandMm': edgeBandMm,
  };
}

/// Mọi thứ màn đo cua cần cho một Lô.
class MeasureBoard {
  const MeasureBoard({
    required this.batch,
    required this.summary,
    required this.decisions,
    required this.crabs,
    required this.stations,
  });

  final WorkBatch batch;
  final GradingSummary summary;
  final List<GradeDecision> decisions;
  final List<WaitingCrab> crabs;
  final List<Station> stations;

  /// Mã các con đã có đề xuất phân hạng hiện hành.
  Set<String> get measuredCodes => {for (final d in decisions) d.crabCode};

  /// Con chưa đo trước, con đã đo sau; trong mỗi nhóm xếp theo số hộp.
  List<WaitingCrab> get pickList {
    final measured = measuredCodes;
    int rank(WaitingCrab c) => measured.contains(c.crabCode) ? 1 : 0;
    return [...crabs]..sort((a, b) {
      final byRank = rank(a).compareTo(rank(b));
      return byRank != 0 ? byRank : compareCodes(a.slotCode ?? a.crabCode, b.slotCode ?? b.crabCode);
    });
  }
}

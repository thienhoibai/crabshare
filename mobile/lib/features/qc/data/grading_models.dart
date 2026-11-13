import '../../../core/api/json.dart';

/// Quyết định phân hạng của một con cua: số đo, đề xuất, lý do giữ lại, kết quả cuối.
class GradeDecision {
  const GradeDecision({
    required this.decisionNo,
    required this.batchCode,
    required this.crabCode,
    required this.sessionNo,
    required this.ruleSetVersion,
    required this.versionNo,
    required this.status,
    required this.isCurrent,
    required this.holdReasons,
    required this.isSubstandard,
    required this.hasPhoto,
    required this.createdAt,
    this.weightG,
    this.carapaceLengthCm,
    this.cIndex,
    this.edgeBandMm,
    this.proposedSize,
    this.proposedCLevel,
    this.proposedSensory,
    this.proposedGrade,
    this.finalSize,
    this.finalGrade,
    this.specCode,
    this.liveStatus,
    this.foodSafety,
    this.sensoryNote,
    this.reason,
    this.decidedAt,
    this.heldBy,
    this.secondConfirmedAt,
  });
  final String decisionNo;
  final String batchCode;
  final String crabCode;
  final String sessionNo;
  final int ruleSetVersion;
  final int versionNo;
  final String status;
  final bool isCurrent;
  final double? weightG;
  final double? carapaceLengthCm;
  final double? cIndex;
  final double? edgeBandMm;
  final String? proposedSize;
  final String? proposedCLevel;
  final String? proposedSensory;
  final String? proposedGrade;
  final List<String> holdReasons;
  final String? finalSize;
  final String? finalGrade;
  final String? specCode;
  final bool isSubstandard;
  final String? liveStatus;
  final String? foodSafety;
  final String? sensoryNote;
  final String? reason;
  final bool hasPhoto;
  final DateTime? decidedAt;
  final int? heldBy;
  final DateTime? secondConfirmedAt;
  final DateTime createdAt;

  bool get isWaiting => status == 'Draft' || status == 'Hold';
  bool get isHandled => status == 'Approved' || status == 'Rejected';
  bool get isApproved => status == 'Approved';

  /// Một Nhân viên kiểm phẩm đã giữ lại con này, chờ người thứ hai.
  bool get qcHeld => holdReasons.contains('QcHold');
  bool get needsCaliper => holdReasons.contains('CaliperRequired');

  factory GradeDecision.fromJson(Json j) => GradeDecision(
    decisionNo: str(j, 'decisionNo'),
    batchCode: str(j, 'batchCode'),
    crabCode: str(j, 'crabCode'),
    sessionNo: str(j, 'sessionNo'),
    ruleSetVersion: intOf(j, 'ruleSetVersion'),
    versionNo: intOf(j, 'versionNo', 1),
    status: str(j, 'status'),
    isCurrent: boolOf(j, 'isCurrent', true),
    weightG: doubleOrNull(j, 'weightG'),
    carapaceLengthCm: doubleOrNull(j, 'carapaceLengthCm'),
    cIndex: doubleOrNull(j, 'cIndex'),
    edgeBandMm: doubleOrNull(j, 'edgeBandMm'),
    proposedSize: strOrNull(j, 'proposedSize'),
    proposedCLevel: strOrNull(j, 'proposedCLevel'),
    proposedSensory: strOrNull(j, 'proposedSensory'),
    proposedGrade: strOrNull(j, 'proposedGrade'),
    holdReasons: [for (final r in (j['holdReasons'] as List?) ?? const []) r.toString()],
    finalSize: strOrNull(j, 'finalSize'),
    finalGrade: strOrNull(j, 'finalGrade'),
    specCode: strOrNull(j, 'specCode'),
    isSubstandard: boolOf(j, 'isSubstandard'),
    liveStatus: strOrNull(j, 'liveStatus'),
    foodSafety: strOrNull(j, 'foodSafety'),
    sensoryNote: strOrNull(j, 'sensoryNote'),
    reason: strOrNull(j, 'reason'),
    hasPhoto: boolOf(j, 'hasPhoto'),
    decidedAt: dateOrNull(j, 'decidedAt'),
    heldBy: intOrNull(j, 'heldBy'),
    secondConfirmedAt: dateOrNull(j, 'secondConfirmedAt'),
    createdAt: dateOf(j, 'createdAt'),
  );
}

class SpecCount {
  const SpecCount({required this.size, required this.grade, required this.count});
  final String size;
  final String grade;
  final int count;
  factory SpecCount.fromJson(Json j) => SpecCount(size: str(j, 'size'), grade: str(j, 'grade'), count: intOf(j, 'count'));
}

/// Tổng hợp phân hạng của Lô.
class GradingSummary {
  const GradingSummary({
    required this.batchCode,
    required this.batchStatus,
    required this.crabType,
    required this.notMeasured,
    required this.draft,
    required this.hold,
    required this.approved,
    required this.rejected,
    required this.bySpec,
  });
  final String batchCode;
  final String batchStatus;
  final String crabType;
  final int notMeasured;
  final int draft;
  final int hold;
  final int approved;
  final int rejected;
  final List<SpecCount> bySpec;
  int get waiting => draft + hold;

  factory GradingSummary.fromJson(Json j) => GradingSummary(
    batchCode: str(j, 'batchCode'),
    batchStatus: str(j, 'batchStatus'),
    crabType: str(j, 'crabType'),
    notMeasured: intOf(j, 'notMeasured'),
    draft: intOf(j, 'draft'),
    hold: intOf(j, 'hold'),
    approved: intOf(j, 'approved'),
    rejected: intOf(j, 'rejected'),
    bySpec: [for (final s in asJsonList(j['bySpec'])) SpecCount.fromJson(s)],
  );
}

/// Lượt đo của một con cua ở trạm hoặc đo tay.
class MeasureSession {
  const MeasureSession({
    required this.sessionNo,
    required this.procedure,
    required this.hasWhiteImage,
    required this.hasRedImage,
    this.stationCode,
    this.measuredAt,
  });
  final String sessionNo;
  final String procedure;
  final String? stationCode;
  final DateTime? measuredAt;
  final bool hasWhiteImage;
  final bool hasRedImage;
  bool get hasImages => hasWhiteImage || hasRedImage;

  factory MeasureSession.fromJson(Json j) => MeasureSession(
    sessionNo: str(j, 'sessionNo'),
    procedure: str(j, 'procedure'),
    stationCode: strOrNull(j, 'stationCode'),
    measuredAt: dateOrNull(j, 'capturedAt') ?? dateOrNull(j, 'receivedAt'),
    hasWhiteImage: boolOf(j, 'hasWhiteImage'),
    hasRedImage: boolOf(j, 'hasRedImage'),
  );
}

class MeasuredValue {
  const MeasuredValue({required this.metric, required this.value, required this.unit, required this.method, required this.verified, this.confidence});
  final String metric;
  final double value;
  final String unit;
  final String method;
  final double? confidence;
  final bool verified;

  factory MeasuredValue.fromJson(Json j) => MeasuredValue(
    metric: str(j, 'metric'),
    value: doubleOf(j, 'value'),
    unit: str(j, 'unit'),
    method: str(j, 'method'),
    confidence: doubleOrNull(j, 'confidence'),
    verified: str(j, 'verificationStatus') == 'Verified',
  );
}

class AiInference {
  const AiInference({
    required this.imageKind,
    required this.modelName,
    required this.modelVersion,
    required this.isSimulated,
    required this.status,
    this.imageQuality,
    this.confidence,
    this.errorReason,
  });
  final String imageKind;
  final String modelName;
  final String modelVersion;
  final bool isSimulated;
  final String status;
  final String? imageQuality;
  final double? confidence;
  final String? errorReason;

  factory AiInference.fromJson(Json j) => AiInference(
    imageKind: str(j, 'imageKind'),
    modelName: str(j, 'modelName'),
    modelVersion: str(j, 'modelVersion'),
    isSimulated: boolOf(j, 'isSimulated'),
    status: str(j, 'status'),
    imageQuality: strOrNull(j, 'imageQuality'),
    confidence: doubleOrNull(j, 'confidence'),
    errorReason: strOrNull(j, 'errorReason'),
  );
}

/// Số đo, kết quả AI và quyết định hiện hành của một lượt đo.
class SessionMeasurements {
  const SessionMeasurements({required this.session, required this.values, required this.inferences, this.decision});
  final MeasureSession session;
  final List<MeasuredValue> values;
  final List<AiInference> inferences;
  final GradeDecision? decision;

  factory SessionMeasurements.fromJson(Json j) => SessionMeasurements(
    session: MeasureSession.fromJson(asJson(j['session'])),
    values: [for (final v in asJsonList(j['values'])) MeasuredValue.fromJson(v)],
    inferences: [for (final i in asJsonList(j['inferences'])) AiInference.fromJson(i)],
    decision: j['decision'] is Map ? GradeDecision.fromJson(asJson(j['decision'])) : null,
  );
}

class GradeRule {
  const GradeRule({required this.ruleKind, required this.metric, required this.unit, this.lowerBound, this.upperBound});
  final String ruleKind;
  final String metric;
  final double? lowerBound;
  final double? upperBound;
  final String unit;
  factory GradeRule.fromJson(Json j) => GradeRule(
    ruleKind: str(j, 'ruleKind'),
    metric: str(j, 'metric'),
    lowerBound: doubleOrNull(j, 'lowerBound'),
    upperBound: doubleOrNull(j, 'upperBound'),
    unit: str(j, 'unit'),
  );
}

/// Bộ quy tắc phân hạng của một loại cua trong chuẩn phân hạng đang công bố.
class GradeRuleSet {
  const GradeRuleSet({required this.crabType, required this.versionNo, required this.nearThresholdPct, required this.rules});
  final String crabType;
  final int versionNo;
  final double nearThresholdPct;
  final List<GradeRule> rules;
  factory GradeRuleSet.fromJson(Json j) => GradeRuleSet(
    crabType: str(j, 'crabType'),
    versionNo: intOf(j, 'versionNo'),
    nearThresholdPct: doubleOf(j, 'nearThresholdPct'),
    rules: [for (final r in asJsonList(j['rules'])) GradeRule.fromJson(r)],
  );
}

/// Bộ quy tắc mà một quyết định đã dùng, nếu còn trong danh sách đang công bố.
GradeRuleSet? ruleSetOf(List<GradeRuleSet>? sets, String? crabType, int versionNo) {
  for (final s in sets ?? const <GradeRuleSet>[]) {
    if (s.crabType == crabType && s.versionNo == versionNo) return s;
  }
  return null;
}

/// Một số đo nằm sát một ngưỡng của bộ quy tắc.
class NearHit {
  const NearHit(this.metric, this.bound);
  final String metric;
  final double bound;
}

/// Số đo cách một ngưỡng không quá near% của ngưỡng đó (cùng cách tính với máy chủ).
List<NearHit> nearHits(GradeDecision d, GradeRuleSet? set) {
  if (set == null || set.nearThresholdPct <= 0) return const [];
  final checks = [('Size', 'WeightG', d.weightG), ('PhysicalFactor', 'CIndex', d.cIndex), ('Sensory', 'EdgeBandMm', d.edgeBandMm)];
  final hits = <NearHit>[];
  for (final (kind, metric, value) in checks) {
    if (value == null) continue;
    for (final rule in set.rules.where((r) => r.ruleKind == kind && r.metric == metric)) {
      for (final bound in [rule.lowerBound, rule.upperBound]) {
        if (bound != null &&
            bound > 0 &&
            (value - bound).abs() <= bound * set.nearThresholdPct / 100 &&
            !hits.any((h) => h.metric == metric && h.bound == bound)) {
          hits.add(NearHit(metric, bound));
        }
      }
    }
  }
  return hits;
}

const _sizeRank = {'OUT': 0, 'M': 1, 'L': 2, 'XL': 3};
const _gradeRank = {'BELOW': 0, 'G1': 1, 'SPECIAL': 2};

/// Hạng cuối chỉ được bằng hoặc thấp hơn hạng đề xuất từ số đo; chưa có đề xuất thì chọn cả ba.
List<String> gradesUpTo(String? proposed) => [
  for (final g in const ['SPECIAL', 'G1', 'BELOW'])
    if (proposed == null || _gradeRank[g]! <= (_gradeRank[proposed] ?? 0)) g,
];

/// Size cuối không lớn hơn size theo khối lượng cân.
List<String> sizesUpTo(String? proposed) => [
  for (final s in const ['XL', 'L', 'M', 'OUT'])
    if (_sizeRank[s]! <= (_sizeRank[proposed ?? 'OUT'] ?? 0)) s,
];

/// Ngoài cỡ hoặc dưới ngưỡng là cua dưới chuẩn, không vào quy cách đặt trước.
bool isSubstandardSpec(String? size, String? grade) => size == 'OUT' || grade == 'BELOW';

/// Vai của tôi với một quyết định đang chờ.
enum DecisionRole {
  /// Tôi được phân buổi đo của Lô: duyệt, giữ lại, loại, nhập thước kẹp.
  session,

  /// Tôi là người kiểm thứ hai của con bị giữ lại: xác nhận giữ rồi duyệt hoặc loại.
  second,

  /// Tôi là người đã giữ lại con này: chờ người thứ hai.
  holder,
  none;

  /// Việc tôi làm được xếp trước trong hàng chờ.
  int get order => switch (this) { session || second => 0, holder => 1, none => 2 };
}

DecisionRole roleOf(GradeDecision d, {required int? me, required bool hasSession, required bool hasSecond}) {
  if (d.qcHeld) return d.heldBy == me ? DecisionRole.holder : (hasSecond ? DecisionRole.second : DecisionRole.none);
  return hasSession ? DecisionRole.session : DecisionRole.none;
}

const liveStatusLabels = {'Dead': 'Đã chết', 'Weak': 'Yếu nặng', 'Alive': 'Còn sống, khoẻ'};
const foodSafetyLabels = {'Fail': 'Không an toàn', 'Pass': 'An toàn'};

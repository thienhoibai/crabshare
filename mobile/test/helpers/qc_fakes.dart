import 'dart:convert';
import 'dart:typed_data';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/core/capture/captured_photo.dart';
import 'package:crabshare_mobile/core/capture/photo_camera.dart';
import 'package:crabshare_mobile/features/qc/data/grading_models.dart';
import 'package:crabshare_mobile/features/qc/data/grading_repository.dart';
import 'package:crabshare_mobile/features/qc/data/incoming_repository.dart';
import 'package:crabshare_mobile/features/qc/data/qc_models.dart';
import 'package:crabshare_mobile/features/qc/data/qc_repository.dart';
import 'package:crabshare_mobile/features/qc/data/site_visit_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

/// Dữ liệu mẫu và bản giả cho test khu Nhân viên kiểm phẩm.

const qcUserId = 7;
const qcUser = AppUser(userId: qcUserId, email: 'qc@test.local', fullName: 'Lê Kiểm', roles: [Roles.qcInspector]);

// ---------- JSON như backend trả ----------

Map<String, dynamic> taskJson(int id, String kind, {String batch = 'CS-2611-P1', int targetId = 1, String at = '2026-11-12T02:00:00Z'}) => {
  'assignmentId': id,
  'kind': kind,
  'batchCode': batch,
  'targetType': kind == 'IncomingInspection' ? 'GoodsReceipt' : (kind == 'SecondReview' ? 'CrabUnit' : 'Batch'),
  'targetId': targetId,
  'assignedAt': at,
};

Map<String, dynamic> batchJson({String code = 'CS-2611-P1', String crabType = 'RoeCrab'}) => {
  'batchCode': code,
  'batchMode': 'P',
  'status': 'Harvesting',
  'title': 'Cua gạch Năm Căn',
  'crabType': crabType,
  'executorName': 'Trại Út Hiền',
};

Map<String, dynamic> receiptJson({
  String no = 'GR0000000001',
  String status = 'Inspecting',
  int declared = 3,
  int accepted = 1,
  int rejected = 0,
  int? qcUser = qcUserId,
}) => {
  'receiptNo': no,
  'poNo': 'PO0000000001',
  'lotCode': 'LN0000000001',
  'originRegion': 'Năm Căn, Cà Mau',
  'harvestedOn': '2026-11-10',
  'declaredCount': declared,
  'declaredWeightKg': 1.25,
  'receivedAt': '2026-11-12T01:00:00Z',
  'status': status,
  'acceptedCount': accepted,
  'rejectedCount': rejected,
  'acceptedWeightG': 410,
  'qcUserId': qcUser,
  'completedAt': null,
};

Map<String, dynamic> crabJson({String code = 'CU00000001', String? slot = 'A-01-03'}) => {
  'crabCode': code,
  'batchCode': 'CS-2611-P1',
  'lotCode': 'LN0000000001',
  'originRegion': 'Năm Căn, Cà Mau',
  'harvestedOn': '2026-11-10',
  'species': 'Scylla paramamosain',
  'sex': 'Female',
  'maturity': 'Mature',
  'receivedWeightG': 410.5,
  'condition': 'Healthy',
  'inventoryStatus': 'Holding',
  'currentSlotCode': slot,
  'replacesCrabCode': null,
  'receivedAt': '2026-11-12T01:10:00Z',
  'boxes': <dynamic>[],
  'events': <dynamic>[],
};

Map<String, dynamic> decisionJson({
  String no = 'GD0000000001',
  String crab = 'CU00000001',
  String status = 'Draft',
  List<String> holds = const [],
  String? proposedGrade = 'SPECIAL',
  String? finalSize,
  String? finalGrade,
  double? cIndex = 0.661,
  double? lengthCm = 8.5,
  int? heldBy,
  String? secondConfirmedAt,
  String? reason,
  int version = 1,
  String createdAt = '2026-11-12T03:00:00Z',
}) => {
  'decisionNo': no,
  'batchCode': 'CS-2611-P1',
  'crabCode': crab,
  'sessionNo': 'MS-$crab',
  'ruleSetVersion': 1,
  'versionNo': version,
  'status': status,
  'isCurrent': true,
  'weightG': 406.0,
  'carapaceLengthCm': lengthCm,
  'cIndex': cIndex,
  'edgeBandMm': null,
  'proposedSize': 'XL',
  'proposedCLevel': proposedGrade,
  'proposedSensory': null,
  'proposedGrade': proposedGrade,
  'holdReasons': holds,
  'finalSize': finalSize,
  'finalGrade': finalGrade,
  'specCode': finalGrade == null ? null : 'ROE-XL-$finalGrade',
  'isSubstandard': false,
  'liveStatus': null,
  'foodSafety': null,
  'sensoryNote': null,
  'reason': reason,
  'hasPhoto': false,
  'decidedBy': null,
  'decidedAt': status == 'Approved' || status == 'Rejected' ? '2026-11-12T04:00:00Z' : null,
  'heldBy': heldBy,
  'secondQcId': null,
  'secondConfirmedAt': secondConfirmedAt,
  'createdAt': createdAt,
};

Map<String, dynamic> summaryJson({int draft = 2, int hold = 0, int approved = 0, int notMeasured = 4}) => {
  'batchCode': 'CS-2611-P1',
  'batchStatus': 'Harvesting',
  'crabType': 'RoeCrab',
  'ruleSetVersion': 1,
  'received': 10,
  'notMeasured': notMeasured,
  'draft': draft,
  'hold': hold,
  'approved': approved,
  'rejected': 0,
  'substandard': 0,
  'bySpec': [
    {'specCode': 'ROE-XL-G1', 'size': 'XL', 'grade': 'G1', 'count': approved},
  ],
  'assignedQcUserId': qcUserId,
};

Map<String, dynamic> measurementsJson({String crab = 'CU00000001', bool images = true, Map<String, dynamic>? decision}) => {
  'session': {
    'sessionNo': 'MS-$crab',
    'batchCode': 'CS-2611-P1',
    'crabCode': crab,
    'procedure': images ? 'Station' : 'Manual',
    'stationCode': images ? 'TRAM-01' : null,
    'status': 'Measured',
    'openedAt': '2026-11-12T02:50:00Z',
    'capturedAt': '2026-11-12T02:55:00Z',
    'receivedAt': '2026-11-12T02:55:05Z',
    'weightG': 406.0,
    'tofMm': 251,
    'cameraHeightMm': 250,
    'hasWhiteImage': images,
    'hasRedImage': images,
    'failReason': null,
  },
  'values': [
    {'metric': 'WeightG', 'value': 406.0, 'unit': 'g', 'method': 'Scale', 'confidence': null, 'verificationStatus': 'Verified', 'recordedAt': '2026-11-12T02:55:05Z'},
    {'metric': 'CarapaceLengthCm', 'value': 8.5, 'unit': 'cm', 'method': 'AI', 'confidence': 0.93, 'verificationStatus': 'Unverified', 'recordedAt': '2026-11-12T02:55:06Z'},
  ],
  'inferences': [
    {
      'imageKind': 'White', 'modelName': 'carapace', 'modelVersion': '1.0', 'isSimulated': true, 'status': 'Succeeded', 'imageQuality': 'Good',
      'carapaceLengthCm': 8.5, 'carapaceWidthCm': 12.1, 'carapaceAreaCm2': 70.2, 'edgeBandMm': null, 'confidence': 0.93, 'errorReason': null,
      'createdAt': '2026-11-12T02:55:06Z',
    },
  ],
  'decision': decision,
};

/// Chuẩn phân hạng với ngưỡng mức C 0,62 và 0,66, dải sát ngưỡng 2%.
List<Map<String, dynamic>> standardsJson() => [
  {
    'standardCode': 'T/SCFA 0014-2024',
    'ruleSets': [
      {
        'id': 2, 'crabType': 'RoeCrab', 'versionNo': 1, 'status': 'Active', 'nearThresholdPct': 2.0,
        'rules': [
          {'id': 1, 'ruleKind': 'PhysicalFactor', 'metric': 'CIndex', 'lowerBound': 0.66, 'upperBound': null, 'unit': 'g/cm3', 'resultLabel': 'SPECIAL'},
          {'id': 2, 'ruleKind': 'PhysicalFactor', 'metric': 'CIndex', 'lowerBound': 0.62, 'upperBound': 0.66, 'unit': 'g/cm3', 'resultLabel': 'G1'},
          {'id': 3, 'ruleKind': 'Size', 'metric': 'WeightG', 'lowerBound': 350.0, 'upperBound': null, 'unit': 'g', 'resultLabel': 'XL'},
        ],
      },
    ],
  },
];

Map<String, dynamic> reportJson({int? distance = 120}) => {
  'reportNo': 'TT0000000001',
  'batchCode': 'CS-2611-P1',
  'qcUserId': qcUserId,
  'visitedAt': '2026-11-12T05:00:00Z',
  'latitude': 8.76,
  'longitude': 104.99,
  'distanceToFarmM': distance,
  'boxCodes': ['A-01-01', 'A-01-02'],
  'crabsSeen': 240,
  'findings': 'Cua khoẻ, nước trong.',
};

// ---------- Dio giả ghi lại yêu cầu ----------

class QcAdapter implements HttpClientAdapter {
  QcAdapter(this.respond);
  final Object? Function(RequestOptions options) respond;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    if (requestStream != null) await requestStream.drain<void>();
    return ResponseBody.fromString(
      jsonEncode(respond(options)),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio qcDio(QcAdapter adapter) => Dio(BaseOptions(baseUrl: 'http://localhost'))..httpClientAdapter = adapter;

/// Các trường chữ và tên trường tệp của một yêu cầu multipart.
Map<String, String> formFields(RequestOptions options) => {for (final f in (options.data as FormData).fields) f.key: f.value};
List<String> formFiles(RequestOptions options) => [for (final f in (options.data as FormData).files) f.key];

DioException apiError(String detail, [int status = 409]) => DioException(
  requestOptions: RequestOptions(),
  response: Response(requestOptions: RequestOptions(), statusCode: status, data: {'detail': detail}),
);

// ---------- Ảnh và camera giả ----------

final _onePixelPng = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=');

CapturedPhoto qcPhoto() => CapturedPhoto(bytes: _onePixelPng, capturedAt: DateTime.utc(2026, 11, 12, 5), latitude: 8.761234, longitude: 104.991234);

class QcFakeCamera implements PhotoCamera {
  @override
  Future<CapturedPhoto?> capture() async => qcPhoto();
  @override
  Future<void> openSettings() async {}
}

// ---------- Repository giả ----------

class FakeTaskRepository implements QcTaskRepository {
  FakeTaskRepository(this.items, {this.crabType = 'RoeCrab'});
  List<QcTask> items;
  String crabType;
  @override
  Future<List<QcTask>> tasks() async => items;
  @override
  Future<BatchHead> batchHead(String batchCode) async => BatchHead.fromJson(batchJson(code: batchCode, crabType: crabType));
}

class FakeIncomingRepository implements IncomingRepository {
  FakeIncomingRepository(this.current);
  GoodsReceipt current;
  final inspected = <InspectionInput>[];
  int completed = 0;
  Object? failInspect;

  @override
  Future<List<GoodsReceipt>> receiptsOfBatch(String batchCode) async => [current];
  @override
  Future<GoodsReceipt> receipt(String receiptNo) async => current;
  @override
  Future<InspectionResult> inspect(String receiptNo, InspectionInput input) async {
    if (failInspect != null) throw failInspect!;
    inspected.add(input);
    final ok = input.speciesOk && input.alive && input.healthy && input.twoClaws && input.foodSafe;
    return InspectionResult(
      inspectionNo: 'QC${inspected.length}',
      conclusion: ok ? 'Accepted' : 'Rejected',
      weightG: input.weightG,
      crabCode: ok ? 'CU0000000${inspected.length}' : null,
      rejectReason: ok ? null : 'Không đạt: yếu',
    );
  }

  @override
  Future<GoodsReceipt> complete(String receiptNo) async {
    completed++;
    return current = GoodsReceipt.fromJson(
      receiptJson(no: receiptNo, status: 'Completed', declared: current.declaredCount, accepted: current.acceptedCount, rejected: current.rejectedCount),
    );
  }

  @override
  Future<List<CrabUnit>> crabsOfBatch(String batchCode) async => [CrabUnit.fromJson(crabJson())];
}

class FakeGradingRepository implements GradingRepository {
  FakeGradingRepository(this.list, {this.withImages = false});
  List<GradeDecision> list;
  final bool withImages;
  final calls = <String>[];
  String? approvedGrade;
  String? approveReason;

  GradeDecision _find(String no) => list.firstWhere((d) => d.decisionNo == no);
  GradeDecision _store(GradeDecision d) {
    list = [for (final x in list) x.crabCode == d.crabCode ? d : x];
    return d;
  }

  @override
  Future<GradingSummary> summary(String batchCode) async =>
      GradingSummary.fromJson(summaryJson(draft: list.where((d) => d.isWaiting).length, approved: list.where((d) => d.isApproved).length));
  @override
  Future<List<GradeDecision>> decisions(String batchCode) async => list;
  @override
  Future<List<GradeDecision>> crabHistory(String crabCode) async => [for (final d in list) if (d.crabCode == crabCode) d];
  @override
  Future<SessionMeasurements> measurements(String sessionNo) async =>
      SessionMeasurements.fromJson(measurementsJson(crab: sessionNo.substring(3), images: withImages));
  @override
  Future<CrabUnit> crab(String crabCode) async => CrabUnit.fromJson(crabJson(code: crabCode));
  @override
  Future<List<GradeRuleSet>> ruleSets() async => [
    for (final s in standardsJson())
      for (final set in s['ruleSets'] as List) GradeRuleSet.fromJson(Map<String, dynamic>.from(set as Map)),
  ];

  @override
  Future<GradeDecision> approve(String decisionNo, {String? finalGrade, String? sensoryNote, String? reason}) async {
    calls.add('approve $decisionNo');
    approvedGrade = finalGrade;
    approveReason = reason;
    final d = _find(decisionNo);
    return _store(GradeDecision.fromJson(decisionJson(no: decisionNo, crab: d.crabCode, status: 'Approved', finalSize: 'XL', finalGrade: finalGrade ?? d.proposedGrade)));
  }

  @override
  Future<GradeDecision> hold(String decisionNo, String reason) async {
    calls.add('hold $decisionNo $reason');
    final d = _find(decisionNo);
    return _store(GradeDecision.fromJson(decisionJson(no: decisionNo, crab: d.crabCode, status: 'Hold', holds: ['QcHold'], heldBy: qcUserId, reason: reason)));
  }

  @override
  Future<GradeDecision> confirmHold(String decisionNo) async {
    calls.add('confirm-hold $decisionNo');
    final d = _find(decisionNo);
    return _store(
      GradeDecision.fromJson(
        decisionJson(no: decisionNo, crab: d.crabCode, status: 'Hold', holds: ['QcHold'], heldBy: 99, reason: d.reason, secondConfirmedAt: '2026-11-12T04:30:00Z'),
      ),
    );
  }

  @override
  Future<GradeDecision> reject(String decisionNo, {required String liveStatus, required String foodSafety, required String reason, required CapturedPhoto photo}) async {
    calls.add('reject $decisionNo $liveStatus $foodSafety');
    return _store(GradeDecision.fromJson(decisionJson(no: decisionNo, crab: _find(decisionNo).crabCode, status: 'Rejected', reason: reason)));
  }

  @override
  Future<GradeDecision> revise(String decisionNo, {required String finalSize, required String finalGrade, required String reason, required CapturedPhoto photo}) async {
    calls.add('revise $decisionNo $finalSize $finalGrade');
    return _store(
      GradeDecision.fromJson(decisionJson(no: 'GD-NEW', crab: _find(decisionNo).crabCode, status: 'Approved', finalSize: finalSize, finalGrade: finalGrade, version: 2)),
    );
  }

  @override
  Future<SessionMeasurements> caliper(String sessionNo, {double? lengthCm, double? widthCm, double? edgeBandMm}) async {
    calls.add('caliper $sessionNo $lengthCm');
    final crab = sessionNo.substring(3);
    final next = decisionJson(no: 'GD-CAL', crab: crab, status: 'Draft', proposedGrade: 'G1', cIndex: 0.64, lengthCm: lengthCm, version: 2);
    _store(GradeDecision.fromJson(next));
    return SessionMeasurements.fromJson(measurementsJson(crab: crab, images: withImages, decision: next));
  }
}

class FakeSiteVisitRepository implements SiteVisitRepository {
  FakeSiteVisitRepository({this.boxCodes = const ['A-01-01', 'A-01-02', 'A-01-03']});
  final List<String> boxCodes;
  final submitted = <(int, SiteVisitInput)>[];
  Object? fail;

  @override
  Future<List<VisitBox>> boxes(String batchCode) async => [for (final c in boxCodes) VisitBox(slotCode: c, crabCode: 'CU-$c')];
  @override
  Future<BatchProgress> progress(String batchCode) async => const BatchProgress(crabsAlive: 250, daysRaised: 30);
  @override
  Future<List<SiteVisitReport>> reports(String batchCode) async => const [];
  @override
  Future<SiteVisitReport> submit(int assignmentId, SiteVisitInput input) async {
    if (fail != null) throw fail!;
    submitted.add((assignmentId, input));
    return SiteVisitReport.fromJson(reportJson());
  }
}

// ---------- Dựng màn hình trong test ----------

class _EmptyBytesAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async =>
      ResponseBody.fromBytes(const [], 200);
  @override
  void close({bool force = false}) {}
}

/// Dio cho AuthImage trong test: mọi ảnh trả về rỗng, không gọi mạng thật.
Dio emptyImageDio() => Dio(BaseOptions(baseUrl: 'http://localhost'))..httpClientAdapter = _EmptyBytesAdapter();

/// Override dùng chung: phiên đăng nhập của Nhân viên kiểm phẩm, camera giả, không gọi mạng.
List<Override> qcBaseOverrides() => [
  sessionProvider.overrideWith(() => SessionController(const SessionState(token: 't', user: qcUser))),
  photoCameraProvider.overrideWithValue(QcFakeCamera()),
  dioProvider.overrideWithValue(emptyImageDio()),
];

/// Điện thoại nhỏ (360 × 640 điểm), để bắt lỗi tràn bố cục.
const smallPhone = Size(360, 640);

/// Dựng một màn trong khung điện thoại [size] điểm (mặc định 432 × 960).
Future<void> pumpQc(WidgetTester tester, Widget page, List<Override> overrides, {Size size = const Size(432, 960)}) async {
  tester.view.physicalSize = size * 2.5;
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      key: UniqueKey(),
      overrides: [...qcBaseOverrides(), ...overrides],
      child: MaterialApp(theme: buildAppTheme(), home: page),
    ),
  );
  await tester.pumpAndSettle();
}

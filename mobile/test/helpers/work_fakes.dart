import 'dart:typed_data';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/features/operator/delivery/delivery_models.dart';
import 'package:crabshare_mobile/features/operator/delivery/delivery_repository.dart';
import 'package:crabshare_mobile/features/operator/measure/measure_models.dart';
import 'package:crabshare_mobile/features/operator/measure/measure_repository.dart';
import 'package:crabshare_mobile/features/operator/measure/work_common.dart';
import 'package:crabshare_mobile/shared/widgets/app_parts.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'discovery_fakes.dart';

/// Dữ liệu mẫu và repository giả cho màn đo cua và giao hàng của người nuôi (hình dạng lấy từ API thật).

Map<String, dynamic> workBatchJson({String code = 'CS-2611-P1', String status = 'Harvesting', bool hasHolding = true}) => {
  'batchCode': code,
  'batchMode': 'P',
  'status': status,
  'title': 'Cua thịt hộp RAS Năm Căn',
  'crabType': 'FatteningMudCrab',
  'hasHolding': hasHolding,
};

Map<String, dynamic> crabJson(String code, String? slot) => {
  'crabCode': code,
  'batchCode': 'CS-2611-P1',
  'receivedWeightG': 294,
  'inventoryStatus': slot == null ? 'Received' : 'Holding',
  'currentSlotCode': slot,
};

Map<String, dynamic> deviceJson({String code = 'ST-NC-01', String type = 'Station', String status = 'Active'}) => {
  'deviceCode': code,
  'deviceType': type,
  'status': status,
  'calibrationDue': false,
};

Map<String, dynamic> gradingJson() => {
  'batchCode': 'CS-2611-P1',
  'received': 40,
  'notMeasured': 37,
  'draft': 1,
  'hold': 1,
  'approved': 2,
  'rejected': 0,
};

Map<String, dynamic> sessionJson({
  String sessionNo = 'MS1',
  String crabCode = 'CU2611P103',
  String status = 'Open',
  String procedure = 'Station',
  bool images = false,
}) => {
  'sessionNo': sessionNo,
  'batchCode': 'CS-2611-P1',
  'crabCode': crabCode,
  'procedure': procedure,
  'stationCode': procedure == 'Station' ? 'ST-NC-01' : null,
  'status': status,
  'openedAt': '2026-11-12T15:08:15.701+00:00',
  'receivedAt': status == 'Open' ? null : '2026-11-12T15:08:34.844+00:00',
  'weightG': status == 'Measured' ? 318.6 : null,
  'hasWhiteImage': images,
  'hasRedImage': images,
  'failReason': null,
};

Map<String, dynamic> decisionJson({
  String decisionNo = 'GD1',
  String crabCode = 'CU2611P103',
  String sessionNo = 'MS1',
  String status = 'Hold',
  List<String> holdReasons = const ['NearThreshold'],
  String createdAt = '2026-11-12T15:08:34.921+00:00',
}) => {
  'decisionNo': decisionNo,
  'crabCode': crabCode,
  'sessionNo': sessionNo,
  'status': status,
  'weightG': 318.6,
  'carapaceLengthCm': 7.98,
  'cIndex': 0.627,
  'proposedSize': 'L',
  'proposedGrade': 'G1',
  'holdReasons': holdReasons,
  'finalSize': status == 'Approved' ? 'L' : null,
  'finalGrade': status == 'Approved' ? 'G1' : null,
  'reason': null,
  'createdAt': createdAt,
};

Map<String, dynamic> sessionDetailJson({
  String status = 'Open',
  String procedure = 'Station',
  bool decided = false,
  bool images = false,
}) => {
  'session': sessionJson(status: status, procedure: procedure, images: images),
  'values': decided
      ? [
          {'metric': 'WeightG', 'value': 318.6, 'unit': 'g', 'method': procedure == 'Station' ? 'Scale' : 'ManualScale'},
          {'metric': 'CarapaceLengthCm', 'value': 7.98, 'unit': 'cm', 'method': 'AI'},
        ]
      : <Map<String, dynamic>>[],
  'inferences': decided && procedure == 'Station'
      ? [
          {'imageKind': 'White', 'status': 'Succeeded', 'imageQuality': 'Good', 'isSimulated': true},
        ]
      : <Map<String, dynamic>>[],
  'decision': decided ? decisionJson() : null,
};

Map<String, dynamic> trancheJson({
  int trancheId = 1,
  String orderNo = 'OD438SQFC6YG3',
  int seq = 1,
  String dueDate = '2026-10-31',
  String status = 'Planned',
  int allocatedM = 0,
  int allocatedXl = 0,
  String? shipmentNo,
  String? shipmentStatus,
}) => {
  'trancheId': trancheId,
  'orderNo': orderNo,
  'orderStatus': 'Confirmed',
  'seq': seq,
  'dueDate': dueDate,
  'status': status,
  'recipientName': 'Võ Khách Hàng',
  'recipientPhone': '0901234567',
  'deliveryAddress': '12 Nguyễn Huệ, phường Sài Gòn, TP. Hồ Chí Minh',
  'lines': [
    {'lineId': 1, 'specCode': 'FAT-M-G1', 'orderedCrabs': 20, 'allocatedCrabs': allocatedM, 'substitutedCrabs': 0, 'pricePerKg': 380000},
    {'lineId': 2, 'specCode': 'FAT-XL-SPECIAL', 'orderedCrabs': 10, 'allocatedCrabs': allocatedXl, 'substitutedCrabs': 0, 'pricePerKg': 520000},
  ],
  'shipmentNo': shipmentNo,
  'shipmentStatus': shipmentStatus,
};

Map<String, dynamic> acceptanceJson({String status = 'Pending'}) => {
  'status': status,
  'acceptedCrabs': 28,
  'acceptedKg': 11.4,
  'rejectedCrabs': 2,
  'discrepancyReason': 'Hai con yếu',
  'operatorRecordedAt': '2026-11-12T09:00:00+00:00',
  'customerConfirmedAt': status == 'Confirmed' ? '2026-11-12T10:00:00+00:00' : null,
  'goodsValue': status == 'Confirmed' ? 4560000 : null,
  'depositApplied': status == 'Confirmed' ? 1000000 : null,
  'balanceDue': status == 'Confirmed' ? 3560000 : null,
  'balanceDueAt': status == 'Confirmed' ? '2026-11-14T10:00:00+00:00' : null,
  'balancePaidAt': null,
};

Map<String, dynamic> shipmentJson({
  String shipmentNo = 'CG1',
  String status = 'Scheduled',
  Map<String, dynamic>? acceptance,
  String? traceCode = 'QRABC',
}) {
  final sent = status != 'Scheduled';
  final done = acceptance != null;
  return {
    'shipmentNo': shipmentNo,
    'orderNo': 'OD438SQFC6YG3',
    'trancheSeq': 1,
    'status': status,
    'scheduledAt': '2026-11-12T08:00:00+00:00',
    'dispatchedAt': sent ? '2026-11-12T08:30:00+00:00' : null,
    'deliveredAt': null,
    'returnWindowEndsAt': null,
    'transportCondition': 'Thùng xốp',
    'lines': [
      {
        'lineId': 1, 'specCode': 'FAT-M-G1', 'pricePerKg': 380000,
        'dispatchedCrabs': sent ? 20 : null, 'dispatchedKg': sent ? 8.2 : null,
        'receivedCrabs': done ? 20 : null, 'receivedKg': done ? 8.0 : null,
        'acceptedCrabs': done ? 18 : null, 'acceptedKg': done ? 7.2 : null,
        'rejectedCrabs': done ? 2 : null, 'transportLossKg': done ? 0.2 : null, 'goodsValue': done ? 2736000 : null,
      },
      {
        'lineId': 2, 'specCode': 'FAT-XL-SPECIAL', 'pricePerKg': 520000,
        'dispatchedCrabs': sent ? 10 : null, 'dispatchedKg': sent ? 4.3 : null,
        'receivedCrabs': done ? 10 : null, 'receivedKg': done ? 4.2 : null,
        'acceptedCrabs': done ? 10 : null, 'acceptedKg': done ? 4.2 : null,
        'rejectedCrabs': done ? 0 : null, 'transportLossKg': done ? 0.1 : null, 'goodsValue': done ? 2184000 : null,
      },
    ],
    'acceptance': acceptance,
    'balance': acceptance?['status'] == 'Confirmed' ? {'status': 'Pending', 'amount': 3560000} : null,
    'traceCode': traceCode,
  };
}

/// Dio giả ghi lại mọi request; [respond] trả dữ liệu JSON theo request.
(Dio, List<RequestOptions>) recordingDio(Object? Function(RequestOptions) respond) {
  final requests = <RequestOptions>[];
  final dio = discoveryDio((options) {
    requests.add(options);
    return jsonResponse(respond(options) ?? <String, dynamic>{});
  });
  return (dio, requests);
}

class FakeMeasureRepository implements MeasureRepository {
  FakeMeasureRepository({required this.batchValue, List<Map<String, dynamic>>? crabs, List<Map<String, dynamic>>? devices})
    : crabs = crabs ?? [crabJson('CU2611P103', '1703'), crabJson('CU2611P104', '1704'), crabJson('CU2611P105', '1705')],
      devices = devices ?? [deviceJson()];

  WorkBatch batchValue;
  List<Map<String, dynamic>> crabs;
  List<Map<String, dynamic>> devices;
  List<Map<String, dynamic>> decisionList = [];

  /// Kết quả lần lượt của các lần hỏi lượt đo; hết thì lặp lại phần tử cuối.
  List<Map<String, dynamic>> sessionAnswers = [sessionDetailJson()];
  final calls = <String>[];
  ManualValues? recorded;
  int sessionReads = 0;

  @override
  Future<WorkBatch> batch(String batchCode) async => batchValue;
  @override
  Future<GradingSummary> summary(String batchCode) async => GradingSummary.fromJson(gradingJson());
  @override
  Future<List<GradeDecision>> decisions(String batchCode) async => [for (final j in decisionList) GradeDecision.fromJson(j)];
  @override
  Future<List<WaitingCrab>> waitingCrabs(String batchCode, String inventoryStatus) async {
    calls.add('crabs:$inventoryStatus');
    return [for (final j in crabs) WaitingCrab.fromJson(j)];
  }

  @override
  Future<List<Station>> stations() async => [for (final j in devices) Station.fromJson(j)];
  @override
  Future<void> startHarvest(String batchCode) async {
    calls.add('start:$batchCode');
    batchValue = WorkBatch.fromJson(workBatchJson());
  }

  @override
  Future<MeasureSession> openSession({required String crabCode, String? stationCode}) async {
    calls.add('open:$crabCode:${stationCode ?? 'manual'}');
    return MeasureSession.fromJson(
      sessionJson(crabCode: crabCode, procedure: stationCode == null ? 'Manual' : 'Station'),
    );
  }

  @override
  Future<SessionDetail> session(String sessionNo) async {
    final index = sessionReads < sessionAnswers.length ? sessionReads : sessionAnswers.length - 1;
    sessionReads++;
    return SessionDetail.fromJson(sessionAnswers[index]);
  }

  @override
  Future<void> cancelSession(String sessionNo) async => calls.add('cancel:$sessionNo');
  @override
  Future<SessionDetail> recordValues(String sessionNo, ManualValues values) async {
    calls.add('values:$sessionNo');
    recorded = values;
    return SessionDetail.fromJson(sessionDetailJson(status: 'Measured', procedure: 'Manual', decided: true));
  }

  @override
  Future<SessionDetail> reprocess(String sessionNo) async {
    calls.add('process:$sessionNo');
    return SessionDetail.fromJson(sessionDetailJson(status: 'Measured', decided: true));
  }
}

class FakeDeliveryRepository implements DeliveryRepository {
  List<Map<String, dynamic>> batchList = [workBatchJson(code: 'CS-2611-T1', status: 'Selling', hasHolding: false)];
  Map<String, List<Map<String, dynamic>>> trancheMap = {};
  Map<String, Map<String, dynamic>> shipmentMap = {};
  List<(String, String)> shipped = const [('CU1', 'FAT-M-G1'), ('CU2', 'FAT-M-G1')];
  final calls = <String>[];
  List<DispatchLine>? dispatched;
  List<ReceiptLine>? received;
  List<String>? rejected;
  String? reason;
  bool? substitution;
  bool failCreate = false;

  @override
  Future<List<WorkBatch>> batches() async => [for (final j in batchList) WorkBatch.fromJson(j)];
  @override
  Future<List<DeliveryTranche>> tranches(String batchCode) async {
    calls.add('tranches:$batchCode');
    return [for (final j in trancheMap[batchCode] ?? const <Map<String, dynamic>>[]) DeliveryTranche.fromJson(j, batchCode)];
  }

  @override
  Future<Shipment> createShipment(
    int trancheId, {
    required DateTime scheduledAt,
    String? transportCondition,
    required bool allowSubstitution,
  }) async {
    calls.add('create:$trancheId');
    substitution = allowSubstitution;
    if (failCreate) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 422,
          data: {'detail': 'Chưa có con cua nào đã duyệt hạng được phân bổ cho đợt này.'},
        ),
      );
    }
    return Shipment.fromJson(shipmentJson());
  }

  @override
  Future<Shipment> shipment(String shipmentNo) async => Shipment.fromJson(shipmentMap[shipmentNo]!);
  @override
  Future<List<(String, String)>> shippedCrabs(String batchCode, {required String orderNo, required int trancheSeq}) async => shipped;
  @override
  Future<Shipment> dispatch(String shipmentNo, List<DispatchLine> lines, {String? transportCondition}) async {
    calls.add('dispatch:$shipmentNo');
    dispatched = lines;
    shipmentMap[shipmentNo] = shipmentJson(shipmentNo: shipmentNo, status: 'Dispatched');
    return Shipment.fromJson(shipmentMap[shipmentNo]!);
  }

  @override
  Future<Shipment> recordReceipt(
    String shipmentNo,
    List<ReceiptLine> lines, {
    List<String> rejectedCrabCodes = const [],
    String? discrepancyReason,
  }) async {
    calls.add('receipt:$shipmentNo');
    received = lines;
    rejected = rejectedCrabCodes;
    reason = discrepancyReason;
    shipmentMap[shipmentNo] = shipmentJson(shipmentNo: shipmentNo, status: 'Dispatched', acceptance: acceptanceJson());
    return Shipment.fromJson(shipmentMap[shipmentNo]!);
  }
}

/// Màn hình điện thoại hẹp và đủ cao để ListView dựng hết nội dung; tràn chiều ngang sẽ làm test hỏng.
void usePhoneScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(360, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

/// Bọc một màn trong ProviderScope và MaterialApp với theme của app; ảnh cần đăng nhập trả về rỗng.
Widget workApp(Widget home, {MeasureRepository? measure, DeliveryRepository? delivery}) => ProviderScope(
  overrides: [
    if (measure != null) measureRepositoryProvider.overrideWithValue(measure),
    if (delivery != null) deliveryRepositoryProvider.overrideWithValue(delivery),
    authImageProvider.overrideWith((ref, path) async => Uint8List(0)),
  ],
  child: MaterialApp(theme: buildAppTheme(), home: home),
);

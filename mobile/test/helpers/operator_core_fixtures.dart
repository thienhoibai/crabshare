import 'dart:convert';

import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/core/capture/captured_photo.dart';
import 'package:crabshare_mobile/core/capture/photo_camera.dart';
import 'package:crabshare_mobile/features/operator/batches/operator_batches_page.dart';
import 'package:crabshare_mobile/features/operator/operator_core_routes.dart';
import 'package:crabshare_mobile/features/operator/today/operator_today_page.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Dữ liệu và máy chủ giả cho các test của khu người nuôi, nhóm lõi (Hôm nay, Lô, hộp, nhật ký, cảnh báo, ảnh).
/// Màn hình và repository trong test vẫn chạy mã thật; chỉ tầng HTTP được thay.

final tinyPng = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==');

CapturedPhoto testPhoto() => CapturedPhoto(bytes: tinyPng, capturedAt: DateTime.utc(2026, 11, 12, 3), latitude: 8.760123, longitude: 105.050321);

class FakeCamera implements PhotoCamera {
  int captures = 0;
  String? denyWith;

  @override
  Future<CapturedPhoto?> capture() async {
    captures++;
    if (denyWith != null) throw PhotoCaptureException(denyWith!);
    return testPhoto();
  }

  @override
  Future<void> openSettings() async {}
}

Future<void> loadAppFonts() async {
  final loader = FontLoader('Bricolage Grotesque');
  for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
    loader.addFont(rootBundle.load('assets/fonts/BricolageGrotesque-$weight.ttf'));
  }
  await loader.load();
  final display = FontLoader('Bricolage Grotesque Display')
    ..addFont(rootBundle.load('assets/fonts/BricolageGrotesque-Variable.ttf'));
  await display.load();
}

const operatorSession = SessionState(
  token: 'test',
  user: AppUser(userId: 3, email: 'operator@test.local', fullName: 'Trần Văn Nuôi', roles: [Roles.operatorMember], operatorId: 1),
);

Map<String, dynamic> farmBatchJson({String code = 'CS-P1', String status = 'InProduction', bool hasHolding = true, String title = 'Cua thịt hộp'}) =>
    {
      'batchCode': code,
      'batchMode': 'P',
      'status': status,
      'title': title,
      'crabType': 'FatteningMudCrab',
      'plannedQuantity': 40,
      'fundedQuantity': 40,
      'hasHolding': hasHolding,
      'holdingDays': 35,
      'restockCutoffDays': 15,
    };

Map<String, dynamic> boxJson(String slot, {String? crabCode, String? condition, String status = 'Occupied'}) => {
  'slotCode': slot,
  'slotStatus': status,
  'rackNo': 2,
  'tierNo': 1,
  'columnNo': int.parse(slot) % 10,
  'crabCode': crabCode,
  'crabCondition': crabCode == null ? null : condition ?? 'Healthy',
  'assignedAt': crabCode == null ? null : '2026-10-31T12:05:47Z',
};

Map<String, dynamic> crabJson(
  String code, {
  String status = 'Holding',
  String condition = 'Healthy',
  String? slot,
  String? lastSlot,
  String? replaces,
  String batchCode = 'CS-P1',
}) => {
  'crabCode': code,
  'batchCode': batchCode,
  'lotCode': 'LN-01',
  'originRegion': 'Rạch Gốc, Ngọc Hiển, Cà Mau',
  'harvestedOn': '2026-10-30',
  'species': 'Scylla paramamosain',
  'sex': 'Male',
  'maturity': 'Mature',
  'receivedWeightG': 294.0,
  'condition': condition,
  'inventoryStatus': status,
  'currentSlotCode': slot,
  'replacesCrabCode': replaces,
  'receivedAt': '2026-10-31T10:05:47Z',
  'boxes': [
    if (slot != null || lastSlot != null)
      {
        'slotCode': slot ?? lastSlot,
        'assignedAt': '2026-10-31T12:05:47Z',
        'leftAt': slot == null ? '2026-11-05T02:00:00Z' : null,
        'reason': 'Stock',
        'leaveReason': slot == null ? 'Died' : null,
        'evidenceId': null,
      },
  ],
  'events': [
    {
      'eventType': 'Received',
      'occurredAt': '2026-10-31T10:05:47Z',
      'slotCode': null,
      'weightG': null,
      'reason': null,
      'source': 'Qc',
      'evidenceId': null,
    },
    if (slot != null || lastSlot != null)
      {
        'eventType': 'Boxed',
        'occurredAt': '2026-10-31T12:05:47Z',
        'slotCode': slot ?? lastSlot,
        'weightG': null,
        'reason': null,
        'source': 'App',
        'evidenceId': null,
      },
  ],
};

Map<String, dynamic> holdingJson({int boxed = 2, int dead = 1, int restocked = 0}) => {
  'holdingCode': 'HO-P1',
  'batchCode': 'CS-P1',
  'method': 'Hộp RAS tuần hoàn',
  'stockedAt': '2026-10-31T12:05:47Z',
  'expectedEndDate': '2026-12-05',
  'actualEndAt': null,
  'status': 'Active',
  'boxed': boxed,
  'dead': dead,
  'restocked': restocked,
  'maxRestock': 4,
  'received': 4,
};

Map<String, dynamic> alertJson({int id = 37, String status = 'Open', String type = 'DeviceOffline', String? note, String? acknowledgedAt}) => {
  'id': id,
  'batchCode': 'CS-P1',
  'farmName': 'HTX Năm Căn',
  'type': type,
  'severity': 'High',
  'message': 'Thiết bị WS-NC-01 không gửi dữ liệu quá 15 phút.',
  'raisedAt': '2026-11-12T03:00:00Z',
  'ackDeadline': '2026-11-12T05:00:00Z',
  'status': status,
  'acknowledgedAt': acknowledgedAt,
  'responseNote': note,
};

Map<String, dynamic> flaggedJson({int id = 57, String? explanation, String status = 'Flagged', bool review = true}) => {
  'id': id,
  'batchCode': 'CS-P1',
  'slotCode': '1703',
  'mediaType': 'Photo',
  'reviewStatus': status,
  'riskScore': 82,
  'capturedAt': '2026-11-10T07:59:00Z',
  'receivedAt': '2026-11-10T08:00:00Z',
  'latitude': 8.76,
  'longitude': 105.05,
  'explanation': explanation,
  'explainedAt': explanation == null ? null : '2026-11-10T09:00:00Z',
  'canExplain': status == 'Flagged',
  'latestReview': review ? {'verdict': 'NeedMoreEvidence', 'note': 'Ảnh giống ảnh hôm trước, vì sao?', 'reviewedAt': '2026-11-10T08:30:00Z'} : null,
};

Map<String, dynamic> careLogJson({int id = 81, String batchCode = 'CS-P1', String flag = 'Ok', String source = 'Manual', String? note}) => {
  'id': id,
  'batchCode': batchCode,
  'logDate': '2026-11-11',
  'ph': 7.8,
  'waterTempC': 27.5,
  'salinityPpt': 15.0,
  'feedKg': 0.72,
  'note': note,
  'source': source,
  'plausibilityFlag': flag,
  'recordedBy': 4,
  'createdAt': '2026-11-11T10:00:00Z',
  'thresholdVersion': null,
  'thresholdsApplied': null,
};

Map<String, dynamic> careBatchJson({
  String code = 'CS-P1',
  String status = 'InProduction',
  bool loggedToday = false,
  String title = 'Cua thịt hộp',
}) => {
  'batchCode': code,
  'title': title,
  'crabType': 'FatteningMudCrab',
  'status': status,
  'cycleDays': 35,
  'seedQuantity': 40,
  'aliveCount': 0,
  'dayOfCycle': 13,
  'latestLog': loggedToday ? careLogJson(batchCode: code) : null,
  'loggedToday': loggedToday,
  'canRecord': false,
  'businessDate': '2026-11-12',
};

Map<String, dynamic> captureRequestJson({int id = 50, String slot = '1701', Duration dueIn = const Duration(hours: 2)}) => {
  'id': id,
  'batchCode': 'CS-P1',
  'slotCode': slot,
  'requestedAt': DateTime.now().subtract(const Duration(hours: 1)).toUtc().toIso8601String(),
  'dueAt': DateTime.now().add(dueIn).toUtc().toIso8601String(),
  'status': 'Open',
  'fulfilledAt': null,
};

Map<String, dynamic> pageJson(List<Object?> items, {int? total}) => {'items': items, 'page': 1, 'pageSize': 100, 'total': total ?? items.length};

/// Máy chủ giả giữ trạng thái của một trại nhỏ: Lô CS-P1 có bốn hộp (hai hộp có cua, một hộp cua chết chưa thả bù, một hộp trống).
class FarmServer {
  final requests = <RequestOptions>[];

  /// "POST /api/crab-units/CU01/events" → (mã HTTP, câu báo lỗi): ép một lần gọi thất bại.
  final failures = <String, (int, String)>{};

  String farmName = 'HTX Nuôi cua Năm Căn';
  List<Map<String, dynamic>> batches = [farmBatchJson()];
  List<Map<String, dynamic>> boxes = [
    boxJson('1701', crabCode: 'CU01'),
    boxJson('1702', crabCode: 'CU02', condition: 'Molting'),
    boxJson('1703'),
    boxJson('1704'),
  ];
  List<Map<String, dynamic>> crabs = [
    crabJson('CU01', slot: '1701'),
    crabJson('CU02', slot: '1702', condition: 'Molting'),
    crabJson('CU03', status: 'Dead', condition: 'Dead', lastSlot: '1703'),
    crabJson('CU04', status: 'Received'),
  ];
  Map<String, dynamic>? holding = holdingJson();
  List<Map<String, dynamic>> freeBoxes = [
    {'slotCode': '0080', 'status': 'Available', 'rackNo': null, 'tierNo': null, 'columnNo': null, 'batchCode': null, 'latestEvidence': null},
  ];
  List<Map<String, dynamic>> occupied = [
    {'slotCode': '1701', 'status': 'Occupied', 'batchCode': 'CS-P1', 'latestEvidence': null},
    {
      'slotCode': '1702',
      'status': 'Occupied',
      'batchCode': 'CS-P1',
      'latestEvidence': {'id': 9, 'receivedAt': '2026-11-11T03:00:00Z', 'reviewStatus': 'Flagged'},
    },
    {'slotCode': '0999', 'status': 'Occupied', 'batchCode': null, 'latestEvidence': null},
  ];
  int occupiedTotal = 3;
  List<Map<String, dynamic>> alerts = [];
  List<Map<String, dynamic>> captureRequests = [];
  List<Map<String, dynamic>> flagged = [];
  List<Map<String, dynamic>> careBatches = [careBatchJson()];
  List<Map<String, dynamic>> logs = [];
  List<Map<String, dynamic>> water = [];
  String evidenceStatus = 'Accepted';
  String duplicateMatch = 'None';
  int nextEvidenceId = 500;

  Dio dio() => Dio(BaseOptions(baseUrl: 'http://test.local'))..httpClientAdapter = _FarmAdapter(this);

  /// Các lần gọi theo dạng "POST /api/evidence", bỏ query.
  List<String> get calls => [for (final r in requests) '${r.method} ${r.path}'];
  Iterable<RequestOptions> sent(String method, String path) => requests.where((r) => r.method == method && r.path == path);

  ResponseBody _json(Object? value, [int status = 200]) => ResponseBody.fromString(
    jsonEncode(value),
    status,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );
  ResponseBody _problem(int status, String detail) => _json({'status': status, 'detail': detail}, status);
  Map<String, dynamic> _crab(String code) => crabs.firstWhere((c) => c['crabCode'] == code);

  ResponseBody handle(RequestOptions r) {
    requests.add(r);
    final path = r.path;
    final failure = failures['${r.method} $path'];
    if (failure != null) return _problem(failure.$1, failure.$2);
    final query = r.queryParameters;
    final segments = Uri.parse(path).pathSegments.map(Uri.decodeComponent).toList();

    if (r.method == 'GET') {
      if (path == '/api/operators/me/dashboard') {
        return _json({
          'farmName': farmName,
          'asOf': '2026-11-12T03:00:00Z',
          'batches': [
            for (final b in careBatches)
              {
                'batchCode': b['batchCode'],
                'title': b['title'],
                'status': b['status'],
                'aliveCount': 0,
                'openAlerts': 0,
                'loggedToday': b['loggedToday'],
              },
          ],
          'openAlerts': alerts.length,
          'pendingCaptureRequests': captureRequests.length,
          'logsDueToday': careBatches.where((b) => b['loggedToday'] == false).length,
        });
      }
      if (path == '/api/operators/me/batches') return _json(pageJson(batches));
      if (path.startsWith('/api/operators/me/batches/')) {
        final found = batches.where((b) => b['batchCode'] == segments.last).firstOrNull;
        return found == null ? _problem(404, 'Không tìm thấy Lô.') : _json(found);
      }
      if (path == '/api/operators/me/alerts') return _json(alerts);
      if (path == '/api/operators/me/capture-requests') return _json(pageJson(captureRequests));
      if (path == '/api/operators/me/evidence') return _json(pageJson(flagged));
      if (path.endsWith('/image')) {
        return ResponseBody.fromBytes(
          tinyPng,
          200,
          headers: {
            Headers.contentTypeHeader: ['image/png'],
          },
        );
      }
      if (path.startsWith('/api/operators/me/evidence/')) {
        return _json(flagged.firstWhere((e) => '${e['id']}' == segments.last));
      }
      if (path == '/api/operators/me/production-batches') return _json(pageJson(careBatches));
      if (path == '/api/operators/me/production-logs') {
        return _json(pageJson(logs.take(query['pageSize'] as int? ?? 30).toList(), total: logs.length));
      }
      if (path == '/api/boxes') {
        final search = '${query['search'] ?? ''}';
        final source = query['status'] == 'Available' ? freeBoxes : occupied;
        final items = source.where((b) => '${b['slotCode']}'.contains(search)).toList();
        return _json(pageJson(items, total: query['status'] == 'Available' || search.isNotEmpty ? items.length : occupiedTotal));
      }
      if (path.endsWith('/boxes')) return _json(boxes);
      if (path.endsWith('/crab-units')) return _json(crabs);
      if (path.endsWith('/holding')) return holding == null ? _problem(404, 'Lô chưa có đợt lưu nuôi.') : _json(holding);
      if (path.endsWith('/water-readings')) return _json(water);
      if (path.startsWith('/api/crab-units/')) return _json(_crab(segments.last));
    }

    if (r.method == 'POST') {
      if (path == '/api/evidence') {
        final form = r.data as FormData;
        final fields = {for (final f in form.fields) f.key: f.value};
        final requestId = int.tryParse(fields['CaptureRequestId'] ?? '');
        final fulfilled = requestId != null && evidenceStatus != 'Flagged';
        if (fulfilled) {
          captureRequests = captureRequests.where((c) => c['id'] != requestId).toList();
        }
        return _json({
          'id': nextEvidenceId++,
          'batchCode': fields['BatchCode'],
          'slotCode': fields['SlotCode'],
          'reviewStatus': evidenceStatus,
          'duplicateMatch': duplicateMatch,
          'receivedAt': '2026-11-12T03:01:00Z',
          'detection': {'crabDetected': null, 'confidence': null, 'modelVersion': 'none'},
          'captureRequestId': requestId,
          'captureRequestStatus': requestId == null ? null : (fulfilled ? 'Fulfilled' : 'Open'),
        }, 201);
      }
      final body = r.data is Map ? Map<String, dynamic>.from(r.data as Map) : <String, dynamic>{};
      if (path.endsWith('/acknowledge')) {
        final id = int.parse(segments[2]);
        final updated = {
          ...alerts.firstWhere((a) => a['id'] == id),
          'status': 'Acknowledged',
          'responseNote': body['responseNote'],
          'acknowledgedAt': '2026-11-12T04:00:00Z',
        };
        alerts = [for (final a in alerts) a['id'] == id ? updated : a];
        return _json(updated);
      }
      if (path.endsWith('/explanation')) {
        final id = int.parse(segments[2]);
        final updated = {...flagged.firstWhere((e) => e['id'] == id), 'explanation': body['text'], 'explainedAt': '2026-11-12T04:00:00Z'};
        flagged = [for (final e in flagged) e['id'] == id ? updated : e];
        return _json(updated);
      }
      if (path.endsWith('/box-assignments')) {
        final crab = _crab('${body['crabCode']}');
        crab['inventoryStatus'] = 'Holding';
        crab['currentSlotCode'] = body['slotCode'];
        crab['replacesCrabCode'] = body['replacesCrabCode'];
        final known = boxes.where((b) => b['slotCode'] == body['slotCode']).firstOrNull;
        if (known == null) {
          boxes = [...boxes, boxJson('${body['slotCode']}', crabCode: '${body['crabCode']}')];
        } else {
          known['crabCode'] = body['crabCode'];
          known['crabCondition'] = 'Healthy';
        }
        return _json(crab, 200);
      }
      if (path.endsWith('/events')) {
        final crab = _crab(segments[2]);
        if (body['eventType'] == 'Died') {
          for (final b in boxes.where((b) => b['crabCode'] == crab['crabCode'])) {
            b['crabCode'] = null;
            b['crabCondition'] = null;
          }
          crab['inventoryStatus'] = 'Dead';
          crab['condition'] = 'Dead';
          crab['currentSlotCode'] = null;
        }
        if (body['eventType'] == 'Molted') crab['condition'] = 'Molting';
        return _json(crab);
      }
      if (path.endsWith('/move')) {
        final crab = _crab(segments[2]);
        for (final b in boxes.where((b) => b['crabCode'] == crab['crabCode'])) {
          b['crabCode'] = null;
          b['crabCondition'] = null;
        }
        crab['currentSlotCode'] = body['slotCode'];
        return _json(crab);
      }
      if (path.endsWith('/production-logs')) {
        final code = segments[2];
        final log = {...careLogJson(id: 200 + logs.length, batchCode: code), ...body, 'logDate': '2026-11-12'};
        logs = [log, ...logs];
        careBatches = [
          for (final b in careBatches) b['batchCode'] == code ? {...b, 'loggedToday': true, 'latestLog': log} : b,
        ];
        return _json(log, 201);
      }
    }
    return _problem(404, 'Không có đường dẫn ${r.method} $path trong máy chủ giả.');
  }
}

class _FarmAdapter implements HttpClientAdapter {
  _FarmAdapter(this.server);
  final FarmServer server;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    if (requestStream != null) await requestStream.drain<void>();
    return server.handle(options);
  }

  @override
  void close({bool force = false}) {}
}

/// Router thử: hai tab gốc, các màn con thật của nhóm lõi, và một màn giả thay cho "Đo cua" của nhóm khác.
GoRouter coreRouter(String initialLocation) => GoRouter(
  initialLocation: initialLocation,
  routes: [
    GoRoute(path: Routes.operatorToday, builder: (context, state) => const OperatorTodayPage()),
    GoRoute(path: Routes.operatorBatches, builder: (context, state) => const OperatorBatchesPage()),
    GoRoute(
      path: '/o/measure/:code',
      builder: (context, state) => Scaffold(body: Text('Màn đo cua ${state.pathParameters['code']}')),
    ),
    ...operatorCoreRoutes(),
  ],
);

/// Dựng ứng dụng với máy chủ giả, camera giả và router thử trên màn hình cỡ điện thoại.
Future<GoRouter> pumpFarmApp(
  WidgetTester tester,
  FarmServer server, {
  required String location,
  FakeCamera? camera,
  SessionState session = operatorSession,
  Size size = const Size(390, 844),
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  final router = coreRouter(location);
  // Dọn theo thứ tự ngược: gỡ cây widget (huỷ đồng hồ đếm), rồi router, rồi cỡ màn hình.
  addTearDown(tester.view.reset);
  addTearDown(router.dispose);
  addTearDown(() => tester.pumpWidget(const SizedBox()));
  await tester.pumpWidget(
    ProviderScope(
      retry: (count, error) => null,
      overrides: [
        sessionProvider.overrideWith(() => SessionController(session)),
        dioProvider.overrideWithValue(server.dio()),
        photoCameraProvider.overrideWithValue(camera ?? FakeCamera()),
        ...overrides,
      ],
      child: MaterialApp.router(theme: buildAppTheme(), routerConfig: router),
    ),
  );
  await tester.settle();
  return router;
}

extension FarmTester on WidgetTester {
  /// pumpAndSettle rồi đẩy thời gian giả thêm vài nhịp: mỗi lần gọi API qua Dio cần một nhịp đồng hồ,
  /// nên các lần gọi nối tiếp nhau (tải Lô, rồi hộp, rồi hộp trống của trại) không tự xong trong một lần pumpAndSettle.
  Future<void> settle() async {
    for (var i = 0; i < 4; i++) {
      await pumpAndSettle();
      await pump(const Duration(milliseconds: 20));
    }
    await pumpAndSettle();
  }
}

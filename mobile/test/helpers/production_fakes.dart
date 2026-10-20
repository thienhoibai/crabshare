import 'package:dio/dio.dart';

import 'discovery_fakes.dart';

Map<String, dynamic> thresholdJson({int version = 2}) => {
  'id': 12,
  'versionNo': version,
  'phMin': 6.1,
  'phMax': 8.2,
  'waterTempMinC': -2.5,
  'waterTempMaxC': 31.7,
  'salinityMinPpt': 5.3,
  'salinityMaxPpt': 17.3,
  'createdBy': 7,
  'createdAt': '2026-10-20T03:00:00Z',
};

Map<String, dynamic> productionLogJson({bool legacy = false}) => {
  'id': 81,
  'batchCode': 'REAL-01',
  'logDate': '2026-10-21',
  'ph': 8.3,
  'waterTempC': -1.2,
  'salinityPpt': 17.3,
  'feedKg': 1.234,
  'note': 'Đã thay nước',
  'source': legacy ? 'FarmApi' : 'Manual',
  'plausibilityFlag': legacy ? 'Inconsistent' : 'OutOfRange',
  'recordedBy': 7,
  'createdAt': '2026-10-20T17:05:00Z',
  'thresholdVersion': legacy ? null : 2,
  'thresholdsApplied': legacy ? null : thresholdJson(),
};

Map<String, dynamic> productionBatchJson({
  String code = 'REAL-01',
  String status = 'InProduction',
  bool loggedToday = false,
  bool configured = true,
}) => {
  'batchCode': code,
  'title': 'Lô nước lợ',
  'crabType': 'FatteningMudCrab',
  'status': status,
  'cycleDays': 90,
  'seedQuantity': 100,
  'aliveCount': 96,
  'dayOfCycle': 12,
  'latestLog': null,
  'loggedToday': loggedToday,
  'canRecord': configured && status != 'Stocked',
  'businessDate': '2026-10-21',
};

Map<String, dynamic> productionPage(
  List<Object> items, {
  int total = 1,
  int page = 1,
}) => {'items': items, 'page': page, 'pageSize': 100, 'total': total};

/// A transport fixture: widgets and repositories still use their production code.
class ProductionServer {
  bool canConfigure = true;
  Map<String, dynamic>? current = thresholdJson();
  int? postStatus;
  int? putStatus;
  int? getThresholdStatus;
  final requests = <RequestOptions>[];
  List<Map<String, dynamic>> batches = [productionBatchJson()];
  List<Map<String, dynamic>> logs = [];

  Dio dio() => discoveryDio((request) {
    requests.add(request);
    if (request.path.endsWith('/production-batches')) {
      return jsonResponse(productionPage(batches, total: batches.length));
    }
    if (request.path.endsWith('/production-thresholds')) {
      if (request.method == 'PUT') {
        if (putStatus != null) {
          return jsonResponse({
            'code': 'production.thresholds_changed',
            'detail': 'Cấu hình đã thay đổi.',
          }, putStatus!);
        }
        current = {
          ...thresholdJson(version: (current?['versionNo'] as int? ?? 0) + 1),
          ...Map<String, dynamic>.from(request.data as Map),
        };
        return jsonResponse(current!);
      }
      if (getThresholdStatus != null) {
        return jsonResponse({
          'detail': 'Không tải được cấu hình mới.',
        }, getThresholdStatus!);
      }
      return jsonResponse({
        'businessDate': '2026-10-21',
        'canConfigure': canConfigure,
        'canRecord': current != null,
        'current': current,
      });
    }
    if (request.path.endsWith('/production-logs')) {
      if (request.method == 'POST') {
        if (postStatus != null) {
          return jsonResponse({
            'code': 'production.log_exists',
            'detail': 'Lô đã có nhật ký hôm nay.',
          }, postStatus!);
        }
        logs = [productionLogJson()];
        batches = [productionBatchJson(loggedToday: true)];
        return jsonResponse(productionLogJson(), 201);
      }
      return jsonResponse(productionPage(logs, total: logs.length));
    }
    if (request.path.endsWith('/alerts')) return jsonResponse([]);
    return jsonResponse({'detail': 'Unknown route ${request.path}'}, 404);
  });
}

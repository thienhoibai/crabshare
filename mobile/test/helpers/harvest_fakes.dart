import 'package:dio/dio.dart';

import 'discovery_fakes.dart';

Map<String, dynamic> harvestSessionJson({
  int id = 41,
  bool owner = true,
  String status = 'Open',
}) => {
  'id': id,
  'batchCode': 'REAL-01',
  'name': 'Buổi sáng',
  'note': 'Khu A',
  'status': status,
  'startedAt': '2026-10-21T01:00:00Z',
  'completedAt': null,
  'declaredBy': 7,
  'completedBy': null,
  'harvestedCount': 1,
  'totalWeightKg': 0.25,
  'revision': 2,
  'canRecord': status == 'Open',
  'canComplete': owner && status == 'Open',
};

Map<String, dynamic> harvestRecordJson() => {
  'crabItemId': 123,
  'itemUuid': 'crab-uuid',
  'harvestId': 41,
  'batchCode': 'REAL-01',
  'slotCode': '0006',
  'weightG': 250,
  'shellCondition': 'SoftShell',
  'gradeCode': 'SOFT',
  'gradeName': 'Cua mềm',
  'tagCode': '23456789ABCD',
  'tagStatus': 'Printed',
  'tracePath': '/truy-xuat/23456789ABCD',
  'recordedAt': '2026-10-21T02:00:00Z',
  'harvestedCount': 1,
  'totalWeightKg': 0.25,
  'remainingGrowingCount': 9,
};

Map<String, dynamic> harvestContextJson({
  bool active = true,
  bool owner = true,
  int crabId = 123,
}) => {
  'batchCode': 'REAL-01',
  'batchStatus': 'Harvesting',
  'activeHarvest': active ? harvestSessionJson(owner: owner) : null,
  'canStart': owner,
  'canRecord': active,
  'canComplete': active && owner,
  'remainingGrowingCount': 9,
  'harvestedCount': 1,
  'totalWeightKg': 0.25,
  'slotStatus': 'Occupied',
  'currentCrab': {'id': crabId, 'itemUuid': 'crab-uuid', 'allocationId': 15},
  'latestMoltedAt': '2026-10-20T09:00:00Z',
};

Map<String, dynamic> harvestPageJson(
  List<Object?> items, {
  int? total,
  int page = 1,
}) => {
  'items': items,
  'total': total ?? items.length,
  'page': page,
  'pageSize': 20,
};

class HarvestServer {
  final requests = <RequestOptions>[];
  bool active = true,
      owner = true,
      lostRecordResponse = false,
      lostStartResponse = false;
  bool failNextRecord = false;
  int crabId = 123;
  Map<String, dynamic> session = harvestSessionJson();
  List<Map<String, dynamic>> records = [];
  Dio dio() => discoveryDio((request) {
    requests.add(request);
    if (request.path.endsWith('/harvest-context')) {
      return jsonResponse({
        ...harvestContextJson(active: active, owner: owner, crabId: crabId),
        'activeHarvest': active
            ? {...session, 'canComplete': owner, 'canRecord': true}
            : null,
      });
    }
    if (request.path == '/api/boxes') {
      return jsonResponse(
        harvestPageJson([
          {'slotCode': '0006', 'status': 'Occupied', 'batchCode': 'REAL-01'},
          {'slotCode': '0999', 'status': 'Occupied', 'batchCode': 'OTHER'},
        ]),
      );
    }
    if (request.path.endsWith('/harvests')) {
      if (request.method == 'POST') {
        active = true;
        if (lostStartResponse) {
          lostStartResponse = false;
          throw DioException(
            requestOptions: request,
            type: DioExceptionType.connectionError,
          );
        }
        return jsonResponse(session, 201);
      }
      return jsonResponse(harvestPageJson([session]));
    }
    if (request.path.endsWith('/crabs')) {
      if (request.method == 'POST') {
        if (failNextRecord) {
          failNextRecord = false;
          return jsonResponse({
            'code': 'harvest.crab_changed',
            'detail': 'Cá thể đã thay đổi.',
          }, 409);
        }
        records = [harvestRecordJson()];
        if (lostRecordResponse) {
          lostRecordResponse = false;
          throw DioException(
            requestOptions: request,
            type: DioExceptionType.connectionError,
          );
        }
        return jsonResponse(harvestRecordJson(), 201);
      }
      return jsonResponse(harvestPageJson(records));
    }
    if (request.path.endsWith('/complete')) {
      active = false;
      session = {
        ...session,
        'status': 'Completed',
        'revision': 3,
        'canRecord': false,
        'canComplete': false,
      };
      return jsonResponse(session);
    }
    if (request.path == '/api/harvests/41') {
      if (request.method == 'PATCH') {
        session = {
          ...session,
          'name': request.data['name'],
          'note': request.data['note'],
          'revision': 3,
        };
      }
      return jsonResponse(session);
    }
    return jsonResponse({'detail': 'Unknown route ${request.path}'}, 404);
  });
}

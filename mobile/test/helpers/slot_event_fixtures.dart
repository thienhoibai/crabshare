import 'package:dio/dio.dart';

import 'discovery_fakes.dart';

Map<String, dynamic> slotEventJson() => {
  'id': 1,
  'batchCode': 'VI09',
  'slotCode': '0014',
  'eventType': 'Molted',
  'occurredAt': '2026-10-20T01:00:00Z',
  'quantity': 1,
  'crabItemId': 8,
  'itemUuid': 'crab-8',
  'aliveCount': 12,
};
Map<String, dynamic> slotContextJson({bool vacant = false}) => {
  'batchCode': 'VI09',
  'slotCode': '0014',
  'status': vacant ? 'Available' : 'Occupied',
  'currentCrab': vacant
      ? null
      : {'id': 8, 'itemUuid': 'crab-8', 'status': 'Growing'},
  'replacementCandidates': [
    {'id': 9, 'itemUuid': 'dead-9', 'diedAt': '2026-10-19T01:00:00Z'},
  ],
  'availableEvidence': [],
  'restockDeadline': '2026-10-30',
  'canRecord': true,
  'aliveCount': 12,
};
Dio slotEventDio({
  bool vacant = false,
  bool configured = true,
  List<RequestOptions>? requests,
}) => discoveryDio((r) {
  requests?.add(r);
  if (r.path.endsWith('slot-event-policy')) {
    return jsonResponse({
      'batchCode': 'VI09',
      'current': configured
          ? {
              'id': 1,
              'versionNo': 1,
              'restockCutoffBasis': 'BeforeHarvest',
              'restockCutoffDays': 4,
            }
          : null,
      'restockDeadline': configured ? '2026-10-30' : null,
      'businessDate': '2026-10-20',
    });
  }
  if (r.path.endsWith('slot-event-context')) {
    return jsonResponse(slotContextJson(vacant: vacant));
  }
  if (r.path.endsWith('slot-events')) {
    return r.method == 'POST'
        ? jsonResponse(slotEventJson(), 201)
        : jsonResponse({'items': [], 'total': 0, 'page': 1, 'pageSize': 10});
  }
  return jsonResponse({
    'total': 1,
    'items': [
      {
        'slotCode': '0014',
        'status': vacant || r.queryParameters['status'] == 'Available'
            ? 'Available'
            : 'Occupied',
        'batchCode': vacant ? null : 'VI09',
      },
    ],
  });
});

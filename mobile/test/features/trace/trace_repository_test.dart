import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:crabshare_mobile/features/trace/trace_repository.dart';

void main() {
  test('lookup requests the public route and parses the allowlisted response', () async {
    const tagCode = '23456789ABCD';
    final payload = <String, dynamic>{
      'tagCode': tagCode,
      'batchCode': 'BT-TRACE-001',
      'crabType': 'FatteningMudCrab',
      'itemStatus': 'Harvested',
      'weightG': 250,
      'gradeCode': 'L3',
      'gradeName': 'Hạng 3',
      'stockedAt': '2026-09-01T00:00:00Z',
      'harvestedAt': '2026-10-01T00:00:00Z',
      'slotCode': '0001',
      'events': [
        {
          'eventType': 'TagActivated',
          'occurredAt': '2026-10-01T00:00:00Z',
          'note': 'PRIVATE-NOTE',
        },
      ],
      'operatorName': 'PRIVATE-OPERATOR',
      'farmAddress': 'PRIVATE-ADDRESS',
      'itemUuid': 'PRIVATE-UUID',
      'harvestPhotoUri': 'https://private.example/photo.jpg',
      'orderNo': 'PRIVATE-ORDER',
    };
    var requestedPath = '';
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          requestedPath = options.uri.path;
          handler.resolve(Response(
            requestOptions: options,
            statusCode: 200,
            data: payload,
          ));
        },
      ));

    final result = await ApiTraceRepository(dio).lookup(tagCode);

    expect(requestedPath, '/api/trace/$tagCode');
    expect(result.tagCode, tagCode);
    expect(result.batchCode, 'BT-TRACE-001');
    expect(result.weightG, 250);
    expect(result.gradeCode, 'L3');
    expect(result.stockedAt, DateTime(2026, 9, 1));
    expect(result.harvestedAt, DateTime(2026, 10, 1));
    expect(result.slotCode, '0001');
    expect(result.events.single.eventType, 'TagActivated');
  });

  test('lookup accepts null harvest fields from an eligible public response', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) => handler.resolve(Response(
          requestOptions: options,
          statusCode: 200,
          data: {
            'tagCode': '23456789ABCD',
            'batchCode': 'BT-TRACE-002',
            'crabType': 'RoeCrab',
            'itemStatus': 'InStock',
            'weightG': null,
            'gradeCode': null,
            'gradeName': null,
            'stockedAt': '2026-09-01T00:00:00Z',
            'harvestedAt': null,
            'slotCode': '0002',
            'events': [],
          },
        )),
      ));

    final result = await ApiTraceRepository(dio).lookup('23456789ABCD');

    expect(result.weightG, isNull);
    expect(result.gradeCode, isNull);
    expect(result.harvestedAt, isNull);
    expect(result.events, isEmpty);
  });
}

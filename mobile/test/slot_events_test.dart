import 'package:crabshare_mobile/features/operator/slot_events/slot_event_repository.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_repository.dart';
import 'package:crabshare_mobile/features/operator/data/operator_models.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dart:typed_data';

import 'helpers/discovery_fakes.dart';
import 'helpers/slot_event_fixtures.dart';

void main() {
  test('history preserves legacy Stocked and Harvested rows', () async {
    final repo = ApiSlotEventRepository(
      discoveryDio(
        (_) => jsonResponse({
          'total': 2,
          'items': [
            {
              ...slotEventJson(),
              'id': 10,
              'eventType': 'Stocked',
              'actorId': null,
              'itemUuid': null,
              'aliveCount': null,
            },
            {
              ...slotEventJson(),
              'id': 11,
              'eventType': 'Harvested',
              'actorId': null,
            },
          ],
        }),
      ),
    );
    final history = await repo.history('VI09', 1);
    expect(history.items.map((event) => event.id), [10, 11]);
    expect(history.items.map((event) => event.eventTypeLabel), [
      'Thả giống',
      'Thu hoạch',
    ]);
    expect(history.items.first.itemUuid, isNull);
    expect(history.items.first.aliveCount, isNull);
  });
  test('source boxes include vacant boxes for same-slot replacement', () async {
    final requests = <RequestOptions>[];
    final repo = ApiSlotEventRepository(
      discoveryDio((r) {
        requests.add(r);
        return jsonResponse({
          'total': 3,
          'items': [
            {'slotCode': '0014', 'status': 'Occupied', 'batchCode': 'VI09'},
            {'slotCode': '0015', 'status': 'Available', 'batchCode': null},
            {'slotCode': '0016', 'status': 'Occupied', 'batchCode': 'OTHER'},
          ],
        });
      }),
    );
    expect((await repo.sourceBoxes('VI09')).map((b) => b.slotCode), [
      '0014',
      '0015',
    ]);
    expect(requests.single.queryParameters['status'], isNull);
  });

  test('destinations load all Available pages from live box API', () async {
    final repo = ApiSlotEventRepository(
      discoveryDio((r) {
        expect(r.path, '/api/boxes');
        expect(r.queryParameters['status'], 'Available');
        return jsonResponse({
          'total': 101,
          'items': [
            {
              'slotCode': r.queryParameters['page'] == 1 ? '0100' : '0101',
              'status': 'Available',
            },
          ],
        });
      }),
    );
    expect((await repo.destinations()).map((b) => b.slotCode), [
      '0100',
      '0101',
    ]);
  });

  test('Restocked POST uses explicit replacement, camera evidence and stable retry id', () async {
    final requests = <RequestOptions>[];
    final repo = ApiSlotEventRepository(
      discoveryDio((r) {
        requests.add(r);
        return jsonResponse(slotEventJson(), 201);
      }),
    );
    final input = SlotEventInput(
      requestId: newSlotEventRequestId(),
      slotCode: '0014',
      eventType: SlotEventType.restocked,
      occurredAt: DateTime.utc(2026, 10, 20, 1),
      replacesCrabItemId: 9,
      evidenceId: 44,
    );
    await repo.record('VI09', input);
    await repo.record('VI09', input);
    expect(requests.first.path, '/api/batches/VI09/slot-events');
    expect(requests.first.data, requests.last.data);
    expect(requests.first.data, containsPair('quantity', 1));
    expect(requests.first.data, containsPair('replacesCrabItemId', 9));
    expect(requests.first.data, containsPair('evidenceId', 44));
    expect(
      (requests.first.data as Map).containsKey('destinationSlotCode'),
      isFalse,
    );
    expect(
      input.requestId,
      matches(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
    expect(input.requestId, isNot(newSlotEventRequestId()));
    expect((requests.first.data as Map)['occurredAt'], endsWith('Z'));
  });

  test(
    'context uses exact batch and slot and preserves replacement candidates',
    () async {
      final repo = ApiSlotEventRepository(
        discoveryDio((r) {
          expect(r.path, '/api/batches/VI09/slot-event-context');
          expect(r.queryParameters['slotCode'], '0014');
          return jsonResponse(slotContextJson(vacant: true));
        }),
      );
      final result = await repo.context('VI09', '0014');
      expect(result.currentCrab, isNull);
      expect(result.replacementCandidates.single.id, 9);
      expect(result.aliveCount, 12);
    },
  );

  test('409 and 422 preserve server problem detail', () async {
    for (final code in [409, 422, 403]) {
      final repo = ApiSlotEventRepository(
        discoveryDio((_) => jsonResponse({'detail': 'Hộp đã thay đổi.'}, code)),
      );
      try {
        await repo.context('VI09', '0014');
        fail('Expected HTTP $code');
      } on DioException catch (e) {
        expect(e.response?.statusCode, code);
        expect(apiErrorMessage(e), 'Hộp đã thay đổi.');
      }
    }
  });

  test(
    'restock camera upload adds optional slotEventType multipart field',
    () async {
      final dio = discoveryDio((r) {
        final fields = Map.fromEntries((r.data as FormData).fields);
        expect(fields['slotEventType'], 'Restocked');
        expect(fields['batchCode'], 'VI09');
        return jsonResponse({
          'id': 44,
          'reviewStatus': 'Pending',
          'duplicateMatch': 'None',
          'receivedAt': '2026-10-20T01:00:00Z',
          'detection': {'modelVersion': 'none'},
        }, 201);
      });
      final result = await ApiEvidenceRepository(dio).upload(
        box: const BoxSlot(
          slotCode: '0014',
          status: SlotStatus.available,
          batchCode: 'VI09',
        ),
        photo: EvidencePhoto(
          bytes: Uint8List.fromList([255, 216, 255]),
          capturedAt: DateTime.now(),
          latitude: 10,
          longitude: 106,
        ),
        slotEventType: 'Restocked',
      );
      expect(result.id, 44);
    },
  );
}

import 'package:crabshare_mobile/features/operator/data/api_operator_repository.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_repository.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/harvest_fakes.dart';

void main() {
  test('operator delegates complete record contract to real HTTP and preserves server grade', () async {
    final repo = ApiOperatorRepository(
      discoveryDio((request) {
        expect(request.path, '/api/harvests/41/crabs');
        expect(request.method, 'POST');
        expect(request.data, {
          'requestId': 'stable-id',
          'slotCode': '0006',
          'expectedCrabItemId': 123,
          'weightG': 250,
          'shellCondition': 'SoftShell',
        });
        return jsonResponse(harvestRecordJson(), 201);
      }),
    );
    final record = await repo.recordHarvestedCrab(
      harvestId: 41,
      requestId: 'stable-id',
      slotCode: '0006',
      expectedCrabItemId: 123,
      weightG: 250,
      shellCondition: ShellCondition.softShell,
    );
    expect(record.crabItemId, 123);
    expect(record.itemUuid, 'crab-uuid');
    expect(record.gradeCode, 'SOFT');
    expect(record.tagStatus, 'Printed');
    expect(record.tracePath, '/truy-xuat/23456789ABCD');
    expect(record.remainingGrowingCount, 9);
    expect(record.totalWeightKg, .25);
  });

  test(
    'context, named start, metadata and complete use shared HTTP contract',
    () async {
      final server = HarvestServer()..active = false;
      final repo = ApiHarvestRepository(server.dio());
      final before = await repo.context('REAL-01', slotCode: '0006');
      expect(before.activeHarvest, isNull);
      expect(before.currentCrab!.allocationId, 15);
      expect(before.latestMoltedAt, DateTime.parse('2026-10-20T09:00:00Z'));
      final session = await repo.start(
        'REAL-01',
        requestId: 'start-id',
        name: 'Sáng',
        note: 'A',
      );
      expect(server.requests.last.data, {
        'requestId': 'start-id',
        'name': 'Sáng',
        'note': 'A',
      });
      expect(session.canComplete, isTrue);
      await repo.update(41, expectedRevision: 2, name: 'Chiều', note: 'B');
      expect(server.requests.last.data, {
        'expectedRevision': 2,
        'name': 'Chiều',
        'note': 'B',
      });
      final done = await repo.complete(41, expectedRevision: 3);
      expect(server.requests.last.data, {'expectedRevision': 3});
      expect(done.status, 'Completed');
      expect((await repo.get(41)).revision, 3);
    },
  );

  test('boxes traverses all pages and filters occupied boxes of the selected batch', () async {
    final pages = <int>[];
    final repo = ApiHarvestRepository(
      discoveryDio((request) {
        expect(request.path, '/api/boxes');
        expect(request.queryParameters['status'], 'Occupied');
        final page = request.queryParameters['page'] as int;
        pages.add(page);
        return jsonResponse({
          'items': [
            {
              'slotCode': '000$page',
              'status': 'Occupied',
              'batchCode': page == 1 ? 'OTHER' : 'REAL-01',
            },
          ],
          'total': 2,
          'page': page,
          'pageSize': 1,
        });
      }),
    );
    final boxes = await repo.boxes('REAL-01');
    expect(pages, [1, 2]);
    expect(boxes.single.slotCode, '0002');
  });

  test('session and crab history send paging and preserve nullable legacy snapshots', () async {
    final repo = ApiHarvestRepository(
      discoveryDio((request) {
        expect(request.queryParameters, {'page': 2, 'pageSize': 20});
        return jsonResponse(
          harvestPageJson(
            request.path.endsWith('/crabs')
                ? [
                    {
                      ...harvestRecordJson(),
                      'shellCondition': null,
                      'recordedAt': null,
                      'tagStatus': null,
                    },
                  ]
                : [
                    {
                      ...harvestSessionJson(status: 'Legacy'),
                      'canRecord': false,
                      'canComplete': false,
                    },
                  ],
            total: 30,
            page: 2,
          ),
        );
      }),
    );
    final sessions = await repo.sessions('REAL-01', page: 2);
    expect(sessions.total, 30);
    expect(sessions.items.single.status, 'Legacy');
    final crabs = await repo.records(41, page: 2);
    expect(crabs.items.single.shellCondition, isNull);
    expect(crabs.items.single.recordedAt, isNull);
    expect(crabs.items.single.tagStatus, isNull);
  });

  test(
    'conflict remains a ProblemDetails error rather than fabricated success',
    () async {
      final server = HarvestServer()..failNextRecord = true;
      final repo = ApiHarvestRepository(server.dio());
      await expectLater(
        repo.record(
          const HarvestInput(
            harvestId: 41,
            requestId: 'r',
            slotCode: '0006',
            expectedCrabItemId: 123,
            weightG: 250,
            shellCondition: ShellCondition.hardShell,
          ),
        ),
        throwsA(
          isA<DioException>().having(
            (e) => e.response?.statusCode,
            'status',
            409,
          ),
        ),
      );
    },
  );
}

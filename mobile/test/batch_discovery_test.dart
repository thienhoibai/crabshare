import 'package:crabshare_mobile/features/investor/data/batch_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/investor_fixtures.dart';

void main() {
  test('open list asks for the open scope and maps capital, offers and price range', () async {
    final repo = ApiBatchRepository(discoveryDio((request) {
      expect(request.path, '/api/batches');
      expect(request.queryParameters, {'scope': 'open', 'pageSize': 100});
      return jsonResponse({
        'items': [
          exploreBatch(),
          exploreBatch(code: 'CS-T1', mode: 'T', status: 'Sourcing', preorderDeadline: '2099-12-20T00:00:00Z', offers: [
            exploreOffer(code: 'FAT-XL-G1', price: 520000),
            exploreOffer(price: 380000),
          ]),
        ],
        'page': 1, 'pageSize': 100, 'total': 2,
      });
    }));
    final batches = await repo.open();
    expect(batches, hasLength(2));
    final funding = batches.first;
    expect(funding.isFunding, isTrue);
    expect(funding.confirmedCapital, 30000000);
    expect(funding.remainingCapital, 30000000);
    expect(funding.fundingProgress, 0.5);
    expect(funding.priceRange, isNull);
    expect(funding.takesPreorders(), isFalse);
    final trade = batches.last;
    expect(trade.isFunding, isFalse);
    expect(trade.takesPreorders(), isTrue);
    expect(trade.priceRange, '380.000 đ – 520.000 đ / kg');
    expect(trade.offers.first.conversionWeightG, 330);
  });

  test('byCode returns the published batch with its cost groups', () async {
    final repo = ApiBatchRepository(discoveryDio((request) {
      expect(request.path, '/api/batches/CS%2042');
      return jsonResponse(exploreBatch(code: 'CS 42'));
    }));
    final batch = (await repo.byCode('CS 42'))!;
    expect(batch.code, 'CS 42');
    expect(batch.executorName, 'HTX Năm Căn');
    expect(batch.costByCategory.map((c) => c.category), ['Feed', 'Seed']);
    expect(batch.expectedReceiptDate, DateTime(2026, 10, 29));
  });

  test('byCode falls back to the published list when the API returns the farm draft', () async {
    final paths = <String>[];
    final repo = ApiBatchRepository(discoveryDio((request) {
      paths.add('${request.path}?${request.queryParameters['scope'] ?? ''}');
      if (request.path == '/api/batches/CS42') return jsonResponse({'batchCode': 'CS42', 'status': 'Funding', 'costPlan': {}});
      return jsonResponse({'items': [exploreBatch(code: 'OTHER'), exploreBatch()], 'page': 1, 'pageSize': 100, 'total': 2});
    }));
    expect((await repo.byCode('CS42'))!.title, 'Lô CS42 đã công bố');
    expect(paths, ['/api/batches/CS42?', '/api/batches?all']);
    expect(await repo.byCode('MISSING'), isNull);
  });

  test('progress hides participant numbers from outsiders and availability maps specs', () async {
    final repo = ApiBatchRepository(discoveryDio((request) {
      if (request.path == '/api/batches/CS42/progress') return jsonResponse(progressJson(participant: false));
      expect(request.path, '/api/batches/CS42/availability');
      return jsonResponse({
        'batchCode': 'CS42', 'acceptingPreorders': true, 'sellableCrabs': 300, 'committedCrabs': 30, 'remainingCrabs': 270,
        'specs': [{'specCode': 'FAT-L-G1', 'specName': 'Cua thịt size L Cấp 1', 'pricePerKg': 430000, 'conversionWeightG': 330, 'offeredQuantity': 75, 'committed': 10, 'remaining': 65}],
        'minOrderCrabs': 10, 'depositRatePct': 20.0, 'holdMinutes': 15,
      });
    }));
    final progress = await repo.progress('CS42');
    expect(progress.crabsAlive, 38);
    expect(progress.daysRaised, 12);
    expect(progress.isParticipant, isFalse);
    expect(progress.deadCrabs, isNull);
    final availability = await repo.availability('CS42');
    expect(availability.acceptingPreorders, isTrue);
    expect(availability.remainingCrabs, 270);
    expect(availability.depositRatePct, 20);
    expect(availability.specs.single.remaining, 65);
  });

  test('API failure propagates without a mock fallback', () async {
    final repo = ApiBatchRepository(discoveryDio((_) => jsonResponse({'detail': 'Không tìm thấy Lô đã công bố.'}, 404)));
    await expectLater(repo.open(), throwsA(isA<DioException>()));
    await expectLater(repo.byCode('hidden'), throwsA(isA<DioException>()));
  });
}

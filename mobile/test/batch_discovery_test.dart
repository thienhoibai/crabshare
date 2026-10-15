import 'helpers/discovery_fakes.dart';
import 'package:crabshare_mobile/features/investor/data/investor_repository.dart';
import 'package:crabshare_mobile/shared/models/batch_enums.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('list sends server filters and paging, maps authoritative percent', () async {
    final repo = ApiInvestorRepository(discoveryDio((request) {
      expect(request.path, '/api/batches');
      expect(request.queryParameters, {'status': 'Funding', 'crabType': 'RoeCrab', 'page': 2, 'pageSize': 20});
      return jsonResponse({'items': [discoveryBatch()], 'page': 2, 'pageSize': 20, 'total': 25});
    }));
    final page = await repo.batches(status: BatchStatus.funding, crabType: CrabType.roe, page: 2);
    expect(page.total, 25);
    expect(page.items.single.discoveryProgress!.percentLabel, '33,33%');
    expect(page.items.single.discoveryProgress!.pctOfTarget, 33.333333);
    expect(page.items.single.code, 'CS42');
  });
  test('detail maps published terms and locked cost version', () async {
    final repo = ApiInvestorRepository(discoveryDio((request) {
      expect(request.path, '/api/batches/CS42');
      return jsonResponse(discoveryBatch());
    }));
    final batch = await repo.batchByCode('CS42');
    expect(batch.minViableCapital, 200);
    expect(batch.maxCapital, 400);
    expect(batch.expectedOutputKg, 12.5);
    expect(batch.standardCost!.versionNo, 2);
    expect(batch.standardCost!.items.single.amount, 200);
  });
  test('zero and overfunding keep the backend label while only bar clamps', () {
    for (final (percent, label, bar) in [(0.0, '0,00%', 0.0), (150.12345, '150,12%', 1.0)]) {
      final data = discoveryBatch();
      data['targetCapital'] = 0;
      data['fundingProgress'] = {'confirmedCapital': 100, 'reservedCapital': 0,
        'investorCount': 1, 'pctOfTarget': percent, 'percentLabel': label};
      data['standardCost'] = null;
      final b = discoveryBatchFromJson(data);
      expect(b.discoveryProgress!.percentLabel, label);
      expect(b.discoveryProgress!.pctOfTarget, percent);
      expect(b.discoveryProgress!.barValue, bar);
      expect(b.standardCost, isNull);
    }
  });
  test('cancelled requests do not reach the server for list or detail', () async {
    var calls = 0;
    final repo = ApiInvestorRepository(discoveryDio((_) {
      calls++;
      return jsonResponse(discoveryBatch());
    }));
    final cancel = CancelToken()..cancel('Obsolete discovery request');
    await expectLater(repo.batches(cancelToken: cancel), throwsA(isA<DioException>().having((e) => e.type, 'type', DioExceptionType.cancel)));
    await expectLater(repo.batchByCode('CS42', cancelToken: cancel), throwsA(isA<DioException>().having((e) => e.type, 'type', DioExceptionType.cancel)));
    expect(calls, 0);
  });
  test('API failure and unavailable detail propagate without mock fallback', () async {
    final repo = ApiInvestorRepository(discoveryDio((_) => jsonResponse({'detail': 'Unavailable'}, 404)));
    await expectLater(repo.batches(), throwsA(isA<DioException>()));
    await expectLater(repo.batchByCode('hidden'), throwsA(isA<DioException>()));
  });
}

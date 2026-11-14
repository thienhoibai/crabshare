import 'package:flutter_test/flutter_test.dart';

import 'package:crabshare_mobile/features/trace/trace_repository.dart';

import '../../helpers/discovery_fakes.dart';
import '../../helpers/trace_fixtures.dart';

void main() {
  test('lookup requests the public order trace route and parses the response', () async {
    final paths = <String>[];
    final dio = discoveryDio((options) {
      paths.add('${options.method} ${options.uri.path}');
      return jsonResponse(orderTraceJson());
    });

    final trace = await ApiTraceRepository(dio).lookup('QR7K2M9XQ4TB');

    expect(paths, ['GET /api/trace/orders/QR7K2M9XQ4TB']);
    expect(trace.traceCode, 'QR7K2M9XQ4TB');
    expect(trace.batchCode, 'CS-2611-T1');
    expect(trace.batchTitle, 'Cua thịt thu mua Năm Căn');
    expect(trace.crabType, 'FatteningMudCrab');
    expect(trace.farmName, 'HTX Cua Năm Căn');
    expect(trace.sourceLots.first.originRegion, 'Năm Căn, Cà Mau');
    expect(trace.sourceLots.first.harvestedOn, DateTime(2026, 10, 20));
    expect(trace.sourceLots.last.originRegion, isNull);
    expect(trace.sourceLots.last.harvestedOn, isNull);
    expect(trace.lines.map((l) => l.crabs), [20, 10]);
    expect(trace.totalCrabs, 30);
    expect(trace.deliveries.single.toUtc(), DateTime.utc(2026, 11, 10, 5));
    expect(trace.standardNote, contains('T/SCFA 0014-2024'));
  });

  test('lookup accepts an order with nothing delivered yet', () async {
    final dio = discoveryDio((options) => jsonResponse({...orderTraceJson(), 'sourceLots': [], 'lines': [], 'deliveries': []}));

    final trace = await ApiTraceRepository(dio).lookup('QR7K2M9XQ4TB');

    expect(trace.sourceLots, isEmpty);
    expect(trace.lines, isEmpty);
    expect(trace.deliveries, isEmpty);
    expect(trace.totalCrabs, 0);
  });
}

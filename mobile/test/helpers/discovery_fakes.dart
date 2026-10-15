import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';

Map<String, dynamic> discoveryBatch() => {
  'batchCode': 'CS42', 'title': 'Lô đã công bố', 'operatorName': 'HTX',
  'crabType': 'RoeCrab', 'status': 'Funding', 'seedQuantity': 100,
  'expectedOutputKg': 12.5, 'cycleDays': 75, 'restockCutoffDays': 15,
  'minViableCapital': 200, 'targetCapital': 300, 'maxCapital': 400,
  'minContribution': 10, 'operatorSharePct': 20,
  'fundingOpenAt': '2026-10-01T00:00:00Z',
  'fundingDeadline': '2026-11-01T00:00:00Z',
  'fundingProgress': {'confirmedCapital': 100, 'reservedCapital': 5,
    'investorCount': 2, 'pctOfTarget': 33.333333, 'percentLabel': '33,33%'},
  'standardCost': {'versionNo': 2, 'status': 'Locked', 'total': 200,
    'lockedAt': '2026-09-30T00:00:00Z',
    'items': [{'category': 'Seed', 'amount': 200}]},
};

class DiscoveryAdapter implements HttpClientAdapter {
  DiscoveryAdapter(this.respond);
  final ResponseBody Function(RequestOptions) respond;
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? stream,
      Future<void>? cancelFuture) async => respond(options);
  @override
  void close({bool force = false}) {}
}
Dio discoveryDio(ResponseBody Function(RequestOptions) respond) =>
  Dio(BaseOptions(baseUrl: 'http://localhost'))
    ..httpClientAdapter = DiscoveryAdapter(respond);
ResponseBody jsonResponse(Object value, [int status = 200]) =>
  ResponseBody.fromString(jsonEncode(value), status,
    headers: {Headers.contentTypeHeader: ['application/json']});


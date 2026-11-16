import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';

/// Một Lô đã công bố theo dạng của GET /api/batches (BR v1.5). Mặc định: lô P đang gọi vốn, chưa có bảng giá.
Map<String, dynamic> exploreBatch({
  String code = 'CS42',
  String mode = 'P',
  String status = 'Funding',
  String crabType = 'RoeCrab',
  List<Map<String, dynamic>> offers = const [],
  String? preorderDeadline,
}) => {
  'batchCode': code, 'batchMode': mode, 'status': status, 'title': 'Lô $code đã công bố', 'crabType': crabType,
  'executorName': 'HTX Năm Căn', 'plannedQuantity': 250, 'fundedQuantity': null, 'hasHolding': true, 'holdingDays': 90,
  'saleDays': 14, 'expectedAvgWeightG': 420, 'expectedGrade': 'Cấp 1', 'expectedReceiptDate': '2026-10-29',
  'deliveryRadiusKm': 400.0, 'distanceKm': null, 'standardCostTotal': 42500000, 'standardCostPerCrab': null,
  'offers': offers, 'floorPricePerKg': 300000, 'offtakeBuyerName': 'Công ty Phương Nam', 'platformFeeRatePct': null,
  'settlementBasis': 'StandardCost',
  'targetCapital': mode == 'P' ? 60000000 : 0, 'confirmedCapital': mode == 'P' ? 30000000 : 0, 'reservedCapital': 0,
  'remainingCapital': mode == 'P' ? 30000000 : 0, 'investorCount': mode == 'P' ? 3 : 0, 'minContribution': 1000000,
  'sellableCrabs': 300, 'depositedPreorderCrabs': 30, 'preorderRatioPct': 10,
  'fundingOpenAt': '2026-11-08T09:00:00+07:00', 'fundingDeadline': mode == 'P' ? '2099-11-22T09:00:00+07:00' : null,
  'preorderDeadline': preorderDeadline,
  'costByCategory': [{'category': 'Feed', 'amount': 12500000}, {'category': 'Seed', 'amount': 30000000}],
};

Map<String, dynamic> exploreOffer({String code = 'FAT-L-G1', int price = 430000}) => {
  'specCode': code, 'specName': 'Cua thịt $code', 'sizeCode': 'L', 'gradeCode': 'G1',
  'pricePerKg': price, 'conversionWeightG': 330, 'offeredQuantity': 75,
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

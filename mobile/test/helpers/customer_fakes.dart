import 'dart:typed_data';

import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/api/json.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/core/capture/captured_photo.dart';
import 'package:crabshare_mobile/core/capture/photo_camera.dart';
import 'package:crabshare_mobile/features/customer/customer_routes.dart';
import 'package:crabshare_mobile/features/customer/data/claim_memory.dart';
import 'package:crabshare_mobile/features/customer/data/customer_models.dart';
import 'package:crabshare_mobile/features/customer/data/customer_providers.dart';
import 'package:crabshare_mobile/features/customer/data/customer_repository.dart';
import 'package:crabshare_mobile/features/customer/widgets/customer_parts.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Dữ liệu mẫu và bản giả cho test của khu khách hàng. Hình dạng JSON chép từ API thật (PreorderResponse, OrderDeliveriesResponse…).

const customerUserId = 71;

Map<String, dynamic> orderJson({String orderNo = 'OD1', String status = 'Confirmed', bool withDeposit = false, String? cancelReason}) => {
  'orderNo': orderNo,
  'batchCode': 'CS-2611-T1',
  'batchMode': 'T',
  'status': status,
  'estimatedValue': 4160000,
  'depositRatePct': 20.0,
  'depositAmount': 832000,
  'convertedCrabs': 30,
  'placedAt': '2026-11-12T05:00:00+00:00',
  'holdExpiresAt': '2099-01-01T05:00:00+00:00',
  'depositedAt': status == 'PendingDeposit' ? null : '2026-11-12T05:05:00+00:00',
  'confirmedAt': null,
  'deliveryAddress': '12 Nguyễn Huệ, TP. Hồ Chí Minh',
  'deliveryDistanceKm': 288.1,
  'lines': [
    {
      'lineId': 1,
      'specCode': 'FAT-M-G1',
      'specName': 'Cua thịt size M Cấp 1',
      'mode': 'ByCount',
      'qtyCrabs': 20,
      'qtyKg': null,
      'convertedCrabs': 20,
      'pricePerKg': 380000,
      'conversionWeightG': 260,
      'minGrade': null,
      'estimatedKg': 5.2,
      'estimatedValue': 1976000,
    },
    {
      'lineId': 2,
      'specCode': 'FAT-XL-SPECIAL',
      'specName': 'Cua thịt size XL Đặc cấp',
      'mode': 'ByKg',
      'qtyCrabs': null,
      'qtyKg': 4.2,
      'convertedCrabs': 10,
      'pricePerKg': 520000,
      'conversionWeightG': 420,
      'minGrade': null,
      'estimatedKg': 4.2,
      'estimatedValue': 2184000,
    },
  ],
  'tranches': [
    {
      'trancheId': 1,
      'seq': 1,
      'dueDate': '2026-12-20',
      'status': 'Planned',
      'lines': [
        {'specCode': 'FAT-M-G1', 'qtyCrabs': 20, 'qtyKg': null, 'convertedCrabs': 20},
        {'specCode': 'FAT-XL-SPECIAL', 'qtyCrabs': null, 'qtyKg': 4.2, 'convertedCrabs': 10},
      ],
    },
  ],
  'deposit': withDeposit
      ? {
          'paymentRequestId': 9,
          'referenceCode': 'CSDEP9',
          'amount': 832000,
          'qrContent': '000201',
          'expiresAt': '2099-01-01T05:00:00+00:00',
          'batchAccountNo': '9704000011',
          'status': 'Pending',
        }
      : null,
  'cancelReason': cancelReason,
};

/// [stage]: accept (chờ khách xác nhận), pay (chờ trả phần còn lại), transit, scheduled, done.
Map<String, dynamic> shipmentJson({String shipmentNo = 'SH1', String orderNo = 'OD1', String stage = 'accept', int trancheSeq = 1}) {
  final weighed = stage != 'scheduled';
  final received = stage == 'accept' || stage == 'pay' || stage == 'done';
  final confirmed = stage == 'pay' || stage == 'done';
  return {
    'shipmentNo': shipmentNo,
    'orderNo': orderNo,
    'trancheSeq': trancheSeq,
    'status': switch (stage) {
      'scheduled' => 'Scheduled',
      'transit' || 'accept' => 'Dispatched',
      _ => 'Accepted',
    },
    'scheduledAt': '2026-12-20T02:00:00+00:00',
    'dispatchedAt': weighed ? '2026-12-20T03:00:00+00:00' : null,
    'deliveredAt': confirmed ? '2026-12-20T06:00:00+00:00' : null,
    'returnWindowEndsAt': confirmed ? '2099-01-01T00:00:00+00:00' : null,
    'transportCondition': null,
    'lines': [
      {
        'lineId': 1,
        'specCode': 'FAT-M-G1',
        'pricePerKg': 380000,
        'dispatchedCrabs': weighed ? 20 : null,
        'dispatchedKg': weighed ? 5.3 : null,
        'receivedCrabs': received ? 20 : null,
        'receivedKg': received ? 5.2 : null,
        'acceptedCrabs': received ? 19 : null,
        'acceptedKg': received ? 5.0 : null,
        'rejectedCrabs': received ? 1 : null,
        'transportLossKg': received ? 0.1 : null,
        'goodsValue': received ? 1900000 : null,
      },
    ],
    'acceptance': received
        ? {
            'status': confirmed ? 'Confirmed' : 'Pending',
            'acceptedCrabs': 19,
            'acceptedKg': 5.0,
            'rejectedCrabs': 1,
            'discrepancyReason': 'Một con yếu',
            'operatorRecordedAt': '2026-12-20T05:30:00+00:00',
            'customerConfirmedAt': confirmed ? '2026-12-20T06:00:00+00:00' : null,
            'goodsValue': confirmed ? 1900000 : null,
            'depositApplied': confirmed ? 832000 : null,
            'balanceDue': confirmed ? 1068000 : null,
            'balanceDueAt': confirmed ? '2099-01-01T06:00:00+00:00' : null,
            'balancePaidAt': stage == 'done' ? '2026-12-20T07:00:00+00:00' : null,
          }
        : null,
    'balance': stage == 'pay'
        ? {
            'paymentRequestId': 12,
            'referenceCode': 'CSBAL12',
            'amount': 1068000,
            'qrContent': '000201',
            'expiresAt': '2099-01-01T06:00:00+00:00',
            'accountNo': '9704000011',
            'status': 'Pending',
          }
        : null,
    'traceCode': 'QR7K2M9XQ4TB',
  };
}

Map<String, dynamic> deliveriesJson({String orderNo = 'OD1', List<Map<String, dynamic>> shipments = const [], bool withInvoice = false}) => {
  'orderNo': orderNo,
  'status': 'Delivering',
  'depositAmount': 832000,
  'depositApplied': 0,
  'traceCode': shipments.isEmpty ? null : 'QR7K2M9XQ4TB',
  'shipments': shipments,
  'invoices': withInvoice
      ? [
          {
            'invoiceNo': 'HD0001',
            'trancheSeq': 1,
            'amount': 1900000,
            'sellerName': 'CrabShare',
            'buyerName': 'Nhà hàng Biển',
            'status': 'Active',
            'issuedAt': '2026-12-20T06:00:00+00:00',
          },
        ]
      : [],
  'returnWindowEndsAt': null,
};

Map<String, dynamic> claimJson({String claimNo = 'KN1', String orderNo = 'OD1', String status = 'Open', String? operatorResponse}) => {
  'claimNo': claimNo,
  'orderNo': orderNo,
  'shipmentNo': 'SH1',
  'specCode': 'FAT-M-G1',
  'claimType': 'Complaint',
  'issueType': 'Dead',
  'affectedCrabs': 2,
  'affectedKg': null,
  'description': 'Hai con chết khi mở thùng',
  'status': status,
  'responseDueAt': '2099-01-03T06:00:00+00:00',
  'operatorResponse': operatorResponse,
  'operatorRespondedAt': operatorResponse == null ? null : '2026-12-21T06:00:00+00:00',
  'customerAgreed': null,
  'adminDecision': null,
  'decidedAt': null,
  'refundKg': status == 'Accepted' ? 0.526 : null,
  'refundAmount': status == 'Accepted' ? 200000 : null,
  'createdAt': '2026-12-20T08:00:00+00:00',
};

Map<String, dynamic> openBatchJson({String code = 'CS-2611-T1', bool withOffers = true, String? preorderDeadline = '2099-12-02T12:00:00+00:00'}) => {
  'batchCode': code,
  'batchMode': 'T',
  'status': 'Sourcing',
  'title': 'Cua thịt thu mua Năm Căn',
  'crabType': 'FatteningMudCrab',
  'executorName': 'CrabShare',
  'offers': withOffers
      ? [
          {'specCode': 'FAT-M-G1', 'specName': 'Cua thịt size M Cấp 1', 'sizeCode': 'M', 'gradeCode': 'G1', 'pricePerKg': 380000},
          {'specCode': 'FAT-XL-SPECIAL', 'specName': 'Cua thịt size XL Đặc cấp', 'sizeCode': 'XL', 'gradeCode': 'SPECIAL', 'pricePerKg': 520000},
        ]
      : [],
  'sellableCrabs': 300,
  'depositedPreorderCrabs': 30,
  'preorderDeadline': preorderDeadline,
};

/// Ảnh PNG 1×1 hợp lệ, để ô xem trước ảnh giải mã được trong test.
final _onePixelPng = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, //
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, //
  0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, //
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, //
  0x42, 0x60, 0x82,
]);

CapturedPhoto fakePhoto() => CapturedPhoto(
  bytes: _onePixelPng,
  capturedAt: DateTime.utc(2026, 12, 20, 8),
  latitude: 10.77,
  longitude: 106.7,
);

/// Dio giả cho ảnh cần đăng nhập (AuthImage): trả thân rỗng nên ô ảnh hiện biểu tượng thay thế, không gọi mạng thật.
class _EmptyAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async =>
      ResponseBody.fromBytes(const [], 200);
  @override
  void close({bool force = false}) {}
}

class FakeCamera implements PhotoCamera {
  @override
  Future<CapturedPhoto?> capture() async => fakePhoto();
  @override
  Future<void> openSettings() async {}
}

class MemoryClaimMemory implements ClaimMemory {
  final claimNos = <String, List<String>>{};
  final ratings = <String, int>{};
  @override
  Future<List<String>> claims(int userId, String orderNo) async => claimNos['$userId/$orderNo'] ?? const [];
  @override
  Future<void> rememberClaim(int userId, String orderNo, String claimNo) async =>
      claimNos['$userId/$orderNo'] = {...?claimNos['$userId/$orderNo'], claimNo}.toList();
  @override
  Future<int?> rating(int userId, String orderNo) async => ratings['$userId/$orderNo'];
  @override
  Future<void> rememberRating(int userId, String orderNo, int stars) async => ratings['$userId/$orderNo'] = stars;
}

/// Kho giả: trả dữ liệu đã nạp sẵn và ghi lại các lệnh gọi làm thay đổi dữ liệu.
class FakeCustomerRepository implements CustomerRepository {
  var orderList = <Map<String, dynamic>>[];
  final deliveriesByOrder = <String, Map<String, dynamic>>{};
  final claimsByNo = <String, Map<String, dynamic>>{};
  var batches = <Map<String, dynamic>>[];
  final calls = <String>[];
  ClaimDraft? lastDraft;
  Object? failWith;

  void _check() {
    final error = failWith;
    if (error != null) throw error;
  }

  @override
  Future<Paged<Preorder>> orders({int page = 1}) async =>
      Paged(items: [for (final o in orderList) Preorder.fromJson(o)], total: orderList.length);

  @override
  Future<Preorder> order(String orderNo) async => Preorder.fromJson(orderList.firstWhere((o) => o['orderNo'] == orderNo));

  @override
  Future<OrderDeliveries> deliveries(String orderNo) async =>
      OrderDeliveries.fromJson(deliveriesByOrder[orderNo] ?? deliveriesJson(orderNo: orderNo));

  @override
  Future<Preorder> cancelOrder(String orderNo, {String? reason}) async {
    _check();
    calls.add('cancel $orderNo ${reason ?? ''}'.trim());
    final index = orderList.indexWhere((o) => o['orderNo'] == orderNo);
    orderList[index] = {...orderList[index], 'status': 'Cancelled', 'deposit': null};
    return Preorder.fromJson(orderList[index]);
  }

  @override
  Future<Shipment> confirmAcceptance(String shipmentNo) async {
    _check();
    calls.add('confirm $shipmentNo');
    return _replaceShipment(shipmentNo, 'pay');
  }

  @override
  Future<Shipment> refuseDelivery(String shipmentNo, String reason) async {
    _check();
    calls.add('refuse $shipmentNo $reason');
    return Shipment.fromJson(_findShipment(shipmentNo));
  }

  Map<String, dynamic> _findShipment(String shipmentNo) => [
    for (final d in deliveriesByOrder.values) ...(d['shipments'] as List).cast<Map<String, dynamic>>(),
  ].firstWhere((s) => s['shipmentNo'] == shipmentNo);

  Shipment _replaceShipment(String shipmentNo, String stage) {
    final old = _findShipment(shipmentNo);
    final orderNo = old['orderNo'] as String;
    final next = shipmentJson(shipmentNo: shipmentNo, orderNo: orderNo, stage: stage, trancheSeq: old['trancheSeq'] as int);
    final d = deliveriesByOrder[orderNo]!;
    deliveriesByOrder[orderNo] = {
      ...d,
      'shipments': [
        for (final s in (d['shipments'] as List).cast<Map<String, dynamic>>()) s['shipmentNo'] == shipmentNo ? next : s,
      ],
    };
    return Shipment.fromJson(next);
  }

  @override
  Future<Claim> createClaim(String orderNo, ClaimDraft draft) async {
    _check();
    calls.add('claim $orderNo');
    lastDraft = draft;
    claimsByNo['KN9'] = claimJson(claimNo: 'KN9', orderNo: orderNo);
    return Claim.fromJson(claimsByNo['KN9']!);
  }

  @override
  Future<Claim> claim(String claimNo) async {
    final json = claimsByNo[claimNo];
    if (json == null) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(requestOptions: RequestOptions(), statusCode: 404, data: {'detail': 'Không tìm thấy khiếu nại.'}),
      );
    }
    return Claim.fromJson(json);
  }

  @override
  Future<Claim> replyClaim(String claimNo, {required bool agree}) async {
    _check();
    calls.add('reply $claimNo $agree');
    claimsByNo[claimNo] = {...claimsByNo[claimNo]!, 'status': agree ? 'Accepted' : 'Escalated', 'refundAmount': agree ? 200000 : null, 'refundKg': agree ? 0.526 : null};
    return Claim.fromJson(claimsByNo[claimNo]!);
  }

  @override
  Future<OrderRating> rate(String orderNo, {required int stars, String? comment}) async {
    _check();
    calls.add('rate $orderNo $stars ${comment ?? ''}'.trim());
    return OrderRating(orderNo: orderNo, stars: stars, comment: comment);
  }

  @override
  Future<List<OpenBatch>> openBatches() async => [for (final b in batches) OpenBatch.fromJson(b)];
}

SessionState customerSession() => const SessionState(
  token: 'test',
  user: AppUser(userId: customerUserId, email: 'customer@crabshare.local', fullName: 'Nhà hàng Biển', roles: [Roles.customer]),
);

/// Ứng dụng thu nhỏ có đủ route của khu khách hàng; các màn của khu khác được thay bằng màn giữ chỗ ghi lại đường dẫn.
class CustomerHarness {
  CustomerHarness({FakeCustomerRepository? repository, MemoryClaimMemory? memory})
    : repository = repository ?? FakeCustomerRepository(),
      memory = memory ?? MemoryClaimMemory();

  final FakeCustomerRepository repository;
  final MemoryClaimMemory memory;
  final launched = <Uri>[];

  Widget app(String initialLocation) {
    final router = GoRouter(
      initialLocation: initialLocation,
      routes: [
        ...customerRoutes(),
        GoRoute(path: '/batches/:code', builder: (context, state) => _Stub('Trang Lô ${state.pathParameters['code']}')),
        GoRoute(path: Routes.scan, builder: (context, state) => const _Stub('Trang quét QR')),
        GoRoute(path: '/trace/:code', builder: (context, state) => _Stub('Trang truy xuất ${state.pathParameters['code']}')),
      ],
    );
    return ProviderScope(
      overrides: [
        sessionProvider.overrideWith(() => SessionController(customerSession())),
        dioProvider.overrideWithValue(Dio(BaseOptions(baseUrl: 'http://localhost'))..httpClientAdapter = _EmptyAdapter()),
        customerRepositoryProvider.overrideWithValue(repository),
        claimMemoryProvider.overrideWithValue(memory),
        photoCameraProvider.overrideWithValue(FakeCamera()),
        webLauncherProvider.overrideWithValue((uri) async {
          launched.add(uri);
          return true;
        }),
      ],
      child: MaterialApp.router(theme: buildAppTheme(), routerConfig: router),
    );
  }
}

class _Stub extends StatelessWidget {
  const _Stub(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(label)));
}

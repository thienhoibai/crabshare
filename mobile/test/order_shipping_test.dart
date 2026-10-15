import 'dart:convert';
import 'dart:typed_data';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/features/operator/data/operator_orders_repository.dart';
import 'package:crabshare_mobile/features/operator/data/packing_models.dart';
import 'package:crabshare_mobile/features/operator/packing/pack_order_page.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

Map<String, dynamic> _detail(String status, {Map<String, dynamic>? shipment}) =>
    {
      'orderNo': 'ODSHIP0000001',
      'status': status,
      'placedAt': '2026-10-14T02:00:00Z',
      'paidAt': '2026-10-14T02:05:00Z',
      'batchCode': 'TEST-02',
      'customerName': 'Võ Khách Hàng',
      'recipientName': 'Võ Khách Hàng',
      'recipientPhone': '0900000000',
      'shippingAddress': '12 Lý Thường Kiệt, Cà Mau',
      'totalAmount': 1040000,
      'totalKg': 1,
      'lines': [
        {
          'orderLineId': 1,
          'listingId': 3,
          'title': 'Cua gạch son',
          'batchCode': 'TEST-02',
          'gradeCode': 'L1',
          'gradeName': 'Loại 1',
          'quantityKg': 1,
          'assignedKg': 1,
          'assignedCount': 2,
          'tags': [],
        },
      ],
      'shipment': shipment,
    };

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (requestStream != null) await requestStream.drain<void>();
    final body =
        options.method == 'GET' && options.path == '/api/operators/me/orders'
        ? <Object>[]
        : _detail(
            options.path.endsWith('/deliver') ? 'Delivered' : 'Shipping',
            shipment: {
              'carrierName': 'Nhà xe Phương Trang',
              'driverPhone': '0901234567',
              'shippedAt': '2026-10-15T07:00:00Z',
            },
          );
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Repo giả có đơn Packed, đếm số lần gọi ship/deliver.
class _PackedRepo extends MockOperatorOrdersRepository {
  int shipCalls = 0;
  int deliverCalls = 0;
  bool started = false;

  @override
  Future<OperatorOrderDetail> detail(String orderNo) async {
    if (!started) {
      started = true;
      await pack(orderNo, ['CSAB23CD45EF', 'CSAB23CD45EG']);
    }
    return super.detail(orderNo);
  }

  @override
  Future<OperatorOrderDetail> ship(String orderNo, ShipOrderInput input) {
    shipCalls++;
    return super.ship(orderNo, input);
  }

  @override
  Future<OperatorOrderDetail> deliver(String orderNo) {
    deliverCalls++;
    return super.deliver(orderNo);
  }
}

Future<void> _pumpPage(
  WidgetTester tester,
  OperatorOrdersRepository repo,
) async {
  tester.view.physicalSize = const Size(360, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [operatorOrdersRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const PackOrderPage(orderNo: 'ODPACKDEMO01'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  test('API repository calls the real order endpoints', () async {
    final adapter = _Adapter();
    final repo = ApiOperatorOrdersRepository(
      Dio()..httpClientAdapter = adapter,
    );
    await repo.list('Shipping');
    final shipped = await repo.ship(
      'ODSHIP0000001',
      const ShipOrderInput(
        carrierName: 'Nhà xe Phương Trang',
        driverPhone: '0901234567',
        vehiclePlate: '69B-123.45',
      ),
    );
    final delivered = await repo.deliver('ODSHIP0000001');
    expect(adapter.requests.map((r) => '${r.method} ${r.path}'), [
      'GET /api/operators/me/orders',
      'POST /api/orders/ODSHIP0000001/ship',
      'POST /api/orders/ODSHIP0000001/deliver',
    ]);
    expect(adapter.requests.first.queryParameters, {'status': 'Shipping'});
    expect(adapter.requests[1].data, {
      'carrierName': 'Nhà xe Phương Trang',
      'driverPhone': '0901234567',
      'vehiclePlate': '69B-123.45',
    });
    expect(shipped.shipment?.carrierName, 'Nhà xe Phương Trang');
    expect(delivered.status, 'Delivered');
  });

  test(
    'detail without shipment and demo shipment without carrier both parse',
    () {
      expect(OperatorOrderDetail.fromJson(_detail('Packed')).shipment, isNull);
      final demo = OperatorOrderDetail.fromJson(
        _detail(
          'Completed',
          shipment: {
            'carrierName': null,
            'vehiclePlate': null,
            'driverPhone': null,
            'expectedArrivalAt': null,
            'note': null,
            'shippedAt': '2026-09-01T07:00:00Z',
            'deliveredAt': '2026-09-02T07:00:00Z',
            'receivedAt': null,
            'returnWindowEndsAt': '2026-09-05T07:00:00Z',
            'completedAt': '2026-09-05T08:00:00Z',
          },
        ),
      );
      expect(demo.shipment?.carrierName, isNull);
      expect(demo.shipment?.completedAt, isNotNull);
    },
  );

  testWidgets(
    'packed order is shipped through the sheet then marked delivered',
    (tester) async {
      final repo = _PackedRepo();
      await _pumpPage(tester, repo);
      await tester.ensureVisible(find.text('Giao cho nhà xe'));
      await tester.tap(find.text('Giao cho nhà xe'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Tên nhà xe'),
        'Nhà xe Phương Trang',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Số điện thoại tài xế'),
        '0901234567',
      );
      await tester.tap(find.text('4 giờ'));
      await tester.tap(find.text('Lưu và giao'));
      await tester.pumpAndSettle();
      expect(repo.shipCalls, 1);
      expect(find.text('Tài xế: 0901234567'), findsOneWidget);
      ScaffoldMessenger.of(tester.element(find.byType(PackOrderPage))).clearSnackBars();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Đã giao tới khách'));
      await tester.tap(find.text('Đã giao tới khách'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Đã giao'));
      await tester.pumpAndSettle();
      expect(repo.deliverCalls, 1);
      expect(find.textContaining('Hạn đổi trả'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'invalid driver phone keeps the sheet open and does not call the API',
    (tester) async {
      final repo = _PackedRepo();
      await _pumpPage(tester, repo);
      await tester.ensureVisible(find.text('Giao cho nhà xe'));
      await tester.tap(find.text('Giao cho nhà xe'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Tên nhà xe'),
        'Xe A',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Số điện thoại tài xế'),
        '12345',
      );
      await tester.tap(find.text('Lưu và giao'));
      await tester.pumpAndSettle();
      expect(
        find.text('Cần 10 chữ số bắt đầu bằng 0, hoặc dạng +84.'),
        findsOneWidget,
      );
      expect(repo.shipCalls, 0);
      expect(tester.takeException(), isNull);
    },
  );
}

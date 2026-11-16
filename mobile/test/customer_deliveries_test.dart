import 'package:crabshare_mobile/app/routes.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/customer_fakes.dart';

void _tallPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 4500);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
}

void main() {
  testWidgets('deliveries tab groups shipments across orders and opens the order of a shipment', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [
      orderJson(orderNo: 'OD1', status: 'Delivering'),
      orderJson(orderNo: 'OD2', status: 'Confirmed'),
      orderJson(orderNo: 'OD3', status: 'Deposited'),
    ];
    h.repository.deliveriesByOrder['OD1'] = deliveriesJson(
      orderNo: 'OD1',
      shipments: [
        shipmentJson(shipmentNo: 'S1', orderNo: 'OD1', stage: 'done'),
        shipmentJson(shipmentNo: 'S2', orderNo: 'OD1', stage: 'accept', trancheSeq: 2),
      ],
    );
    h.repository.deliveriesByOrder['OD2'] = deliveriesJson(
      orderNo: 'OD2',
      shipments: [
        shipmentJson(shipmentNo: 'S3', orderNo: 'OD2', stage: 'transit'),
        shipmentJson(shipmentNo: 'S4', orderNo: 'OD2', stage: 'scheduled', trancheSeq: 2),
      ],
    );

    await tester.pumpWidget(h.app(Routes.customerDeliveries));
    await tester.pumpAndSettle();

    expect(find.text('Giao hàng'), findsOneWidget);
    expect(find.text('Chờ bạn xử lý'), findsOneWidget);
    expect(find.text('Chờ bạn nghiệm thu'), findsOneWidget);
    expect(find.text('Đợt 2 · đơn OD1 · 19 con · 5 kg'), findsOneWidget);
    expect(find.text('Đang giao'), findsOneWidget);
    expect(find.text('Hàng đang trên đường'), findsOneWidget);
    expect(find.text('Đã lên lịch giao'), findsOneWidget);
    // Chuyến đã nghiệm thu gấp lại; đơn mới cọc chưa có chuyến nào nên không hỏi máy chủ.
    expect(find.text('Đã nghiệm thu'), findsNothing);
    expect(find.text('Đã nghiệm thu (1)'), findsOneWidget);
    expect(find.textContaining('OD3'), findsNothing);

    await tester.tap(find.text('Chờ bạn nghiệm thu'));
    await tester.pumpAndSettle();
    expect(find.text('Đơn OD1'), findsOneWidget);
    expect(find.text('Nghiệm thu đợt 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('no shipments yet: one empty state with the way back to my orders', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [orderJson(status: 'Deposited')];

    await tester.pumpWidget(h.app(Routes.customerDeliveries));
    await tester.pumpAndSettle();

    expect(find.text('Chưa có chuyến giao nào đang chờ bạn'), findsOneWidget);
    await tester.tap(find.text('Xem đơn của tôi'));
    await tester.pumpAndSettle();
    expect(find.text('Đơn của tôi'), findsOneWidget);
    expect(find.text('OD1'), findsOneWidget);
  });

  testWidgets('Lô tab lists only batches taking pre-orders and opens the batch screen', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.batches = [
      openBatchJson(),
      {...openBatchJson(code: 'CS-FUND', withOffers: false), 'title': 'Lô chỉ gọi vốn'},
    ];

    await tester.pumpWidget(h.app(Routes.customerBatches));
    await tester.pumpAndSettle();

    expect(find.text('Lô nhận đặt trước'), findsOneWidget);
    expect(find.text('Cua thịt thu mua Năm Căn'), findsOneWidget);
    expect(find.text('CS-2611-T1 · Cua thịt vỗ béo'), findsOneWidget);
    expect(find.text('380.000 đ – 520.000 đ / kg'), findsOneWidget);
    expect(find.text('Còn khoảng 270 con'), findsOneWidget);
    expect(find.text('Đặt tới 02/12'), findsOneWidget);
    expect(find.text('Lô chỉ gọi vốn'), findsNothing);

    await tester.tap(find.text('Cua thịt thu mua Năm Căn'));
    await tester.pumpAndSettle();
    expect(find.text('Trang Lô CS-2611-T1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shell has four tabs and the centre button opens the order QR scanner', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [orderJson(status: 'Delivering')];
    h.repository.deliveriesByOrder['OD1'] = deliveriesJson(shipments: [shipmentJson()]);

    await tester.pumpWidget(h.app(Routes.customerOrders));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Đơn'), findsOneWidget);
    expect(find.bySemanticsLabel('Lô'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('^Giao hàng, 1 ')), findsOneWidget);
    expect(find.bySemanticsLabel('Tài khoản'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Lô'));
    await tester.pumpAndSettle();
    expect(find.text('Chưa có Lô nào nhận đặt trước'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Quét QR đơn'));
    await tester.pumpAndSettle();
    expect(find.text('Trang quét QR'), findsOneWidget);
  });
}

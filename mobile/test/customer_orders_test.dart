import 'package:crabshare_mobile/app/routes.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/customer_fakes.dart';

/// Màn hình điện thoại cao để mọi mục của danh sách đều được dựng.
void _tallPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 4500);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
}

void main() {
  testWidgets('orders tab leads with what needs me, then my orders; finished orders stay folded', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [
      orderJson(orderNo: 'OD1', status: 'PendingDeposit', withDeposit: true),
      orderJson(orderNo: 'OD2', status: 'Delivering'),
      orderJson(orderNo: 'OD3', status: 'Cancelled'),
    ];
    h.repository.deliveriesByOrder['OD2'] = deliveriesJson(
      orderNo: 'OD2',
      shipments: [
        shipmentJson(shipmentNo: 'S1', orderNo: 'OD2', stage: 'accept'),
        shipmentJson(shipmentNo: 'S2', orderNo: 'OD2', stage: 'pay', trancheSeq: 2),
      ],
    );

    await tester.pumpWidget(h.app(Routes.customerOrders));
    await tester.pumpAndSettle();

    expect(find.text('Đơn của tôi'), findsOneWidget);
    expect(find.text('Cần làm'), findsOneWidget);
    expect(find.text('Đặt cọc 832.000 đ'), findsOneWidget);
    expect(find.text('Nghiệm thu đợt 1'), findsOneWidget);
    expect(find.text('Đơn OD2 · 19 con · 5 kg'), findsOneWidget);
    expect(find.text('Còn phải trả 1.068.000 đ'), findsOneWidget);

    expect(find.text('OD1'), findsOneWidget);
    expect(find.text('Chờ đặt cọc'), findsOneWidget);
    expect(find.text('Chưa cọc'), findsOneWidget);
    expect(find.text('OD2'), findsOneWidget);
    expect(find.text('Đang giao theo đợt'), findsOneWidget);
    expect(find.text('Đang giữ cọc'), findsOneWidget);
    expect(find.textContaining('Lô CS-2611-T1 · 30 con'), findsNWidgets(2));

    expect(find.text('OD3'), findsNothing);
    await tester.tap(find.text('Đơn đã xong (1)'));
    await tester.pumpAndSettle();
    expect(find.text('OD3'), findsOneWidget);

    await tester.tap(find.text('Nghiệm thu đợt 1'));
    await tester.pumpAndSettle();
    expect(find.text('Đơn OD2'), findsOneWidget);
    expect(find.text('Xác nhận nghiệm thu'), findsOneWidget);
    // Hàng ở cửa đứng trước và giữ nút chính; khoản còn phải trả của đợt khác đứng sau với nút viền.
    expect(find.text('Trả phần còn lại đợt 2'), findsOneWidget);
    final payButton = find.text('Thanh toán trên web');
    expect(find.ancestor(of: payButton, matching: find.byWidgetPredicate((w) => w is OutlinedButton)), findsOneWidget);
    expect(find.ancestor(of: payButton, matching: find.byWidgetPredicate((w) => w is FilledButton)), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('no orders: one empty state that points to the Lô tab', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.batches = [openBatchJson()];

    await tester.pumpWidget(h.app(Routes.customerOrders));
    await tester.pumpAndSettle();

    expect(find.text('Bạn chưa có đơn đặt trước nào'), findsOneWidget);
    expect(find.text('Cần làm'), findsNothing);
    await tester.tap(find.text('Xem Lô đang nhận đặt trước'));
    await tester.pumpAndSettle();
    expect(find.text('Lô nhận đặt trước'), findsOneWidget);
    expect(find.text('Cua thịt thu mua Năm Căn'), findsOneWidget);
  });

  testWidgets('order waiting for the deposit: amount, transfer reference, pay on the web', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [orderJson(status: 'PendingDeposit', withDeposit: true)];

    await tester.pumpWidget(h.app(Routes.customerOrder('OD1')));
    await tester.pumpAndSettle();

    expect(find.text('Đơn OD1'), findsOneWidget);
    expect(find.text('Chờ đặt cọc'), findsOneWidget);
    expect(find.text('Đặt cọc để giữ đơn'), findsOneWidget);
    expect(find.text('832.000 đ'), findsNWidgets(2));
    expect(find.text('CSDEP9'), findsOneWidget);
    expect(find.textContaining('Hạn 01/01'), findsOneWidget);

    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await tester.tap(find.byTooltip('Sao chép'));
    await tester.pumpAndSettle();
    expect(copied, 'CSDEP9');
    expect(find.text('Đã sao chép nội dung chuyển khoản'), findsOneWidget);

    await tester.tap(find.text('Thanh toán trên web'));
    await tester.pumpAndSettle();
    expect(h.launched.single.toString(), 'http://localhost:5173/khach/don/OD1');

    // Bốn con số, quy cách theo đúng đơn vị đã đặt, đợt giao và trạng thái.
    expect(find.text('30 con'), findsOneWidget);
    expect(find.text('4.160.000 đ'), findsOneWidget);
    expect(find.text('1 đợt'), findsOneWidget);
    expect(find.text('Cua thịt size M Cấp 1'), findsOneWidget);
    expect(find.text('20 con'), findsOneWidget);
    expect(find.text('4,2 kg'), findsOneWidget);
    expect(find.text('Đợt 1 · 20/12/2026'), findsOneWidget);
    expect(find.text('Đã lên lịch'), findsOneWidget);
    // Chi tiết phụ và nút huỷ đơn chỉ hiện sau khi mở "Xem thêm".
    expect(find.text('Huỷ đơn'), findsNothing);
    expect(find.text('Đánh giá đơn'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('delivery waiting for me: weighing result, confirm states the money, then the balance to pay', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [orderJson(status: 'Delivering')];
    h.repository.deliveriesByOrder['OD1'] = deliveriesJson(shipments: [shipmentJson(shipmentNo: 'S1')]);

    await tester.pumpWidget(h.app(Routes.customerOrder('OD1')));
    await tester.pumpAndSettle();

    expect(find.text('Nghiệm thu đợt 1'), findsOneWidget);
    expect(find.text('19 con · 5 kg'), findsOneWidget);
    expect(find.text('1 con'), findsOneWidget);
    expect(find.text('1.900.000 đ'), findsOneWidget);
    expect(find.text('Một con yếu'), findsOneWidget);
    expect(find.text('Chờ bạn xác nhận nghiệm thu'), findsOneWidget);

    await tester.tap(find.text('Số liệu cân'));
    await tester.pumpAndSettle();
    expect(find.text('20 con · 5,3 kg'), findsOneWidget);
    expect(find.text('20 con · 5,2 kg'), findsOneWidget);

    await tester.tap(find.text('Xác nhận nghiệm thu'));
    await tester.pumpAndSettle();
    expect(find.text('Xác nhận nghiệm thu đợt 1'), findsOneWidget);
    expect(find.text('Tiền hàng 1.900.000 đ. Trừ tiền cọc 832.000 đ, còn phải trả 1.068.000 đ.'), findsOneWidget);
    expect(h.repository.calls, isEmpty);

    await tester.tap(find.text('Xác nhận nghiệm thu').last);
    await tester.pumpAndSettle();
    expect(h.repository.calls, ['confirm S1']);
    expect(find.text('Đã xác nhận nghiệm thu.'), findsOneWidget);
    expect(find.text('Nghiệm thu đợt 1'), findsNothing);
    expect(find.text('Trả phần còn lại đợt 1'), findsOneWidget);
    expect(find.text('1.068.000 đ'), findsOneWidget);
    expect(find.text('CSBAL12'), findsOneWidget);
    expect(find.text('Đã nghiệm thu 19 con · 5 kg'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('refusing a delivery states the forfeited deposit and needs a reason', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [orderJson(status: 'Delivering')];
    h.repository.deliveriesByOrder['OD1'] = deliveriesJson(shipments: [shipmentJson(shipmentNo: 'S1')]);

    await tester.pumpWidget(h.app(Routes.customerOrder('OD1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Từ chối nhận'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Bạn mất tiền cọc chưa dùng (832.000 đ)'), findsOneWidget);
    await tester.tap(find.text('Từ chối và chịu mất cọc'));
    await tester.pumpAndSettle();
    expect(h.repository.calls, isEmpty);

    await tester.enterText(find.byType(TextField), 'Cua chết nhiều');
    await tester.pump();
    await tester.tap(find.text('Từ chối và chịu mất cọc'));
    await tester.pumpAndSettle();
    expect(h.repository.calls, ['refuse S1 Cua chết nhiều']);
    expect(find.text('Đã ghi nhận từ chối nhận hàng.'), findsOneWidget);
  });

  testWidgets('API error on confirm is shown and the delivery stays waiting', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [orderJson(status: 'Delivering')];
    h.repository.deliveriesByOrder['OD1'] = deliveriesJson(shipments: [shipmentJson(shipmentNo: 'S1')]);
    h.repository.failWith = const FormatException('boom');

    await tester.pumpWidget(h.app(Routes.customerOrder('OD1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Xác nhận nghiệm thu'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Xác nhận nghiệm thu').last);
    await tester.pumpAndSettle();

    expect(find.text('Có lỗi xảy ra, thử lại sau.'), findsOneWidget);
    expect(find.text('Nghiệm thu đợt 1'), findsOneWidget);
    expect(h.repository.calls, isEmpty);
  });

  testWidgets('cancel sits behind "Xem thêm" and its sheet states what happens to the deposit', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [orderJson(status: 'Confirmed')];

    await tester.pumpWidget(h.app(Routes.customerOrder('OD1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Xem thêm'));
    await tester.pumpAndSettle();
    expect(find.text('12 Nguyễn Huệ, TP. Hồ Chí Minh'), findsOneWidget);
    expect(find.text('288,1 km'), findsOneWidget);

    await tester.tap(find.text('Huỷ đơn'));
    await tester.pumpAndSettle();
    expect(find.text('Huỷ đơn OD1'), findsOneWidget);
    expect(find.text('Lô đã mở. Huỷ đơn là mất toàn bộ tiền cọc 832.000 đ.'), findsOneWidget);

    await tester.tap(find.text('Huỷ đơn và chịu mất cọc'));
    await tester.pumpAndSettle();
    expect(h.repository.calls, ['cancel OD1']);
    expect(find.text('Đã huỷ'), findsOneWidget);
    expect(find.text('Huỷ đơn'), findsNothing);
  });

  testWidgets('delivered order: rate once, report a problem, invoices and trace behind "Xem thêm"', (tester) async {
    _tallPhone(tester);
    final h = CustomerHarness();
    h.repository.orderList = [orderJson(status: 'Delivered')];
    h.repository.deliveriesByOrder['OD1'] = deliveriesJson(shipments: [shipmentJson(stage: 'done')], withInvoice: true);

    await tester.pumpWidget(h.app(Routes.customerOrder('OD1')));
    await tester.pumpAndSettle();

    expect(find.text('Đã giao đủ'), findsOneWidget);
    expect(find.text('Báo vấn đề về hàng đã nhận'), findsOneWidget);
    expect(find.text('Đánh giá đơn'), findsOneWidget);

    await tester.tap(find.byTooltip('4 sao'));
    await tester.pumpAndSettle();
    expect(find.text('Gửi đánh giá 4 sao'), findsOneWidget);
    expect(find.text('Mỗi đơn đánh giá một lần, gửi rồi không sửa được.'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Cua chắc');
    await tester.tap(find.text('Gửi đánh giá'));
    await tester.pumpAndSettle();
    expect(h.repository.calls, ['rate OD1 4 Cua chắc']);
    expect(h.memory.ratings, {'$customerUserId/OD1': 4});
    expect(find.text('Bạn đã đánh giá'), findsOneWidget);

    await tester.tap(find.text('Xem thêm'));
    await tester.pumpAndSettle();
    expect(find.text('HD0001'), findsOneWidget);
    expect(find.text('Còn hiệu lực'), findsOneWidget);
    expect(find.text('Máy này chưa lưu khiếu nại nào của đơn.'), findsOneWidget);
    expect(find.text('Huỷ đơn'), findsNothing);

    await tester.tap(find.text('Truy xuất nguồn gốc'));
    await tester.pumpAndSettle();
    expect(find.text('Trang truy xuất QR7K2M9XQ4TB'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

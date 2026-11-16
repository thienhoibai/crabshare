import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/features/customer/customer_routes.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/customer_fakes.dart';

/// Các màn của khu khách hàng không tràn bố cục trên điện thoại hẹp (rộng 360) với mã đơn dài như dữ liệu thật.
/// Màn test đủ cao để mọi dòng của danh sách đều được dựng; các phần gấp được mở hết.
void main() {
  const orderNo = 'OD438SQFC6YG3';

  CustomerHarness harness() {
    final h = CustomerHarness();
    h.repository.orderList = [
      orderJson(orderNo: orderNo, status: 'Delivering'),
      orderJson(orderNo: 'OD438SQFC6YG4', status: 'PendingDeposit', withDeposit: true),
      orderJson(orderNo: 'OD438SQFC6YG5', status: 'Forfeited', cancelReason: 'Quá hạn trả phần còn lại'),
    ];
    h.repository.deliveriesByOrder[orderNo] = deliveriesJson(
      orderNo: orderNo,
      shipments: [
        shipmentJson(shipmentNo: 'SH438SQFC6YG1', orderNo: orderNo, stage: 'done'),
        shipmentJson(shipmentNo: 'SH438SQFC6YG2', orderNo: orderNo, stage: 'pay', trancheSeq: 2),
        shipmentJson(shipmentNo: 'SH438SQFC6YG3', orderNo: orderNo, stage: 'accept', trancheSeq: 3),
        shipmentJson(shipmentNo: 'SH438SQFC6YG4', orderNo: orderNo, stage: 'transit', trancheSeq: 4),
      ],
      withInvoice: true,
    );
    h.repository.batches = [openBatchJson()];
    h.repository.claimsByNo['KN438SQFC6YG'] = claimJson(
      claimNo: 'KN438SQFC6YG',
      orderNo: orderNo,
      status: 'OperatorRejected',
      operatorResponse: 'Cua chết sau khi nhận hàng, không do vận chuyển',
    );
    return h;
  }

  for (final location in [
    Routes.customerOrders,
    Routes.customerBatches,
    Routes.customerDeliveries,
    Routes.customerOrder(orderNo),
    Routes.customerOrder('OD438SQFC6YG4'),
    Routes.customerOrder('OD438SQFC6YG5'),
    CustomerRoutes.claimNew(orderNo),
    CustomerRoutes.claim('KN438SQFC6YG'),
  ]) {
    testWidgets('no overflow on a narrow phone: $location', (tester) async {
      tester.view.physicalSize = const Size(720, 7000);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      final h = harness();
      await h.memory.rememberClaim(customerUserId, 'OD438SQFC6YG5', 'KN438SQFC6YG');

      await tester.pumpWidget(h.app(location));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      for (final label in ['Xem thêm', 'Số liệu cân', 'Chi tiết', 'Đơn đã xong (1)', 'Đã nghiệm thu (1)']) {
        final fold = find.text(label);
        if (fold.evaluate().isEmpty) continue;
        await tester.tap(fold.first);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: label);
      }
    });
  }
}

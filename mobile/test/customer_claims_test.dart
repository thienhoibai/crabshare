import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/features/customer/customer_routes.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/customer_fakes.dart';

void _tallPhone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 4500);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
}

CustomerHarness _delivered() {
  final h = CustomerHarness();
  h.repository.orderList = [orderJson(status: 'Delivered')];
  h.repository.deliveriesByOrder['OD1'] = deliveriesJson(shipments: [shipmentJson(stage: 'done')]);
  return h;
}

void main() {
  test('claim paths', () {
    expect(CustomerRoutes.claimNew('OD1'), '/c/orders/OD1/claim');
    expect(CustomerRoutes.claimNew('OD1', shipmentNo: 'SH 1'), '/c/orders/OD1/claim?shipment=SH+1');
    expect(CustomerRoutes.claim('KN/1'), '/c/claims/KN%2F1');
  });

  testWidgets('claim form checks the numbers, needs a photo, sends and opens the claim', (tester) async {
    _tallPhone(tester);
    final h = _delivered();

    await tester.pumpWidget(h.app(CustomerRoutes.claimNew('OD1')));
    await tester.pumpAndSettle();

    expect(find.text('Báo vấn đề'), findsOneWidget);
    expect(find.text('Đã nghiệm thu 19 con · 5 kg'), findsOneWidget);
    // Một chuyến, một quy cách: không hỏi lại đợt giao và quy cách.
    expect(find.text('Đợt giao'), findsNothing);
    expect(find.text('Quy cách'), findsNothing);
    for (final label in ['Khiếu nại', 'Trả hàng', 'Cua chết', 'Cua yếu', 'Sai size', 'Sai khối lượng', 'Giao trễ', 'An toàn thực phẩm']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }

    await tester.tap(find.text('Gửi'));
    await tester.pump();
    expect(find.text('Ghi số con hoặc số kg bị ảnh hưởng.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Số con'), '25');
    await tester.tap(find.text('Gửi'));
    await tester.pump();
    expect(find.text('Số bị ảnh hưởng không vượt số đã nghiệm thu.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Số con'), '2');
    await tester.enterText(find.widgetWithText(TextField, 'hoặc số kg'), '0,5');
    await tester.tap(find.text('Gửi'));
    await tester.pump();
    expect(find.text('Mô tả sự việc ít nhất 3 ký tự.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Mô tả'), 'Hai con yếu, không bán được');
    await tester.tap(find.text('Gửi'));
    await tester.pump();
    expect(find.text('Cần một ảnh chụp bằng chứng.'), findsOneWidget);
    expect(h.repository.calls, isEmpty);

    await tester.tap(find.text('Chụp ảnh bằng chứng'));
    await tester.pumpAndSettle();
    expect(find.text('Bấm để chụp lại'), findsOneWidget);
    await tester.tap(find.text('Trả hàng'));
    await tester.tap(find.text('Cua yếu'));
    await tester.pump();
    await tester.tap(find.text('Gửi'));
    await tester.pumpAndSettle();

    expect(h.repository.calls, ['claim OD1']);
    final draft = h.repository.lastDraft!;
    expect(draft.shipmentNo, 'SH1');
    expect(draft.specCode, 'FAT-M-G1');
    expect(draft.claimType, 'Return');
    expect(draft.issueType, 'Weak');
    expect(draft.affectedCrabs, 2);
    expect(draft.affectedKg, 0.5);
    expect(draft.description, 'Hai con yếu, không bán được');
    expect(draft.photo.contentType, 'image/png');
    expect(h.memory.claimNos, {
      '$customerUserId/OD1': ['KN9'],
    });

    // Gửi xong thì mở luôn khiếu nại vừa tạo.
    expect(find.text('Báo vấn đề'), findsNothing);
    expect(find.text('Khiếu nại'), findsOneWidget);
    expect(find.text('Chờ người nuôi phản hồi'), findsOneWidget);
    expect(find.text('Hai con chết khi mở thùng'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a shipment that already has a claim, or is out of the return window, cannot be claimed again', (tester) async {
    _tallPhone(tester);
    final h = _delivered();
    h.repository.claimsByNo['KN1'] = claimJson();
    await h.memory.rememberClaim(customerUserId, 'OD1', 'KN1');

    await tester.pumpWidget(h.app(CustomerRoutes.claimNew('OD1')));
    await tester.pumpAndSettle();

    expect(find.text('Không còn chuyến giao nào trong hạn đổi trả'), findsOneWidget);
    expect(find.text('Gửi'), findsNothing);
  });

  testWidgets('claim detail: farmer answered, I agree and the refund shows', (tester) async {
    _tallPhone(tester);
    final h = _delivered();
    h.repository.claimsByNo['KN1'] = claimJson(status: 'OperatorAccepted', operatorResponse: 'Đồng ý hoàn 2 con');

    await tester.pumpWidget(h.app(CustomerRoutes.claim('KN1')));
    await tester.pumpAndSettle();

    expect(find.text('Cua chết · 2 con'), findsOneWidget);
    expect(find.text('Người nuôi chấp nhận'), findsOneWidget);
    expect(find.text('Đồng ý hoàn 2 con'), findsOneWidget);

    await tester.tap(find.text('Đồng ý'));
    await tester.pumpAndSettle();
    expect(find.text('Đồng ý với người nuôi'), findsOneWidget);
    expect(find.text('Khiếu nại được chấp nhận và bạn được hoàn tiền phần bị ảnh hưởng.'), findsOneWidget);
    await tester.tap(find.text('Đồng ý và chốt'));
    await tester.pumpAndSettle();

    expect(h.repository.calls, ['reply KN1 true']);
    expect(find.text('Đã chốt khiếu nại.'), findsOneWidget);
    expect(find.text('Chấp nhận'), findsOneWidget);
    expect(find.text('200.000 đ'), findsOneWidget);
    expect(find.text('Đồng ý'), findsNothing);
    expect(find.text('Không đồng ý'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('claim detail: disagreeing sends the claim to Admin', (tester) async {
    _tallPhone(tester);
    final h = _delivered();
    h.repository.claimsByNo['KN1'] = claimJson(status: 'OperatorRejected', operatorResponse: 'Cua chết sau khi nhận');

    await tester.pumpWidget(h.app(CustomerRoutes.claim('KN1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Không đồng ý'));
    await tester.pumpAndSettle();
    expect(find.text('Quyết định của Admin là quyết định cuối cùng.'), findsOneWidget);
    await tester.tap(find.text('Chuyển Admin'));
    await tester.pumpAndSettle();

    expect(h.repository.calls, ['reply KN1 false']);
    expect(find.text('Đã chuyển khiếu nại cho Admin quyết định.'), findsOneWidget);
    expect(find.text('Chuyển Admin quyết định'), findsOneWidget);
  });

  testWidgets('order screen lists remembered claims and opens another one by its code', (tester) async {
    _tallPhone(tester);
    final h = _delivered();
    h.repository.claimsByNo['KN1'] = claimJson(status: 'OperatorAccepted', operatorResponse: 'Đồng ý');
    h.repository.claimsByNo['KN5'] = claimJson(claimNo: 'KN5');
    h.repository.claimsByNo['KN6'] = claimJson(claimNo: 'KN6', orderNo: 'OD9');
    await h.memory.rememberClaim(customerUserId, 'OD1', 'KN1');

    await tester.pumpWidget(h.app(Routes.customerOrder('OD1')));
    await tester.pumpAndSettle();
    // Chuyến đã có khiếu nại thì không mời báo vấn đề lần nữa.
    expect(find.text('Báo vấn đề về hàng đã nhận'), findsNothing);

    await tester.tap(find.text('Xem thêm'));
    await tester.pumpAndSettle();
    expect(find.text('Cua chết · 2 con'), findsOneWidget);
    expect(find.text('Người nuôi chấp nhận'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Mở theo mã khiếu nại'), 'kn6');
    await tester.tap(find.byIcon(Icons.search_rounded));
    await tester.pumpAndSettle();
    expect(find.text('Khiếu nại KN6 thuộc đơn OD9.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Mở theo mã khiếu nại'), 'kn5');
    await tester.tap(find.byIcon(Icons.search_rounded));
    await tester.pumpAndSettle();
    expect(h.memory.claimNos['$customerUserId/OD1'], ['KN1', 'KN5']);
    expect(find.text('Chờ người nuôi phản hồi'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/shared/widgets/app_parts.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

Map<String, String> _fields(RequestOptions request) => {for (final f in (request.data as FormData).fields) f.key: f.value};

void main() {
  setUpAll(loadAppFonts);

  testWidgets('sơ đồ hộp đứng đầu màn: chú giải có số, tình trạng từng hộp, hộp trống của trại khi còn cua chờ xếp', (tester) async {
    final server = FarmServer();
    await pumpFarmApp(tester, server, location: Routes.operatorBatch('CS-P1'));

    expect(find.text('CS-P1'), findsOneWidget);
    expect(find.widgetWithText(StatusPill, 'Đang lưu nuôi'), findsOneWidget);
    // Bốn con số của màn là chú giải màu: 1 khoẻ, 1 cần xem, 1 chết chưa thả bù, 1 trống.
    for (final legend in ['1 khoẻ', '1 cần xem', '1 chết chưa thả bù', '1 trống']) {
      expect(find.text(legend, findRichText: true), findsOneWidget);
    }
    // Sơ đồ hộp nằm trong nửa trên của màn hình.
    expect(tester.getTopLeft(find.text('1701')).dy, lessThan(422));
    // Số liệu của đợt lưu nuôi nằm trong khối gấp.
    expect(find.text('Đã thả bù'), findsNothing);
    await tester.ensureVisible(find.text('Đợt lưu nuôi'));
    await tester.tap(find.text('Đợt lưu nuôi'));
    await tester.settle();
    expect(find.text('Đã thả bù'), findsOneWidget);
    expect(find.text('0/4 con'), findsOneWidget);
    expect(find.text('15 ngày đầu'), findsOneWidget);

    // 1701 khoẻ, 1702 đang lột, 1703 có cua chết chưa thả bù, 1704 trống; 0080 là hộp trống của trại.
    expect(find.text('Khoẻ'), findsOneWidget);
    expect(find.text('Đang lột'), findsOneWidget);
    expect(find.text('Chết'), findsOneWidget);
    expect(find.text('Trống'), findsNWidgets(2));
    expect(find.text('1 con chờ xếp hộp. Bấm một hộp trống để xếp.'), findsOneWidget);
    expect(find.text('Hộp trống của trại'), findsOneWidget);
    expect(find.text('0080'), findsOneWidget);

    expect(find.text('Ghi nhật ký'), findsOneWidget);
    expect(find.text('Đo cua'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('bấm hộp có cua mở phiếu con cua; ghi "Đã kiểm tra" sau một lần xác nhận', (tester) async {
    final server = FarmServer();
    await pumpFarmApp(tester, server, location: Routes.operatorBatch('CS-P1'));

    await tester.tap(find.text('1701'));
    await tester.settle();
    expect(find.text('Hộp 1701'), findsOneWidget);
    expect(find.text('Cua CU01 · Đực · 294 g lúc nhận'), findsOneWidget);
    for (final action in ['Đã kiểm tra', 'Lột xác', 'Ăn kém', 'Chuyển hộp', 'Báo chết']) {
      expect(find.text(action), findsOneWidget);
    }
    // Lịch sử nằm trong khối gấp.
    expect(find.text('Xếp vào hộp'), findsNothing);
    await tester.tap(find.text('Lịch sử'));
    await tester.settle();
    expect(find.text('Xếp vào hộp'), findsOneWidget);

    await tester.tap(find.text('Đã kiểm tra'));
    await tester.settle();
    expect(find.text('Đã kiểm tra · hộp 1701'), findsOneWidget);
    expect(server.sent('POST', '/api/crab-units/CU01/events'), isEmpty);
    await tester.tap(find.text('Ghi'));
    await tester.settle();

    expect(server.sent('POST', '/api/crab-units/CU01/events').single.data, {'eventType': 'Inspected', 'evidenceId': null, 'note': null});
    expect(find.text('Hộp 1701'), findsNothing);
    expect(find.text('Đã ghi "Đã kiểm tra" cho hộp 1701.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('báo chết bắt buộc chụp ảnh hộp bằng camera trong ứng dụng', (tester) async {
    final server = FarmServer();
    final camera = FakeCamera();
    await pumpFarmApp(tester, server, location: Routes.operatorBatch('CS-P1'), camera: camera);

    await tester.tap(find.text('1701'));
    await tester.settle();
    await tester.tap(find.text('Báo chết'));
    await tester.settle();
    expect(find.text('Báo cua chết · hộp 1701'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Ghi cua chết')).onPressed, isNull);

    await tester.tap(find.text('Chụp hộp 1701'));
    await tester.settle();
    expect(camera.captures, 1);
    await tester.tap(find.text('Ghi cua chết'));
    await tester.settle();

    final upload = _fields(server.sent('POST', '/api/evidence').single);
    expect((upload['BatchCode'], upload['SlotCode'], upload['SlotEventType']), ('CS-P1', '1701', null));
    expect(server.sent('POST', '/api/crab-units/CU01/events').single.data, {'eventType': 'Died', 'evidenceId': 500, 'note': null});
    expect(find.text('Đã ghi cua chết ở hộp 1701.'), findsOneWidget);
    // Sơ đồ tải lại: hộp 1701 thành hộp có cua chết chưa thả bù.
    expect(find.text('Chết'), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('bấm hộp có cua chết chưa thả bù: chọn con chờ xếp, chụp hộp, thả bù', (tester) async {
    final server = FarmServer();
    await pumpFarmApp(tester, server, location: Routes.operatorBatch('CS-P1'));

    await tester.tap(find.text('1703'));
    await tester.settle();
    expect(find.text('Thả bù hộp 1703'), findsOneWidget);
    expect(find.text('Thay con CU03 đã chết.'), findsOneWidget);
    expect(find.text('CU04 · 294 g'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Thả bù')).onPressed, isNull);

    await tester.tap(find.text('Chụp hộp đã có cua'));
    await tester.settle();
    await tester.tap(find.widgetWithText(FilledButton, 'Thả bù'));
    await tester.settle();

    final upload = _fields(server.sent('POST', '/api/evidence').single);
    expect((upload['SlotCode'], upload['SlotEventType']), ('1703', 'Boxed'));
    expect(server.sent('POST', '/api/batches/CS-P1/box-assignments').single.data, {
      'crabCode': 'CU04',
      'slotCode': '1703',
      'evidenceId': 500,
      'replacesCrabCode': 'CU03',
    });
    expect(find.text('Đã thả bù vào hộp 1703.'), findsOneWidget);
    expect(find.text('Chết'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('hộp trống của trại nhận con cua đầu tiên; lỗi máy chủ hiện ngay trong phiếu', (tester) async {
    final server = FarmServer()..failures['POST /api/batches/CS-P1/box-assignments'] = (422, 'Ảnh phải chụp đúng hộp của Lô.');
    await pumpFarmApp(tester, server, location: Routes.operatorBatch('CS-P1'));

    await tester.ensureVisible(find.text('0080'));
    await tester.tap(find.text('0080'));
    await tester.settle();
    expect(find.text('Xếp cua vào hộp 0080'), findsOneWidget);
    await tester.tap(find.text('Chụp hộp đã có cua'));
    await tester.settle();
    await tester.tap(find.widgetWithText(FilledButton, 'Xếp vào hộp'));
    await tester.settle();
    expect(find.text('Ảnh phải chụp đúng hộp của Lô.'), findsOneWidget);
    expect(find.text('Xếp cua vào hộp 0080'), findsOneWidget);

    // Bấm lại với cùng ảnh: ảnh không bị gửi lần hai.
    server.failures.clear();
    await tester.tap(find.widgetWithText(FilledButton, 'Xếp vào hộp'));
    await tester.settle();
    expect(server.sent('POST', '/api/evidence'), hasLength(1));
    expect(server.sent('POST', '/api/batches/CS-P1/box-assignments').last.data, {
      'crabCode': 'CU04',
      'slotCode': '0080',
      'evidenceId': 500,
      'replacesCrabCode': null,
    });
    expect(find.text('Đã xếp cua vào hộp 0080.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('chuyển hộp: chọn một hộp trống của Lô hoặc của trại', (tester) async {
    final server = FarmServer();
    await pumpFarmApp(tester, server, location: Routes.operatorBatch('CS-P1'));

    await tester.tap(find.text('1702'));
    await tester.settle();
    await tester.tap(find.text('Chuyển hộp'));
    await tester.settle();
    expect(find.text('Chuyển hộp · từ hộp 1702'), findsOneWidget);
    for (final code in ['1704', '0080']) {
      expect(find.widgetWithText(ChoiceChip, code), findsOneWidget);
    }
    // Hộp 1703 có cua chết chưa thả bù: để dành cho con thả bù.
    expect(find.widgetWithText(ChoiceChip, '1703'), findsNothing);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Chọn hộp mới')).onPressed, isNull);

    await tester.tap(find.widgetWithText(ChoiceChip, '1704'));
    await tester.settle();
    await tester.tap(find.text('Chuyển sang hộp 1704'));
    await tester.settle();

    expect(server.sent('POST', '/api/crab-units/CU02/move').single.data, {'slotCode': '1704', 'reason': null});
    expect(find.text('Đã chuyển cua sang hộp 1704.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lô đang thu hoạch: đo cua là việc chính, hộp trống không xếp cua nữa', (tester) async {
    final server = FarmServer()..batches = [farmBatchJson(status: 'Harvesting')];
    final router = await pumpFarmApp(tester, server, location: Routes.operatorBatch('CS-P1'));

    expect(find.widgetWithText(StatusPill, 'Đang thu hoạch'), findsOneWidget);
    expect(find.text('Hộp trống của trại'), findsNothing);
    await tester.tap(find.text('1704'));
    await tester.settle();
    expect(find.text('Hộp 1704 đang trống.'), findsOneWidget);

    await tester.tap(find.text('Đo cua'));
    await tester.settle();
    expect(router.state.uri.path, Routes.operatorMeasure('CS-P1'));
    expect(find.text('Màn đo cua CS-P1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lô không lưu nuôi và Lô chưa thả con nào chỉ có một câu báo trống', (tester) async {
    final server = FarmServer()
      ..batches = [farmBatchJson(code: 'CS-T1', status: 'Selling', hasHolding: false), farmBatchJson(code: 'CS-N1', status: 'Sourcing')]
      ..boxes = []
      ..crabs = []
      ..holding = null;
    final router = await pumpFarmApp(tester, server, location: Routes.operatorBatch('CS-T1'));
    expect(find.text('Lô này không lưu nuôi trong hộp'), findsOneWidget);
    expect(server.calls, isNot(contains('GET /api/batches/CS-T1/boxes')));

    router.go(Routes.operatorBatch('CS-N1'));
    await tester.settle();
    expect(find.text('Lô chưa có cua trong hộp'), findsOneWidget);
    expect(find.text('Đợt lưu nuôi'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

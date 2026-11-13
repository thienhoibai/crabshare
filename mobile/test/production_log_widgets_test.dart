import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/shared/widgets/app_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

Map<String, dynamic> _reading() => {
  'measuredAt': '2026-11-12T06:05:00Z',
  'temperatureC': 27.64,
  'salinityPpt': 15.25,
  'ph': 7.98,
  'quality': 'Calibrated',
  'deviceCode': 'WS-NC-01',
};

Finder _field(String name) => find.byKey(ValueKey('log-$name'));
String _value(WidgetTester tester, String name) =>
    tester.widget<EditableText>(find.descendant(of: _field(name), matching: find.byType(EditableText))).controller.text;

void main() {
  setUpAll(loadAppFonts);

  testWidgets('ba chỉ số nước điền sẵn từ cảm biến; chỉ cần nhập thức ăn rồi lưu', (tester) async {
    final server = FarmServer()..water = [_reading()];
    final router = await pumpFarmApp(tester, server, location: Routes.operatorToday);
    router.push(Routes.dailyLogFor('CS-P1'));
    await tester.settle();

    expect(find.text('Nhật ký hôm nay'), findsOneWidget);
    expect(find.text('Cua thịt hộp · ngày nuôi 13/35'), findsOneWidget);
    // Một Lô thì không cần hàng chọn Lô.
    expect(find.byType(ChoiceChip), findsNothing);
    expect((_value(tester, 'ph'), _value(tester, 'waterTempC'), _value(tester, 'salinityPpt')), ('8', '27,6', '15,3'));
    expect(_value(tester, 'feedKg'), '');
    expect(find.textContaining('Chỉ số nước lấy từ cảm biến lúc'), findsOneWidget);

    // Chưa nhập thức ăn thì không gửi.
    await tester.tap(find.byKey(const ValueKey('save-log')));
    await tester.settle();
    expect(find.text('Chưa nhập.'), findsOneWidget);
    expect(server.sent('POST', '/api/batches/CS-P1/production-logs'), isEmpty);

    await tester.enterText(_field('feedKg'), '0,725');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('save-log')));
    await tester.settle();

    expect(server.sent('POST', '/api/batches/CS-P1/production-logs').single.data, {
      'ph': 8.0,
      'waterTempC': 27.6,
      'salinityPpt': 15.3,
      'feedKg': 0.725,
      'note': null,
    });
    // Quay về Hôm nay: có câu báo và việc "ghi nhật ký" đã hết.
    expect(router.state.uri.path, Routes.operatorToday);
    expect(find.text('Đã ghi nhật ký Lô CS-P1.'), findsOneWidget);
    expect(find.text('Ghi nhật ký hôm nay'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('không có cảm biến thì nhập tay cả bốn số; sửa số điền sẵn và ghi chú vẫn gửi đúng', (tester) async {
    final server = FarmServer();
    final router = await pumpFarmApp(tester, server, location: Routes.operatorToday);
    router.push(Routes.dailyLogNew);
    await tester.settle();

    expect(find.textContaining('Chỉ số nước lấy từ cảm biến'), findsNothing);
    await tester.enterText(_field('feedKg'), '2.4');
    await tester.enterText(_field('ph'), '7,85');
    await tester.enterText(_field('waterTempC'), '28');
    await tester.enterText(_field('salinityPpt'), 'abc');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('save-log')));
    await tester.settle();
    expect(find.text('Tối đa 1 chữ số thập phân.'), findsOneWidget);
    expect(find.text('Nhập số hợp lệ.'), findsOneWidget);
    expect(server.sent('POST', '/api/batches/CS-P1/production-logs'), isEmpty);

    await tester.enterText(_field('ph'), '7,8');
    await tester.enterText(_field('salinityPpt'), '15');
    await tester.tap(find.text('Ghi chú'));
    await tester.settle();
    await tester.enterText(find.byKey(const ValueKey('log-note')), ' Thay nước một phần ');
    await tester.pump();
    await tester.ensureVisible(find.byKey(const ValueKey('save-log')));
    await tester.tap(find.byKey(const ValueKey('save-log')));
    await tester.settle();

    expect(server.sent('POST', '/api/batches/CS-P1/production-logs').single.data, {
      'ph': 7.8,
      'waterTempC': 28.0,
      'salinityPpt': 15.0,
      'feedKg': 2.4,
      'note': 'Thay nước một phần',
    });
    expect(tester.takeException(), isNull);
  });

  testWidgets('nhiều Lô: mở sẵn Lô chưa ghi; Lô đã ghi hôm nay hiện lại số vừa ghi thay cho form', (tester) async {
    final server = FarmServer()
      ..careBatches = [
        careBatchJson(loggedToday: true, title: 'Lô đã ghi'),
        careBatchJson(code: 'CS-H1', status: 'Harvesting', title: 'Lô đang thu hoạch'),
        careBatchJson(code: 'CS-S1', status: 'Stocked'),
      ]
      ..failures['POST /api/batches/CS-H1/production-logs'] = (409, 'Lô này đã có nhật ký thủ công cho hôm nay.');
    final router = await pumpFarmApp(tester, server, location: Routes.operatorToday);
    router.push(Routes.dailyLogNew);
    await tester.settle();

    // Lô chỉ mới thả (Stocked) chưa ghi nhật ký được nên không có trong hàng chọn.
    expect(find.byType(ChoiceChip), findsNWidgets(2));
    expect(find.text('Lô đang thu hoạch · ngày nuôi 13/35'), findsOneWidget);
    expect(_field('feedKg'), findsOneWidget);

    for (final name in ['feedKg', 'ph', 'waterTempC', 'salinityPpt']) {
      await tester.enterText(_field(name), '8');
    }
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('save-log')));
    await tester.settle();
    expect(find.text('Lô này đã có nhật ký thủ công cho hôm nay.'), findsOneWidget);
    expect(router.state.uri.path, Routes.dailyLogNew);

    await tester.tap(find.widgetWithText(ChoiceChip, 'CS-P1'));
    await tester.settle();
    expect(find.text('Hôm nay đã ghi nhật ký'), findsOneWidget);
    expect(_field('feedKg'), findsNothing);
    expect(find.byKey(const ValueKey('save-log')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('không có Lô đang lưu nuôi; lỗi tải có nút thử lại', (tester) async {
    final server = FarmServer()
      ..careBatches = []
      ..failures['GET /api/operators/me/production-batches'] = (503, 'Không tải được Lô.');
    final router = await pumpFarmApp(tester, server, location: Routes.operatorBatches);
    router.push(Routes.dailyLogNew);
    await tester.settle();

    expect(find.text('Không tải được Lô.'), findsOneWidget);
    server.failures.clear();
    await tester.tap(find.text('Thử lại'));
    await tester.settle();
    expect(find.text('Chưa có Lô nào đang lưu nuôi'), findsOneWidget);
    expect(find.byKey(const ValueKey('save-log')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('các bản đã ghi: thẻ gọn bốn số, cờ ngoài khoảng, nguồn thiết bị, lối sang form', (tester) async {
    final server = FarmServer()
      ..logs = [
        careLogJson(id: 1, flag: 'OutOfRange', note: 'Mưa lớn, đã thay nước'),
        careLogJson(id: 2, batchCode: 'CS-H1', source: 'Device'),
        for (var i = 3; i <= 40; i++) careLogJson(id: i),
      ];
    final router = await pumpFarmApp(tester, server, location: Routes.operatorLogs);

    expect(find.byType(SubPageHeader), findsOneWidget);
    expect(find.text('Nhật ký chăm sóc'), findsOneWidget);
    expect(find.text('11/11/2026 · CS-P1'), findsWidgets);
    expect(find.text('Ngoài khoảng'), findsOneWidget);
    expect(find.text('Mưa lớn, đã thay nước'), findsOneWidget);
    expect(find.text('11/11/2026 · CS-H1'), findsOneWidget);
    expect(find.text('Nguồn: Thiết bị'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Đang hiện 30 bản ghi gần nhất.'), 600, scrollable: find.byType(Scrollable).first);
    expect(find.text('Đang hiện 30 bản ghi gần nhất.'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Ghi nhật ký hôm nay'), -600, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Ghi nhật ký hôm nay'));
    await tester.settle();
    expect(router.state.uri.path, Routes.dailyLogNew);
    expect(tester.takeException(), isNull);
  });

  testWidgets('chưa có nhật ký nào', (tester) async {
    await pumpFarmApp(tester, FarmServer(), location: Routes.operatorLogs);
    expect(find.text('Chưa có nhật ký nào'), findsOneWidget);
    expect(find.text('Ghi nhật ký hôm nay'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

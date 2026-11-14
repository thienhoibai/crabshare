import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/features/operator/operator_web.dart';
import 'package:crabshare_mobile/shared/widgets/app_parts.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

void main() {
  setUpAll(loadAppFonts);

  testWidgets('Hôm nay: ba con số và danh sách việc; bấm mỗi việc là tới màn xử lý', (tester) async {
    final server = FarmServer()
      ..batches = [farmBatchJson(), farmBatchJson(code: 'CS-F1', status: 'Funding')]
      ..alerts = [alertJson()]
      ..captureRequests = [captureRequestJson()]
      ..flagged = [flaggedJson()];
    final router = await pumpFarmApp(tester, server, location: Routes.operatorToday);

    expect(find.text('Xin chào, Trần Văn Nuôi'), findsOneWidget);
    expect(find.text('HTX Nuôi cua Năm Căn'), findsOneWidget);
    for (final label in ['Lô đang chạy', 'Cảnh báo mở', 'Chưa ghi nhật ký']) {
      expect(find.text(label), findsOneWidget);
    }
    // Ba ô số đều là 1, cộng số trên chuông cảnh báo.
    expect(find.text('1'), findsNWidgets(4));

    Future<void> opens(String todo, String location) async {
      await tester.ensureVisible(find.text(todo));
      await tester.tap(find.text(todo));
      await tester.settle();
      expect(router.state.uri.toString(), location, reason: todo);
      router.pop();
      await tester.settle();
    }

    await opens('1 cảnh báo cần phản hồi', Routes.operatorAlerts);
    await opens('Ghi nhật ký hôm nay', Routes.dailyLogFor('CS-P1'));
    await opens('1 ảnh cần giải trình', Routes.evidenceExplanation(57));

    await tester.tap(find.text('Chụp ảnh hộp 1701'));
    await tester.settle();
    expect(router.state.uri.path, Routes.capture);
    expect(router.state.uri.queryParameters['requestId'], '50');
    expect(router.state.uri.queryParameters['slot'], '1701');
    expect(router.state.uri.queryParameters['batch'], 'CS-P1');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Hôm nay không còn việc: một câu báo trống và hai lối tắt', (tester) async {
    final server = FarmServer()..careBatches = [careBatchJson(loggedToday: true)];
    final router = await pumpFarmApp(tester, server, location: Routes.operatorToday);

    expect(find.text('Hôm nay không còn việc đang chờ'), findsOneWidget);
    expect(find.text('0'), findsNWidgets(2));

    await tester.tap(find.text('Cảnh báo'));
    await tester.settle();
    expect(router.state.uri.path, Routes.operatorAlerts);
    router.pop();
    await tester.settle();
    await tester.tap(find.text('Ghi nhật ký'));
    await tester.settle();
    expect(router.state.uri.path, Routes.dailyLogNew);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Hôm nay: yêu cầu chụp quá hạn không còn là việc; nhiều yêu cầu thì gộp phần dư thành một câu', (tester) async {
    final server = FarmServer()
      ..careBatches = [careBatchJson(loggedToday: true)]
      ..captureRequests = [
        captureRequestJson(id: 1, slot: '1701', dueIn: const Duration(minutes: -5)),
        for (var i = 2; i <= 7; i++)
          captureRequestJson(
            id: i,
            slot: '170$i',
            dueIn: Duration(hours: i),
          ),
      ];
    await pumpFarmApp(tester, server, location: Routes.operatorToday);

    expect(find.text('Chụp ảnh hộp 1701'), findsNothing);
    expect(find.textContaining('Chụp ảnh hộp'), findsNWidgets(4));
    expect(find.text('Chụp ảnh hộp 1702'), findsOneWidget);
    expect(find.text('Còn 2 hộp khác cần chụp.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Hôm nay: lỗi tải tổng quan hiện câu báo của máy chủ và nút thử lại', (tester) async {
    final server = FarmServer()..failures['GET /api/operators/me/dashboard'] = (403, 'Hồ sơ hộ nuôi chưa được duyệt.');
    await pumpFarmApp(tester, server, location: Routes.operatorToday);

    expect(find.text('Hồ sơ hộ nuôi chưa được duyệt.'), findsOneWidget);
    expect(find.text('Hôm nay không còn việc đang chờ'), findsNothing);
    server.failures.clear();
    await tester.tap(find.text('Thử lại'));
    await tester.settle();
    expect(find.text('Hồ sơ hộ nuôi chưa được duyệt.'), findsNothing);
    expect(find.text('Ghi nhật ký hôm nay'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lô: Lô đang chạy thành thẻ có trạng thái và số con trong hộp; Lô khác nằm trong khối gấp', (tester) async {
    final server = FarmServer()
      ..batches = [
        farmBatchJson(title: 'Cua thịt hộp RAS'),
        farmBatchJson(code: 'CS-T1', status: 'Selling', hasHolding: false, title: 'Cua thu mua'),
        farmBatchJson(code: 'CS-F1', status: 'Funding', title: 'Cua gạch gọi vốn'),
      ];
    final router = await pumpFarmApp(tester, server, location: Routes.operatorBatches);

    expect(find.text('Cua thịt hộp RAS'), findsOneWidget);
    expect(find.text('CS-P1 · Lô P'), findsOneWidget);
    expect(find.widgetWithText(StatusPill, 'Đang lưu nuôi'), findsOneWidget);
    expect(find.text('2 con trong hộp'), findsOneWidget);
    // Lô không lưu nuôi: hiện số con của Lô, không hỏi đợt lưu nuôi.
    expect(find.widgetWithText(StatusPill, 'Đang bán và giao'), findsOneWidget);
    expect(find.text('40 con'), findsOneWidget);
    expect(server.calls, isNot(contains('GET /api/batches/CS-T1/holding')));
    expect(find.text('Cua gạch gọi vốn'), findsNothing);
    await tester.tap(find.text('Lô khác (1)'));
    await tester.settle();
    expect(find.text('Cua gạch gọi vốn'), findsOneWidget);

    await tester.tap(find.text('Cua thịt hộp RAS'));
    await tester.settle();
    expect(router.state.uri.path, Routes.operatorBatch('CS-P1'));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lô: chưa có Lô đang chạy thì mời tạo Lô trên trang web', (tester) async {
    final opened = <Uri>[];
    final server = FarmServer()..batches = [];
    await pumpFarmApp(
      tester,
      server,
      location: Routes.operatorBatches,
      overrides: [
        operatorWebLauncherProvider.overrideWithValue((uri) async {
          opened.add(uri);
          return true;
        }),
      ],
    );

    expect(find.text('Chưa có Lô nào đang chạy'), findsOneWidget);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Mở trang web'));
    await tester.settle();
    expect(opened.single.toString(), '$webUrl/operator/batches/new');
    expect(tester.takeException(), isNull);
  });
}

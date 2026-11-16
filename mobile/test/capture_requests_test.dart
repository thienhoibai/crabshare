import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/features/operator/evidence/capture_requests_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

void main() {
  setUpAll(loadAppFonts);

  test('repository lấy mọi trang yêu cầu đang mở, hạn gần nhất đứng trước', () async {
    final pages = <Map<String, dynamic>>[];
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          pages.add(options.queryParameters);
          final page = options.queryParameters['page'] as int;
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'total': 101,
                'items': [
                  {'id': page, 'batchCode': 'CS-P1', 'slotCode': '170$page', 'dueAt': '2026-11-12T0${6 - page}:00:00Z', 'status': 'Open'},
                ],
              },
            ),
          );
        },
      ),
    );

    final requests = await ApiCaptureRequestsRepository(dio).list();
    expect(requests.map((r) => r.id), [2, 1]);
    expect(requests.first.dueAt, DateTime.utc(2026, 11, 12, 4));
    expect(pages.map((q) => q['page']), [1, 2]);
    expect(pages.every((q) => q['status'] == 'Open' && q['pageSize'] == 100), isTrue);
  });

  testWidgets('từ Hôm nay mở đúng yêu cầu chụp, gửi ảnh kèm mã yêu cầu, xong thì việc biến mất', (tester) async {
    final server = FarmServer()
      ..careBatches = [careBatchJson(loggedToday: true)]
      ..captureRequests = [captureRequestJson()];
    final camera = FakeCamera();
    final router = await pumpFarmApp(tester, server, location: Routes.operatorToday, camera: camera);

    await tester.tap(find.text('Chụp ảnh hộp 1701'));
    await tester.settle();
    expect(router.state.uri.queryParameters['requestId'], '50');
    // Hộp của yêu cầu được chọn sẵn, không cho đổi sang hộp khác.
    expect(find.text('Hộp 1701'), findsOneWidget);
    expect(find.textContaining('Chụp hộp 1701 · còn'), findsOneWidget);
    expect(find.text('Đổi hộp'), findsNothing);
    expect(find.byType(TextField), findsNothing);

    await tester.tap(find.text('Chụp rõ số hộp'));
    await tester.settle();
    await tester.tap(find.text('Gửi ảnh'));
    await tester.settle();

    final fields = {for (final f in (server.sent('POST', '/api/evidence').single.data as FormData).fields) f.key: f.value};
    expect((fields['BatchCode'], fields['SlotCode'], fields['CaptureRequestId']), ('CS-P1', '1701', '50'));
    expect(find.text('Yêu cầu chụp đã hoàn thành'), findsOneWidget);
    expect(find.text('Đã lưu ảnh'), findsOneWidget);
    expect(find.text('Chụp lại'), findsNothing);

    router.pop();
    await tester.settle();
    expect(find.text('Chụp ảnh hộp 1701'), findsNothing);
    expect(find.text('Hôm nay không còn việc đang chờ'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ảnh trả lời bị gắn cờ thì yêu cầu vẫn mở và được chụp lại', (tester) async {
    final server = FarmServer()
      ..captureRequests = [captureRequestJson()]
      ..evidenceStatus = 'Flagged';
    final request = captureRequestJson();
    await pumpFarmApp(
      tester,
      server,
      location: Routes.captureRequest(id: 50, slotCode: '1701', batchCode: 'CS-P1', dueAt: DateTime.parse('${request['dueAt']}')),
    );

    await tester.tap(find.text('Chụp rõ số hộp'));
    await tester.settle();
    await tester.tap(find.text('Gửi ảnh'));
    await tester.settle();
    expect(find.text('Ảnh cần thẩm định'), findsOneWidget);
    expect(find.text('Yêu cầu chụp đã hoàn thành'), findsNothing);

    await tester.tap(find.text('Chụp lại'));
    await tester.settle();
    expect(find.text('Chụp rõ số hộp'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('yêu cầu quá hạn khoá việc chụp; hộp không còn thuộc Lô thì báo rõ', (tester) async {
    final server = FarmServer();
    final router = await pumpFarmApp(
      tester,
      server,
      location: Routes.captureRequest(id: 50, slotCode: '1701', batchCode: 'CS-P1', dueAt: DateTime.now().subtract(const Duration(seconds: 1))),
    );
    expect(find.text('Yêu cầu chụp đã quá hạn'), findsOneWidget);
    expect(find.text('Chụp rõ số hộp'), findsNothing);
    expect(find.text('Gửi ảnh'), findsNothing);

    router.go(Routes.captureRequest(id: 51, slotCode: '1701', batchCode: 'CS-KHAC', dueAt: DateTime.now().add(const Duration(hours: 1))));
    await tester.settle();
    expect(find.text('Hộp 1701 không còn cua của Lô này'), findsOneWidget);
    expect(find.text('Chụp rõ số hộp'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

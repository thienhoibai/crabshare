import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

void main() {
  setUpAll(loadAppFonts);

  test('repository lọc hộp đang có cua theo số hộp và gửi ảnh gốc kèm giờ chụp, vị trí', () async {
    final server = FarmServer();
    final repo = ApiEvidenceRepository(server.dio());

    final page = await repo.boxes(search: ' 17 ');
    // Hộp không gán cho Lô nào thì không chụp được.
    expect(page.items.map((b) => b.slotCode), ['1701', '1702']);
    expect(page.items.last.latestEvidence?.reviewStatus, 'Flagged');
    expect(server.requests.single.path, '/api/boxes');
    expect(server.requests.single.queryParameters, {'status': 'Occupied', 'search': '17', 'page': 1, 'pageSize': 60});
    final all = await repo.boxes();
    expect((all.total, all.hasMore), (3, false));
    server.occupiedTotal = 1220;
    expect((await repo.boxes()).hasMore, isTrue);
    expect(server.requests.last.queryParameters.containsKey('search'), isFalse);

    final result = await repo.upload(batchCode: 'CS-P1', slotCode: '1701', photo: testPhoto(), captureRequestId: 50);
    expect((result.id, result.reviewStatus, result.duplicateMatch, result.captureRequestStatus), (500, 'Accepted', 'None', 'Fulfilled'));
    final request = server.sent('POST', '/api/evidence').single;
    final form = request.data as FormData;
    expect(
      {for (final f in form.fields) f.key: f.value},
      {
        'BatchCode': 'CS-P1',
        'SlotCode': '1701',
        'CapturedAt': '2026-11-12T03:00:00.000Z',
        'Latitude': '8.760123',
        'Longitude': '105.050321',
        'CaptureRequestId': '50',
      },
    );
    final file = form.files.single;
    expect(
      (file.key, file.value.filename, file.value.contentType.toString(), file.value.length),
      ('Image', 'capture.png', 'image/png', tinyPng.length),
    );

    await repo.upload(batchCode: 'CS-P1', slotCode: '1703', photo: testPhoto(), boxing: true);
    final boxing = server.sent('POST', '/api/evidence').last.data as FormData;
    expect({for (final f in boxing.fields) f.key: f.value}['SlotEventType'], 'Boxed');
    expect(boxing.fields.map((f) => f.key), isNot(contains('CaptureRequestId')));
  });

  testWidgets('chụp ảnh tự do: tìm hộp, chụp bằng camera trong ứng dụng, gửi, rồi chụp hộp khác', (tester) async {
    final server = FarmServer();
    final camera = FakeCamera();
    await pumpFarmApp(tester, server, location: Routes.capture, camera: camera);

    expect(find.text('Chụp ảnh tại hộp'), findsOneWidget);
    expect(find.text('1701'), findsOneWidget);
    // Ảnh gần nhất của hộp 1702 bị gắn cờ.
    expect(find.text('Chụp lại'), findsOneWidget);
    expect(find.text('0999'), findsNothing);
    expect(find.textContaining('Gõ số hộp để tìm'), findsNothing);

    await tester.enterText(find.byType(TextField), '1702');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.settle();
    expect(server.requests.last.queryParameters['search'], '1702');
    expect(find.text('1701'), findsNothing);

    // Số 1702 có ở ô tìm và ở ô hộp; bấm ô hộp.
    await tester.tap(find.text('1702').last);
    await tester.settle();
    expect(find.text('Hộp 1702'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Gửi ảnh')).onPressed, isNull);
    await tester.tap(find.text('Chụp rõ số hộp'));
    await tester.settle();
    expect(camera.captures, 1);
    await tester.tap(find.text('Gửi ảnh'));
    await tester.settle();

    final fields = {for (final f in (server.sent('POST', '/api/evidence').single.data as FormData).fields) f.key: f.value};
    expect((fields['BatchCode'], fields['SlotCode'], fields['SlotEventType'], fields['CaptureRequestId']), ('CS-P1', '1702', null, null));
    expect(find.text('Đã lưu ảnh'), findsOneWidget);

    await tester.tap(find.text('Chụp hộp khác'));
    await tester.settle();
    expect(find.text('Đã lưu ảnh'), findsNothing);
    expect(find.byType(TextField), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mở sẵn một hộp; ảnh trùng bị gắn cờ và lỗi máy chủ đều được báo ngay', (tester) async {
    final server = FarmServer()..failures['POST /api/evidence'] = (422, 'Hộp không còn được gán cho lô này.');
    await pumpFarmApp(tester, server, location: Routes.captureBox('1701'));

    expect(find.text('Hộp 1701'), findsOneWidget);
    expect(find.text('CS-P1'), findsOneWidget);
    await tester.tap(find.text('Chụp rõ số hộp'));
    await tester.settle();
    await tester.tap(find.text('Gửi ảnh'));
    await tester.settle();
    expect(find.text('Hộp không còn được gán cho lô này.'), findsOneWidget);
    expect(find.text('Hộp 1701'), findsOneWidget);

    server.failures.clear();
    server
      ..evidenceStatus = 'Flagged'
      ..duplicateMatch = 'Exact';
    await tester.tap(find.text('Gửi ảnh'));
    await tester.settle();
    expect(find.text('Ảnh cần thẩm định'), findsOneWidget);
    expect(find.text('Ảnh trùng với ảnh đã gửi trước đó.'), findsOneWidget);

    // Đổi hộp: quay về lưới chọn hộp.
    await tester.tap(find.text('Chụp hộp khác'));
    await tester.settle();
    expect(find.text('Hộp 1701'), findsNothing);
    expect(find.text('1701'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('chưa cấp quyền vị trí thì báo lý do và không gửi gì', (tester) async {
    final server = FarmServer();
    final camera = FakeCamera()..denyWith = 'Cần quyền vị trí để gửi ảnh. Hãy cấp quyền trong cài đặt ứng dụng.';
    await pumpFarmApp(tester, server, location: Routes.captureBox('1701'), camera: camera);

    await tester.tap(find.text('Chụp rõ số hộp'));
    await tester.settle();
    expect(find.text('Cần quyền vị trí để gửi ảnh. Hãy cấp quyền trong cài đặt ứng dụng.'), findsOneWidget);
    expect(find.text('Mở cài đặt'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Gửi ảnh')).onPressed, isNull);
    expect(server.sent('POST', '/api/evidence'), isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('lỗi tải danh sách hộp có nút thử lại; trại nhiều hộp thì nhắc gõ số hộp', (tester) async {
    final server = FarmServer()
      ..occupiedTotal = 1220
      ..failures['GET /api/boxes'] = (503, 'Không tải được hộp nuôi.');
    await pumpFarmApp(tester, server, location: Routes.capture);

    expect(find.text('Không tải được hộp nuôi.'), findsOneWidget);
    server.failures.clear();
    await tester.tap(find.text('Thử lại'));
    await tester.settle();
    expect(find.text('1701'), findsOneWidget);
    expect(find.text('Gõ số hộp để tìm trong 1.220 hộp.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_explanation_repository.dart';
import 'package:crabshare_mobile/shared/widgets/app_parts.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

void main() {
  setUpAll(loadAppFonts);

  test('repository đọc danh sách, chi tiết, ảnh riêng tư và gửi giải trình đã cắt khoảng trắng', () async {
    final server = FarmServer()..flagged = [flaggedJson(), flaggedJson(id: 58, explanation: 'Đã giải trình', review: false)];
    final repo = ApiEvidenceExplanationRepository(server.dio());

    final list = await repo.list();
    expect(list.map((e) => (e.id, e.needsExplanation)), [(57, true), (58, false)]);
    expect(list.first.reviewNote, 'Ảnh giống ảnh hôm trước, vì sao?');
    expect(list.last.reviewNote, isNull);
    expect(server.requests.single.queryParameters, {'status': 'Flagged', 'page': 1, 'pageSize': 100});

    final item = await repo.get(57);
    expect((item.slotCode, item.batchCode, item.canExplain), ('1703', 'CS-P1', true));
    expect(item.capturedAt, DateTime.utc(2026, 11, 10, 7, 59));
    expect(await repo.image(57), tinyPng);
    expect(server.requests.last.responseType, ResponseType.bytes);

    final saved = await repo.explain(57, '  Chụp lại cùng góc vì hộp sát tường  ');
    expect(saved.explanation, 'Chụp lại cùng góc vì hộp sát tường');
    expect(server.calls.skip(1), [
      'GET /api/operators/me/evidence/57',
      'GET /api/operators/me/evidence/57/image',
      'POST /api/evidence/57/explanation',
    ]);
    expect(server.requests.last.data, {'text': 'Chụp lại cùng góc vì hộp sát tường'});
  });

  testWidgets('từ danh sách mở một ảnh, gửi giải trình, rồi danh sách báo đã giải trình', (tester) async {
    final server = FarmServer()..flagged = [flaggedJson()];
    final router = await pumpFarmApp(tester, server, location: Routes.flaggedEvidence);

    expect(find.text('Ảnh cần giải trình'), findsOneWidget);
    expect(find.text('Hộp 1703'), findsOneWidget);
    expect(find.text('Cần giải trình'), findsOneWidget);
    await tester.tap(find.text('Hộp 1703'));
    await tester.settle();
    expect(router.state.uri.path, Routes.evidenceExplanation(57));

    expect(find.text('Hộp 1703 · CS-P1'), findsOneWidget);
    expect(find.widgetWithText(StatusPill, 'Gắn cờ'), findsOneWidget);
    expect(find.text('Người thẩm định hỏi'), findsOneWidget);
    expect(find.text('Ảnh giống ảnh hôm trước, vì sao?'), findsOneWidget);
    // Giờ chụp, vị trí nằm trong khối gấp.
    expect(find.text('Vị trí chụp'), findsNothing);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Gửi giải trình')).onPressed, isNull);

    await tester.enterText(find.byType(TextField), 'Hộp sát tường nên góc chụp giống nhau');
    await tester.pump();
    await tester.ensureVisible(find.text('Gửi giải trình'));
    await tester.tap(find.text('Gửi giải trình'));
    await tester.settle();

    expect(server.sent('POST', '/api/evidence/57/explanation').single.data, {'text': 'Hộp sát tường nên góc chụp giống nhau'});
    expect(find.text('Đã gửi giải trình.'), findsOneWidget);
    expect(find.text('Giải trình đã gửi'), findsOneWidget);
    // Chưa sửa gì thì không gửi lại được.
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Gửi lại giải trình')).onPressed, isNull);

    router.pop();
    await tester.settle();
    expect(find.text('Đã giải trình, chờ thẩm định'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ảnh không còn chờ thẩm định thì chỉ xem; lỗi gửi được báo và tải lại tình trạng', (tester) async {
    final server = FarmServer()
      ..flagged = [flaggedJson()]
      ..failures['POST /api/evidence/57/explanation'] = (409, 'Bằng chứng đã được thẩm định.');
    final router = await pumpFarmApp(tester, server, location: Routes.evidenceExplanation(57));

    await tester.enterText(find.byType(TextField), 'Giải trình');
    await tester.pump();
    await tester.ensureVisible(find.text('Gửi giải trình'));
    // Trong lúc người nuôi gõ, người thẩm định đã kết luận xong.
    server.flagged = [flaggedJson(status: 'Accepted')];
    await tester.tap(find.text('Gửi giải trình'));
    await tester.settle();

    expect(find.text('Bằng chứng đã được thẩm định.'), findsOneWidget);
    expect(find.widgetWithText(StatusPill, 'Chấp nhận'), findsOneWidget);
    expect(find.text('Ảnh không còn chờ thẩm định.'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.text('Gửi giải trình'), findsNothing);

    router.go(Routes.evidenceExplanation(0));
    await tester.settle();
    expect(find.text('Không tìm thấy ảnh này'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('danh sách trống và lỗi tải danh sách', (tester) async {
    final server = FarmServer()..failures['GET /api/operators/me/evidence'] = (503, 'Không tải được bằng chứng.');
    await pumpFarmApp(tester, server, location: Routes.flaggedEvidence);

    expect(find.text('Không tải được bằng chứng.'), findsOneWidget);
    server.failures.clear();
    await tester.tap(find.text('Thử lại'));
    await tester.settle();
    expect(find.text('Không có ảnh nào bị gắn cờ'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

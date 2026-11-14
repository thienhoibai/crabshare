import 'package:crabshare_mobile/features/qc/data/qc_models.dart';
import 'package:crabshare_mobile/features/qc/data/qc_repository.dart';
import 'package:crabshare_mobile/features/qc/data/site_visit_repository.dart';
import 'package:crabshare_mobile/features/qc/visits/box_picker.dart';
import 'package:crabshare_mobile/features/qc/visits/site_visit_report_page.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/qc_fakes.dart';

const _page = SiteVisitReportPage(assignmentId: 12);

List<Override> _overrides(FakeSiteVisitRepository repo, {bool assigned = true}) => [
  qcTaskRepositoryProvider.overrideWithValue(FakeTaskRepository([if (assigned) QcTask.fromJson(taskJson(12, 'SiteVisit'))])),
  siteVisitRepositoryProvider.overrideWithValue(repo),
];

Future<void> _fill(WidgetTester tester) async {
  await tester.tap(find.text('Chụp ảnh tại trại'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('A-01-01'));
  await tester.tap(find.text('A-01-02'));
  await tester.enterText(find.widgetWithText(TextField, 'Số cua đã thấy'), '240');
  await tester.enterText(find.widgetWithText(TextField, 'Nhận xét'), 'Cua khoẻ, nước trong.');
  await tester.pump();
}

Future<void> _send(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Gửi biên bản'));
  await tester.tap(find.text('Gửi biên bản'));
  await tester.pumpAndSettle();
  expect(find.text('2 hộp · 240 con. Gửi rồi không sửa được.'), findsOneWidget);
  await tester.tap(find.widgetWithText(FilledButton, 'Gửi biên bản').last);
  await tester.pumpAndSettle();
}

void main() {
  test('repository: the report is multipart with the field names of the C# request', () async {
    final adapter = QcAdapter((o) {
      if (o.method == 'POST') return reportJson();
      if (o.path.endsWith('/boxes')) {
        return [
          {'slotCode': 'A-01-01', 'slotStatus': 'Occupied', 'crabCode': 'CU00000001'},
          {'slotCode': 'A-01-02', 'slotStatus': 'Available', 'crabCode': null},
        ];
      }
      if (o.path.endsWith('/progress')) return {'batchCode': 'CS-2611-P1', 'status': 'InProduction', 'crabsAlive': 250, 'daysRaised': 30};
      return [reportJson(distance: null)];
    });
    final repo = ApiSiteVisitRepository(qcDio(adapter));

    final boxes = await repo.boxes('CS-2611-P1');
    expect([for (final b in boxes) (b.slotCode, b.occupied)], [('A-01-01', true), ('A-01-02', false)]);
    final progress = await repo.progress('CS-2611-P1');
    expect((progress.crabsAlive, progress.daysRaised), (250, 30));
    expect((await repo.reports('CS-2611-P1')).single.distanceToFarmM, isNull);

    final report = await repo.submit(
      12,
      SiteVisitInput(photo: qcPhoto(), boxCodes: const ['A-01-01', 'A-01-02'], crabsSeen: 240, findings: 'Cua khoẻ, nước trong.'),
    );
    expect((report.reportNo, report.distanceToFarmM, report.boxCodes.length, report.crabsSeen), ('TT0000000001', 120, 2, 240));

    expect(adapter.requests.map((r) => '${r.method} ${r.path}'), [
      'GET /api/batches/CS-2611-P1/boxes',
      'GET /api/batches/CS-2611-P1/progress',
      'GET /api/batches/CS-2611-P1/site-visits',
      'POST /api/qc/site-visits/12/report',
    ]);
    expect(formFields(adapter.requests.last), {
      'Latitude': '8.761234',
      'Longitude': '104.991234',
      'BoxCodes': 'A-01-01,A-01-02',
      'CrabsSeen': '240',
      'Findings': 'Cua khoẻ, nước trong.',
    });
    expect(formFiles(adapter.requests.last), ['Photo']);
  });

  testWidgets('the submit button lists what is missing, then the report is sent with the photo position', (tester) async {
    final repo = FakeSiteVisitRepository();
    await pumpQc(tester, _page, _overrides(repo));

    expect(find.text('Lô CS-2611-P1 · Cua gạch Năm Căn'), findsOneWidget);
    expect(find.text('Theo sổ: 250 con'), findsOneWidget);
    final submit = find.byType(FilledButton);
    expect(find.text('Còn thiếu: ảnh, hộp đã xem, số cua, nhận xét'), findsOneWidget);
    expect(tester.widget<FilledButton>(submit).onPressed, isNull);

    await tester.tap(find.text('Chụp ảnh tại trại'));
    await tester.pumpAndSettle();
    expect(find.text('Đã ghi vị trí lúc chụp'), findsOneWidget);
    expect(find.text('Còn thiếu: hộp đã xem, số cua, nhận xét'), findsOneWidget);
    await tester.tap(find.text('A-01-01'));
    await tester.tap(find.text('A-01-02'));
    await tester.pump();
    expect(find.text('Hộp đã xem · 2'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Số cua đã thấy'), '240');
    await tester.enterText(find.widgetWithText(TextField, 'Nhận xét'), 'Cua khoẻ, nước trong.');
    await tester.pump();
    await _send(tester);

    final (assignmentId, input) = repo.submitted.single;
    expect(assignmentId, 12);
    expect((input.boxCodesText, input.crabsSeen, input.findings), ('A-01-01,A-01-02', 240, 'Cua khoẻ, nước trong.'));
    expect((input.photo.latitude, input.photo.longitude), (8.761234, 104.991234));
    // Màn kết quả: số biên bản và khoảng cách tới trại do máy chủ tính.
    expect(find.text('Đã lập biên bản'), findsOneWidget);
    expect(find.text('TT0000000001'), findsOneWidget);
    expect(find.text('120 m'), findsOneWidget);
    expect(find.text('Về danh sách việc'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a report made away from the farm is refused and the form stays', (tester) async {
    final repo = FakeSiteVisitRepository()..fail = apiError('Vị trí chụp cách trại 3.200 m; biên bản phải lập tại trại (BR-233).', 422);
    await pumpQc(tester, _page, _overrides(repo));
    await _fill(tester);
    await _send(tester);

    expect(find.text('Vị trí chụp cách trại 3.200 m; biên bản phải lập tại trại.'), findsOneWidget);
    expect(find.text('Đã lập biên bản'), findsNothing);
    expect(find.text('Gửi biên bản'), findsOneWidget);
  });

  testWidgets('a farm with many boxes is searched by code and picked boxes stay on top', (tester) async {
    final repo = FakeSiteVisitRepository(boxCodes: [for (var i = 1; i <= 60; i++) 'B-${i.toString().padLeft(2, '0')}']);
    await pumpQc(tester, _page, _overrides(repo));

    expect(find.text('Còn 36 hộp khác, gõ mã để tìm.'), findsOneWidget);
    expect(find.text('B-57'), findsNothing);
    await tester.enterText(find.descendant(of: find.byType(BoxPicker), matching: find.byType(TextField)), 'b-57');
    await tester.pump();
    await tester.tap(find.text('B-57'));
    await tester.enterText(find.descendant(of: find.byType(BoxPicker), matching: find.byType(TextField)), '');
    await tester.pump();
    expect(find.text('B-57'), findsOneWidget);
    expect(find.text('Hộp đã xem · 1'), findsOneWidget);
  });

  testWidgets('small phone: the filled form lays out without overflow', (tester) async {
    await pumpQc(tester, _page, _overrides(FakeSiteVisitRepository()), size: smallPhone);
    await _fill(tester);
    await tester.ensureVisible(find.text('Gửi biên bản'));
    expect(tester.takeException(), isNull);
  });

  testWidgets('a visit that is done or not mine shows one sentence', (tester) async {
    await pumpQc(tester, _page, _overrides(FakeSiteVisitRepository(), assigned: false));
    expect(find.text('Việc này đã xong hoặc không phân cho bạn'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
  });
}

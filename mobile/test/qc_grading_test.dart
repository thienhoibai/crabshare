import 'package:crabshare_mobile/features/qc/data/grading_models.dart';
import 'package:crabshare_mobile/features/qc/data/grading_repository.dart';
import 'package:crabshare_mobile/features/qc/data/qc_models.dart';
import 'package:crabshare_mobile/features/qc/data/qc_repository.dart';
import 'package:crabshare_mobile/features/qc/grading/grading_batch_page.dart';
import 'package:crabshare_mobile/shared/widgets/app_parts.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/qc_fakes.dart';

const _page = GradingBatchPage(batchCode: 'CS-2611-P1');

GradeDecision _d(Map<String, dynamic> json) => GradeDecision.fromJson(json);

List<Override> _overrides(FakeGradingRepository repo, {String kind = 'GradingSession'}) => [
  qcTaskRepositoryProvider.overrideWithValue(FakeTaskRepository([QcTask.fromJson(taskJson(1, kind))])),
  gradingRepositoryProvider.overrideWithValue(repo),
];

void main() {
  test('repository: decision endpoints, JSON bodies and multipart field names', () async {
    final adapter = QcAdapter((o) {
      final path = o.path;
      if (path == '/api/grading/standards') return standardsJson();
      if (path.endsWith('/grading')) return summaryJson(draft: 2, hold: 1);
      if (path.endsWith('/grade-decisions')) return [decisionJson(holds: ['NearThreshold'])];
      if (path.contains('/measurement-sessions/')) return measurementsJson(decision: decisionJson(no: 'GD-CAL', version: 2));
      if (path.startsWith('/api/crab-units/')) return crabJson();
      return decisionJson(status: 'Approved', finalSize: 'XL', finalGrade: 'G1');
    });
    final repo = ApiGradingRepository(qcDio(adapter));

    expect((await repo.summary('CS-2611-P1')).waiting, 3);
    final first = (await repo.decisions('CS-2611-P1')).single;
    expect((first.crabCode, first.proposedSize, first.cIndex, first.isWaiting), ('CU00000001', 'XL', 0.661, true));
    expect(first.holdReasons, ['NearThreshold']);
    expect((await repo.crabHistory('CU00000001')).length, 1);
    final measured = await repo.measurements('MS-CU00000001');
    expect((measured.session.hasWhiteImage, measured.values.length, measured.inferences.single.isSimulated), (true, 2, true));
    expect((await repo.crab('CU00000001')).currentSlotCode, 'A-01-03');
    final set = (await repo.ruleSets()).single;
    expect((set.crabType, set.versionNo, set.nearThresholdPct, set.rules.length), ('RoeCrab', 1, 2.0, 3));

    final approved = await repo.approve('GD0000000001', finalGrade: 'G1', reason: 'Mai mềm');
    expect((approved.isApproved, approved.finalGrade), (true, 'G1'));
    await repo.hold('GD0000000001', 'Nghi yếu');
    await repo.confirmHold('GD0000000001');
    await repo.reject('GD0000000001', liveStatus: 'Dead', foodSafety: 'Fail', reason: 'Chết khi cân', photo: qcPhoto());
    await repo.revise('GD0000000001', finalSize: 'L', finalGrade: 'G1', reason: 'Mai có vết nứt', photo: qcPhoto());
    final remeasured = await repo.caliper('MS-CU00000001', lengthCm: 8.4);
    expect(remeasured.decision?.decisionNo, 'GD-CAL');

    final sent = adapter.requests.sublist(6);
    expect(sent.map((r) => '${r.method} ${r.path}'), [
      'POST /api/grade-decisions/GD0000000001/approve',
      'POST /api/grade-decisions/GD0000000001/hold',
      'POST /api/grade-decisions/GD0000000001/confirm-hold',
      'POST /api/grade-decisions/GD0000000001/reject',
      'POST /api/grade-decisions/GD0000000001/revise',
      'POST /api/measurement-sessions/MS-CU00000001/values',
    ]);
    expect(sent[0].data, {'finalGrade': 'G1', 'sensoryNote': null, 'reason': 'Mai mềm'});
    expect(sent[1].data, {'reason': 'Nghi yếu'});
    expect(formFields(sent[3]), {'LiveStatus': 'Dead', 'FoodSafety': 'Fail', 'Reason': 'Chết khi cân'});
    expect(formFiles(sent[3]), ['Photo']);
    expect(formFields(sent[4]), {'FinalSize': 'L', 'FinalGrade': 'G1', 'Reason': 'Mai có vết nứt'});
    expect(formFiles(sent[4]), ['Photo']);
    expect(sent[5].data, {'carapaceLengthCm': 8.4, 'carapaceWidthCm': null, 'edgeBandMm': null});
  });

  test('near threshold, allowed grades and my role follow the server rules', () {
    final set = GradeRuleSet.fromJson(Map<String, dynamic>.from((standardsJson().single['ruleSets'] as List).single as Map));
    final near = nearHits(_d(decisionJson(cIndex: 0.661)), set);
    expect([for (final h in near) (h.metric, h.bound)], [('CIndex', 0.66)]);
    expect(nearHits(_d(decisionJson(cIndex: 0.70)), set), isEmpty);
    expect(nearHits(_d(decisionJson(cIndex: 0.661)), null), isEmpty);

    expect(gradesUpTo('G1'), ['G1', 'BELOW']);
    expect(gradesUpTo(null), ['SPECIAL', 'G1', 'BELOW']);
    expect(sizesUpTo('L'), ['L', 'M', 'OUT']);
    expect(isSubstandardSpec('OUT', 'G1'), isTrue);

    final draft = _d(decisionJson());
    final held = _d(decisionJson(status: 'Hold', holds: ['QcHold'], heldBy: qcUserId));
    final heldByOther = _d(decisionJson(status: 'Hold', holds: ['QcHold'], heldBy: 99));
    expect(roleOf(draft, me: qcUserId, hasSession: true, hasSecond: false), DecisionRole.session);
    expect(roleOf(draft, me: qcUserId, hasSession: false, hasSecond: true), DecisionRole.none);
    expect(roleOf(held, me: qcUserId, hasSession: true, hasSecond: false), DecisionRole.holder);
    expect(roleOf(heldByOther, me: qcUserId, hasSession: false, hasSecond: true), DecisionRole.second);
  });

  testWidgets('one waiting crab at a time; lowering the grade needs a reason; then the next crab appears', (tester) async {
    final repo = FakeGradingRepository([
      _d(decisionJson(no: 'GD1', crab: 'CU00000001')),
      _d(decisionJson(no: 'GD2', crab: 'CU00000002', cIndex: 0.70, createdAt: '2026-11-12T03:05:00Z')),
    ], withImages: true);
    await pumpQc(tester, _page, _overrides(repo));

    expect(find.text('CU00000001'), findsOneWidget);
    expect(find.text('CU00000002'), findsNothing);
    expect(find.text('Con 1 / 2'), findsOneWidget);
    expect(find.text('Hộp A-01-03'), findsOneWidget);
    expect(find.text('Size XL'), findsOneWidget);
    expect(find.text('Đặc cấp'), findsOneWidget);
    expect(find.text('sát 0,66'), findsOneWidget);
    expect(find.byType(AuthImage), findsNWidgets(2));
    expect(find.text('Nhập thước kẹp'), findsNothing);

    await tester.tap(find.text('Duyệt'));
    await tester.pumpAndSettle();
    expect(find.text('Duyệt CU00000001'), findsOneWidget);
    await tester.tap(find.text('Cấp 1'));
    await tester.pump();
    // Hạ hạng mà chưa ghi lý do thì chưa duyệt được.
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Duyệt hạng')).onPressed, isNull);
    await tester.enterText(find.widgetWithText(TextField, 'Lý do hạ hạng'), 'Mai mềm');
    await tester.pump();
    await tester.tap(find.text('Duyệt hạng'));
    await tester.pumpAndSettle();

    expect(repo.calls, ['approve GD1']);
    expect((repo.approvedGrade, repo.approveReason), ('G1', 'Mai mềm'));
    expect(find.text('Đã duyệt CU00000001: Size XL · Cấp 1.'), findsOneWidget);
    expect(find.text('CU00000002'), findsOneWidget);
    expect(find.text('CU00000001'), findsNothing);
    expect(find.text('Chờ duyệt · 1'), findsOneWidget);
    expect(find.text('Đã xử lý · 1'), findsOneWidget);
    expect(find.text('sát 0,66'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('small phone: the card, its detail section and the sheets lay out without overflow', (tester) async {
    final repo = FakeGradingRepository([
      _d(decisionJson(no: 'GD1', status: 'Hold', holds: ['NearThreshold', 'LowConfidence', 'ImageQuality', 'SensoryPending'])),
      _d(decisionJson(no: 'GD2', crab: 'CU00000002', createdAt: '2026-11-12T03:05:00Z')),
    ], withImages: true);
    await pumpQc(tester, _page, _overrides(repo), size: smallPhone);

    Future<void> tapText(String text) async {
      await tester.ensureVisible(find.text(text));
      await tester.pumpAndSettle();
      await tester.tap(find.text(text));
      await tester.pumpAndSettle();
    }

    await tapText('Số đo, AI và lượt đo');
    expect(find.text('Cân của trạm'), findsOneWidget);
    expect(find.text('AI · đèn trắng'), findsOneWidget);
    expect(find.text('Trạm TRAM-01'), findsOneWidget);
    expect(find.text('Nhập thước kẹp'), findsOneWidget);

    await tapText('Loại bỏ');
    await tapText('Chụp ảnh con cua');
    expect(find.text('Bấm để chụp lại'), findsOneWidget);
    await tapText('Đóng');
    await tapText('Duyệt');
    await tapText('Dưới chuẩn');
    expect(find.text('Cua dưới chuẩn, không vào quy cách đặt trước.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('holding a crab hands it to the second inspector and moves on', (tester) async {
    final repo = FakeGradingRepository([
      _d(decisionJson(no: 'GD1', crab: 'CU00000001')),
      _d(decisionJson(no: 'GD2', crab: 'CU00000002', createdAt: '2026-11-12T03:05:00Z')),
    ]);
    await pumpQc(tester, _page, _overrides(repo));

    await tester.tap(find.text('Giữ lại'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Lý do'), 'Nghi yếu');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Giữ lại'));
    await tester.pumpAndSettle();

    expect(repo.calls, ['hold GD1 Nghi yếu']);
    expect(find.text('CU00000002'), findsOneWidget);
    // Con tôi đã giữ lại vẫn trong hàng chờ nhưng xếp sau và không còn nút.
    await tester.tap(find.byIcon(Icons.chevron_right_rounded));
    await tester.pumpAndSettle();
    expect(find.text('CU00000001'), findsOneWidget);
    expect(find.text('Bạn đã giữ lại con này. Chờ người kiểm thứ hai.'), findsOneWidget);
    expect(find.text('Duyệt'), findsNothing);
  });

  testWidgets('caliper required: the primary button is the caliper entry and the new proposal is followed', (tester) async {
    final repo = FakeGradingRepository([
      _d(decisionJson(no: 'GD1', crab: 'CU00000001', status: 'Hold', holds: ['CaliperRequired'], proposedGrade: null, cIndex: null, lengthCm: null)),
    ]);
    await pumpQc(tester, _page, _overrides(repo));

    expect(find.text('Cần đo thước kẹp'), findsOneWidget);
    expect(find.text('Chưa có hạng'), findsOneWidget);
    expect(find.text('Đo tay, không có ảnh'), findsOneWidget);
    expect(find.text('Duyệt'), findsNothing);
    await tester.tap(find.text('Nhập thước kẹp'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Dài mai, 1 đến 30'), '8,4');
    await tester.pump();
    await tester.tap(find.text('Ghi số đo'));
    await tester.pumpAndSettle();

    expect(repo.calls, ['caliper MS-CU00000001 8.4']);
    expect(find.text('Cấp 1'), findsOneWidget);
    expect(find.text('Duyệt'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('second inspector confirms the hold before approving or rejecting', (tester) async {
    final repo = FakeGradingRepository([
      _d(decisionJson(no: 'GD1', status: 'Hold', holds: ['QcHold'], heldBy: 99, reason: 'Nghi yếu')),
    ]);
    await pumpQc(tester, _page, _overrides(repo, kind: 'SecondReview'));

    expect(find.text('Lý do giữ lại: Nghi yếu'), findsOneWidget);
    expect(find.text('Duyệt'), findsNothing);
    await tester.tap(find.text('Xác nhận giữ'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Xác nhận giữ').last);
    await tester.pumpAndSettle();

    expect(repo.calls, ['confirm-hold GD1']);
    expect(find.text('Duyệt'), findsOneWidget);
    expect(find.text('Loại bỏ'), findsOneWidget);
    expect(find.text('Giữ lại'), findsNothing);
  });

  testWidgets('reject needs the condition, a reason and a photo', (tester) async {
    final repo = FakeGradingRepository([_d(decisionJson(no: 'GD1'))]);
    await pumpQc(tester, _page, _overrides(repo));

    await tester.tap(find.text('Loại bỏ'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đã chết'));
    await tester.tap(find.text('Không an toàn'));
    await tester.enterText(find.widgetWithText(TextField, 'Lý do'), 'Chết khi cân');
    await tester.pump();
    final confirm = find.widgetWithText(FilledButton, 'Loại bỏ');
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull);

    await tester.tap(find.text('Chụp ảnh con cua'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(confirm);
    await tester.tap(confirm);
    await tester.pumpAndSettle();

    expect(repo.calls, ['reject GD1 Dead Fail']);
    expect(find.text('Không có con nào chờ duyệt'), findsOneWidget);
    expect(find.text('Còn 4 con chưa đo ở trạm.'), findsOneWidget);
  });

  testWidgets('handled tab: change size or grade with a photo and a reason', (tester) async {
    final repo = FakeGradingRepository([_d(decisionJson(no: 'GD1', status: 'Approved', finalSize: 'XL', finalGrade: 'SPECIAL'))]);
    await pumpQc(tester, _page, _overrides(repo), size: smallPhone);
    Future<void> tapText(String text) async {
      await tester.ensureVisible(find.text(text));
      await tester.pumpAndSettle();
      await tester.tap(find.text(text));
      await tester.pumpAndSettle();
    }

    await tapText('Đã xử lý · 1');
    await tapText('CU00000001');
    await tapText('Chi tiết');
    expect(find.text('ROE-XL-SPECIAL'), findsOneWidget);
    await tapText('Đổi size/hạng');

    expect(find.text('Hiện tại: Size XL · Đặc cấp'), findsOneWidget);
    await tapText('Cấp 1');
    await tester.enterText(find.widgetWithText(TextField, 'Lý do'), 'Mai có vết nứt');
    await tapText('Chụp ảnh căn cứ');
    await tapText('Lưu');

    expect(repo.calls, ['revise GD1 XL G1']);
    expect(find.text('406 g · phiên bản 2'), findsOneWidget);
    expect(find.text('Cấp 1'), findsOneWidget);
  });
}

import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/features/account/account_page.dart';
import 'package:crabshare_mobile/features/qc/data/grading_models.dart';
import 'package:crabshare_mobile/features/qc/data/grading_repository.dart';
import 'package:crabshare_mobile/features/qc/data/incoming_repository.dart';
import 'package:crabshare_mobile/features/qc/data/qc_models.dart';
import 'package:crabshare_mobile/features/qc/data/qc_repository.dart';
import 'package:crabshare_mobile/features/qc/data/site_visit_repository.dart';
import 'package:crabshare_mobile/features/qc/grading/grading_list_page.dart';
import 'package:crabshare_mobile/features/qc/incoming/incoming_list_page.dart';
import 'package:crabshare_mobile/features/qc/qc_routes.dart';
import 'package:crabshare_mobile/features/qc/tasks/qc_tasks_page.dart';
import 'package:crabshare_mobile/features/qc/visits/site_visits_page.dart';
import 'package:crabshare_mobile/features/qc/widgets/task_rows.dart';
import 'package:crabshare_mobile/shared/widgets/nav_shell.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/qc_fakes.dart';

List<QcTask> _tasks() => [
  QcTask.fromJson(taskJson(1, 'IncomingInspection', targetId: 40)),
  QcTask.fromJson(taskJson(2, 'GradingSession')),
  QcTask.fromJson(taskJson(3, 'SecondReview', targetId: 501)),
  QcTask.fromJson(taskJson(4, 'SecondReview', targetId: 502)),
  QcTask.fromJson(taskJson(5, 'SiteVisit')),
  QcTask.fromJson(taskJson(6, 'Dispatch')),
];

List<Override> _overrides(List<QcTask> tasks) => [
  qcTaskRepositoryProvider.overrideWithValue(FakeTaskRepository(tasks)),
  incomingRepositoryProvider.overrideWithValue(FakeIncomingRepository(GoodsReceipt.fromJson(receiptJson(declared: 40, accepted: 10, rejected: 2)))),
  gradingRepositoryProvider.overrideWithValue(
    FakeGradingRepository([
      GradeDecision.fromJson(decisionJson(no: 'GD1', crab: 'CU00000001')),
      GradeDecision.fromJson(decisionJson(no: 'GD2', crab: 'CU00000002', createdAt: '2026-11-12T03:05:00Z')),
    ]),
  ),
  siteVisitRepositoryProvider.overrideWithValue(FakeSiteVisitRepository()),
];

void main() {
  test('repository reads my tasks and the public batch head', () async {
    final adapter = QcAdapter((o) => o.path == '/api/qc/tasks' ? [taskJson(5, 'SiteVisit', targetId: 9)] : batchJson());
    final repo = ApiQcTaskRepository(qcDio(adapter));

    final task = (await repo.tasks()).single;
    expect((task.assignmentId, task.kind, task.batchCode, task.targetId), (5, 'SiteVisit', 'CS-2611-P1', 9));
    expect(task.assignedAt, DateTime.utc(2026, 11, 12, 2));

    final head = await repo.batchHead('CS-2611-P1');
    expect((head.title, head.crabType, head.executorName), ('Cua gạch Năm Căn', 'RoeCrab', 'Trại Út Hiền'));
    expect(adapter.requests.map((r) => '${r.method} ${r.path}'), ['GET /api/qc/tasks', 'GET /api/batches/CS-2611-P1']);
  });

  test('an incoming task finds its receipt number among my open receipts of the batch', () {
    final receipts = [
      GoodsReceipt.fromJson(receiptJson(no: 'GR-DONE', status: 'Completed')),
      GoodsReceipt.fromJson(receiptJson(no: 'GR-OTHER', qcUser: 99)),
      GoodsReceipt.fromJson(receiptJson(no: 'GR-A')),
      GoodsReceipt.fromJson(receiptJson(no: 'GR-B')),
    ];
    final tasks = [
      QcTask.fromJson(taskJson(2, 'IncomingInspection', targetId: 41)),
      QcTask.fromJson(taskJson(1, 'IncomingInspection', targetId: 40)),
      QcTask.fromJson(taskJson(3, 'IncomingInspection', targetId: 42)),
    ];
    final rows = matchReceipts(tasks, receipts, qcUserId);
    expect([for (final r in rows) (r.task.assignmentId, r.receipt?.receiptNo)], [(1, 'GR-A'), (2, 'GR-B'), (3, null)]);
  });

  test('server messages lose their rule numbers; numbers use the Vietnamese comma', () {
    expect(qcErrorMessage(apiError('Bạn không được phân công thăm trại này (BR-017, BR-233).')), 'Bạn không được phân công thăm trại này.');
    expect(formatNum(412.34, 1), '412,3');
    expect(formatNum(null), '—');
    expect(parseDecimal('412,5'), 412.5);
  });

  testWidgets('tasks tab: four counts and the rows grouped by kind', (tester) async {
    await pumpQc(tester, const QcTasksPage(), _overrides(_tasks()));

    expect(find.text('Việc được giao'), findsOneWidget);
    // Bốn ô số: nhãn loại việc xuất hiện ở ô số và ở tên nhóm.
    for (final label in ['Kiểm đầu vào', 'Duyệt phân hạng', 'Xác nhận lần hai', 'Thăm trại giữa vụ']) {
      expect(find.text(label), findsNWidgets(2), reason: label);
    }
    expect(find.byType(IncomingTaskRow), findsOneWidget);
    expect(find.text('GR0000000001'), findsOneWidget);
    expect(find.text('12 / 40 con · loại 2', findRichText: true), findsOneWidget);
    // Hai việc xác nhận lần hai của cùng một Lô gom thành một hàng.
    expect(find.byType(GradingTaskRow), findsNWidgets(2));
    expect(find.text('2 chờ xác nhận'), findsOneWidget);
    expect(find.text('2 chờ duyệt'), findsOneWidget);
    expect(find.byType(VisitTaskRow), findsOneWidget);
    expect(find.text('Việc khác · 1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('small phone: the task rows lay out without overflow', (tester) async {
    await pumpQc(tester, const QcTasksPage(), _overrides(_tasks()), size: smallPhone);
    expect(find.byType(GradingTaskRow), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('tasks tab: one sentence when nothing waits', (tester) async {
    await pumpQc(tester, const QcTasksPage(), _overrides(const []));
    expect(find.text('Chưa có việc nào chờ bạn'), findsOneWidget);
    expect(find.byType(GradingTaskRow), findsNothing);
  });

  testWidgets('list tabs show only their kinds', (tester) async {
    await pumpQc(tester, const IncomingListPage(), _overrides(_tasks()));
    expect(find.byType(IncomingTaskRow), findsOneWidget);
    expect(find.byType(GradingTaskRow), findsNothing);

    await pumpQc(tester, const GradingListPage(), _overrides(_tasks()));
    expect(find.byType(GradingTaskRow), findsNWidgets(2));
    expect(find.text('Mở Lô khác theo mã'), findsOneWidget);

    await pumpQc(tester, const SiteVisitsPage(), _overrides(const []));
    expect(find.text('Chưa có lần thăm trại nào được phân cho bạn'), findsOneWidget);
  });

  testWidgets('routes: four tabs with the account tab, centre button opens site visits, rows open work screens', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final router = GoRouter(initialLocation: Routes.qcTasks, routes: qcRoutes());
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [...qcBaseOverrides(), ..._overrides(_tasks())],
        child: MaterialApp.router(theme: buildAppTheme(), routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(NavShell), findsOneWidget);
    expect(find.byType(QcTasksPage), findsOneWidget);

    router.go(Routes.qcIncoming);
    await tester.pumpAndSettle();
    expect(find.byType(IncomingListPage), findsOneWidget);
    router.go(Routes.qcGrading);
    await tester.pumpAndSettle();
    expect(find.byType(GradingListPage), findsOneWidget);
    router.go(Routes.qcAccount);
    await tester.pumpAndSettle();
    expect(find.byType(AccountPage), findsOneWidget);
    expect(find.text('Lê Kiểm'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.place_rounded));
    await tester.pumpAndSettle();
    expect(find.byType(SiteVisitsPage), findsOneWidget);
    await tester.tap(find.byType(VisitTaskRow));
    await tester.pumpAndSettle();
    expect(router.state.uri.toString(), Routes.qcSiteVisit(5, batchCode: 'CS-2611-P1'));
    expect(find.text('Còn thiếu: ảnh, hộp đã xem, số cua, nhận xét'), findsOneWidget);

    router.go(Routes.qcReceipt('GR0000000001', batchCode: 'CS-2611-P1'));
    await tester.pumpAndSettle();
    expect(find.text('Đã kiểm 12 / 40 con'), findsOneWidget);
    router.go(Routes.qcGradingBatch('CS-2611-P1'));
    await tester.pumpAndSettle();
    expect(find.text('Con 1 / 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/routes.dart';
import '../../shared/widgets/app_ui.dart';
import '../../shared/widgets/nav_shell.dart';
import '../account/account_page.dart';
import 'data/qc_models.dart';
import 'data/qc_repository.dart';
import 'grading/grading_batch_page.dart';
import 'grading/grading_list_page.dart';
import 'incoming/incoming_list_page.dart';
import 'incoming/receipt_page.dart';
import 'tasks/qc_tasks_page.dart';
import 'visits/site_visit_report_page.dart';
import 'visits/site_visits_page.dart';

/// Khu Nhân viên kiểm phẩm (/q). Bốn tab: Việc, Đầu vào, Phân hạng, Tài khoản; nút giữa mở Thăm trại.
///   /q/tasks                    tasks/qc_tasks_page.dart
///   /q/incoming                 incoming/incoming_list_page.dart
///   /q/incoming/:receiptNo      incoming/receipt_page.dart (?batch= mã Lô)
///   /q/grading                  grading/grading_list_page.dart
///   /q/grading/:batchCode       grading/grading_batch_page.dart
///   /q/visits                   visits/site_visits_page.dart
///   /q/visits/:assignmentId     visits/site_visit_report_page.dart
List<RouteBase> qcRoutes() => [
  StatefulShellRoute.indexedStack(
    builder: (context, state, shell) => Consumer(
      builder: (context, ref, child) {
        final tasks = ref.watch(qcTasksProvider).value ?? const <QcTask>[];
        int count(List<String> kinds) => tasks.where((t) => kinds.contains(t.kind)).length;
        return NavShell(
          shell: shell,
          items: [
            NavItem(Icons.checklist_rounded, 'Việc', badgeCount: tasks.length),
            NavItem(Icons.fact_check_outlined, 'Đầu vào', badgeCount: count(const [QcKinds.incoming])),
            NavItem(Icons.straighten_rounded, 'Phân hạng', badgeCount: count(const [QcKinds.grading, QcKinds.second])),
            const NavItem(Icons.person_rounded, 'Tài khoản'),
          ],
          centerIcon: Icons.place_rounded,
          centerLabel: 'Thăm trại',
          onCenter: () => context.push(Routes.qcSiteVisits),
        );
      },
    ),
    branches: [
      StatefulShellBranch(routes: [GoRoute(path: Routes.qcTasks, builder: (context, state) => const QcTasksPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.qcIncoming, builder: (context, state) => const IncomingListPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.qcGrading, builder: (context, state) => const GradingListPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.qcAccount, builder: (context, state) => const AccountPage())]),
    ],
  ),
  GoRoute(
    path: '${Routes.qcIncoming}/:receiptNo',
    builder: (context, state) =>
        IncomingReceiptPage(receiptNo: state.pathParameters['receiptNo']!, batchCode: state.uri.queryParameters['batch']),
  ),
  GoRoute(
    path: '${Routes.qcGrading}/:batchCode',
    builder: (context, state) => GradingBatchPage(batchCode: state.pathParameters['batchCode']!),
  ),
  GoRoute(path: Routes.qcSiteVisits, builder: (context, state) => const SiteVisitsPage()),
  GoRoute(
    path: '${Routes.qcSiteVisits}/:assignmentId',
    builder: (context, state) {
      final id = int.tryParse(state.pathParameters['assignmentId']!);
      return id == null
          ? const Scaffold(
              body: SafeArea(child: EmptyState(icon: Icons.place_outlined, title: 'Không tìm thấy việc thăm trại này')),
            )
          : SiteVisitReportPage(assignmentId: id);
    },
  ),
];

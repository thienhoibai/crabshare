import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/session.dart';
import '../features/account/account_page.dart';
import '../features/auth/login_page.dart';
import '../features/common/unsupported_role_page.dart';
import '../features/investor/batches/batch_detail_page.dart';
import '../features/investor/batches/batch_explore_page.dart';
import '../features/investor/home/investor_home_page.dart';
import '../features/investor/kyc/kyc_page.dart';
import '../features/investor/notifications/notifications_page.dart';
import '../features/onboarding/onboarding_page.dart';
import '../features/operator/alerts/alerts_page.dart';
import '../features/operator/evidence/capture_page.dart';
import '../features/operator/harvest/harvest_page.dart';
import '../features/operator/logs/daily_log_form_page.dart';
import '../features/operator/logs/daily_logs_page.dart';
import '../features/operator/today/operator_today_page.dart';
import '../features/trace/scan_page.dart';
import '../features/trace/trace_result_page.dart';
import '../shared/widgets/nav_shell.dart';
import 'routes.dart';

/// Trang chủ theo vai trò. Một người vừa là hộ nuôi vừa là nhà đầu tư thì ưu tiên giao diện hộ nuôi.
String homeFor(AppUser user) {
  if (user.isOperator) return Routes.operatorToday;
  if (user.isInvestor) return Routes.investorHome;
  return Routes.unsupported;
}

/// Quy tắc chuyển trang — tách riêng để viết unit test (test/router_redirect_test.dart).
String? redirectFor(SessionState session, String location) {
  final isPublic = location == Routes.onboarding || location == Routes.login || location == Routes.scan || location.startsWith('/trace/');
  final user = session.user;
  if (!session.isSignedIn || user == null) return isPublic ? null : Routes.onboarding;
  if (location == Routes.onboarding || location == Routes.login) return homeFor(user);
  if (location.startsWith('/o/') && !user.isOperator) return homeFor(user);
  if (location.startsWith('/i/') && !user.isInvestor) return homeFor(user);
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  // Mỗi lần đăng nhập / đăng xuất thì router chạy lại redirect.
  final refresh = ValueNotifier(0);
  ref.listen(sessionProvider, (previous, next) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: Routes.onboarding,
    refreshListenable: refresh,
    redirect: (context, state) => redirectFor(ref.read(sessionProvider), state.matchedLocation),
    routes: [
      GoRoute(path: Routes.onboarding, builder: (context, state) => const OnboardingPage()),
      GoRoute(path: Routes.login, builder: (context, state) => const LoginPage()),
      GoRoute(path: Routes.scan, builder: (context, state) => const ScanPage()),
      GoRoute(path: '/trace/:tagCode', builder: (context, state) => TraceResultPage(tagCode: state.pathParameters['tagCode']!)),
      GoRoute(path: Routes.unsupported, builder: (context, state) => const UnsupportedRolePage()),
      GoRoute(path: '/batches/:code', builder: (context, state) => BatchDetailPage(code: state.pathParameters['code']!)),

      // ---------- Nhà đầu tư ----------
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => NavShell(
          shell: shell,
          items: const [
            NavItem(Icons.home_rounded, 'Tổng quan'),
            NavItem(Icons.grid_view_rounded, 'Lô nuôi'),
            NavItem(Icons.notifications_rounded, 'Thông báo'),
            NavItem(Icons.person_rounded, 'Tài khoản'),
          ],
          centerIcon: Icons.qr_code_scanner_rounded,
          centerLabel: 'Quét tem',
          onCenter: () => context.push(Routes.scan),
        ),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: Routes.investorHome, builder: (context, state) => const InvestorHomePage())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.investorBatches, builder: (context, state) => const BatchExplorePage())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.investorNotifications, builder: (context, state) => const NotificationsPage())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.investorAccount, builder: (context, state) => const AccountPage())]),
        ],
      ),
      GoRoute(path: Routes.kyc, builder: (context, state) => const KycPage()),

      // ---------- Hộ nuôi ----------
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => NavShell(
          shell: shell,
          items: const [
            NavItem(Icons.today_rounded, 'Hôm nay'),
            NavItem(Icons.edit_note_rounded, 'Nhật ký'),
            NavItem(Icons.warning_amber_rounded, 'Cảnh báo'),
            NavItem(Icons.person_rounded, 'Tài khoản'),
          ],
          centerIcon: Icons.photo_camera_rounded,
          centerLabel: 'Chụp bằng chứng',
          onCenter: () => context.push(Routes.capture),
        ),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: Routes.operatorToday, builder: (context, state) => const OperatorTodayPage())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.operatorLogs, builder: (context, state) => const DailyLogsPage())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.operatorAlerts, builder: (context, state) => const AlertsPage())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.operatorAccount, builder: (context, state) => const AccountPage())]),
        ],
      ),
      GoRoute(
        path: Routes.dailyLogNew,
        builder: (context, state) => DailyLogFormPage(initialBatchCode: state.uri.queryParameters['batch']),
      ),
      GoRoute(
        path: Routes.capture,
        builder: (context, state) => CapturePage(initialSlot: state.uri.queryParameters['slot']),
      ),
      GoRoute(path: '/o/harvest/:batchCode', builder: (context, state) => HarvestPage(batchCode: state.pathParameters['batchCode']!)),
    ],
  );
});

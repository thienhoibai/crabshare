import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/session.dart';
import '../features/account/payout_account_page.dart';
import '../features/auth/login_page.dart';
import '../features/common/unsupported_role_page.dart';
import '../features/customer/customer_routes.dart';
import '../features/investor/investor_routes.dart';
import '../features/onboarding/onboarding_page.dart';
import '../features/operator/operator_routes.dart';
import '../features/qc/qc_routes.dart';
import '../features/trace/trace_routes.dart';
import 'routes.dart';

/// Trang chủ theo vai trò. Người có nhiều vai vào khu ưu tiên trước rồi đổi khu ở tab Tài khoản.
String homeFor(AppUser user) {
  if (user.isOperator) return Routes.operatorToday;
  if (user.isQc) return Routes.qcTasks;
  if (user.isInvestor) return Routes.investorHome;
  if (user.isCustomer) return Routes.customerOrders;
  return Routes.unsupported;
}

/// Các khu mà một người dùng vào được: (nhãn, đường dẫn trang chủ của khu).
List<(String, String)> areasFor(AppUser user) => [
  if (user.isOperator) ('Người nuôi', Routes.operatorToday),
  if (user.isQc) ('Nhân viên kiểm phẩm', Routes.qcTasks),
  if (user.isInvestor) ('Nhà đầu tư', Routes.investorHome),
  if (user.isCustomer) ('Khách hàng', Routes.customerOrders),
];

/// Quy tắc chuyển trang, tách riêng để viết unit test (test/router_redirect_test.dart).
String? redirectFor(SessionState session, String location) {
  final isPublic =
      location == Routes.onboarding || location == Routes.login || location == Routes.scan || location.startsWith('/trace/');
  final user = session.user;
  if (!session.isSignedIn || user == null) {
    return isPublic ? null : Routes.onboarding;
  }
  if (location == Routes.onboarding || location == Routes.login) {
    return homeFor(user);
  }
  if (location.startsWith('/o/') && !user.isOperator) return homeFor(user);
  if (location.startsWith('/q/') && !user.isQc) return homeFor(user);
  if (location.startsWith('/i/') && !user.isInvestor) return homeFor(user);
  if (location.startsWith('/c/') && !user.isCustomer) return homeFor(user);
  if (location == Routes.payoutAccount && !user.isInvestor && !user.isOperator) {
    return homeFor(user);
  }
  return null;
}

/// Bản đồ màn hình. Mỗi khu khai route trong tệp riêng:
///   công khai (quét QR đơn)   features/trace/trace_routes.dart
///   nhà đầu tư /i             features/investor/investor_routes.dart
///   người nuôi /o             features/operator/operator_routes.dart
///   kiểm phẩm /q              features/qc/qc_routes.dart
///   khách hàng /c             features/customer/customer_routes.dart
final routerProvider = Provider<GoRouter>((ref) {
  // Mỗi lần đăng nhập hoặc đăng xuất thì router chạy lại redirect.
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
      GoRoute(path: Routes.unsupported, builder: (context, state) => const UnsupportedRolePage()),
      GoRoute(path: Routes.payoutAccount, builder: (context, state) => const PayoutAccountPage()),
      ...traceRoutes(),
      ...investorRoutes(),
      ...operatorRoutes(),
      ...qcRoutes(),
      ...customerRoutes(),
    ],
  );
});

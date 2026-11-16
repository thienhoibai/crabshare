import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/routes.dart';
import '../../shared/widgets/nav_shell.dart';
import '../account/account_page.dart';
import 'batches/batch_detail_page.dart';
import 'batches/batch_explore_page.dart';
import 'contracts/contracts_page.dart';
import 'home/investor_home_page.dart';
import 'kyc/kyc_page.dart';
import 'notifications/notification_repository.dart';
import 'notifications/notifications_page.dart';
import 'portfolio/portfolio_detail_page.dart';
import 'settlement/settlement_statement_page.dart';
import 'settlement/settlements_page.dart';
import 'votes/votes_page.dart';

/// Đường dẫn màn con của khu nhà đầu tư (các đường dẫn khu khác cần biết nằm ở `Routes`).
abstract final class InvestorRoutes {
  static const contracts = '/i/contracts';
  static const votes = '/i/votes';
  static const settlements = '/i/settlements';
  static String settlement(int id) => '/i/settlements/$id';

  /// Mở Lô tôi đã góp ở một mục: `khoan-gop`, `nhat-trinh`, `thiet-bi`, `bieu-quyet`, `quyet-toan`.
  static String portfolioTab(String code, String tab) => '${Routes.portfolioBatch(code)}?tab=$tab';
}

/// Khu nhà đầu tư (/i) và trang công khai của một Lô (/batches/:code, khách hàng cũng mở được).
List<RouteBase> investorRoutes() => [
  GoRoute(
    path: '/batches/:code',
    builder: (context, state) => BatchDetailPage(code: state.pathParameters['code']!),
  ),
  StatefulShellRoute.indexedStack(
    builder: (context, state, shell) => Consumer(
      builder: (context, ref, child) => NavShell(
        shell: shell,
        items: [
          const NavItem(Icons.home_rounded, 'Tổng quan'),
          const NavItem(Icons.grid_view_rounded, 'Lô'),
          NavItem(Icons.notifications_rounded, 'Thông báo', badgeCount: ref.watch(unreadNotificationsProvider)),
          const NavItem(Icons.person_rounded, 'Tài khoản'),
        ],
        centerIcon: Icons.qr_code_scanner_rounded,
        centerLabel: 'Quét QR đơn',
        onCenter: () => context.push(Routes.scan),
      ),
    ),
    branches: [
      StatefulShellBranch(routes: [GoRoute(path: Routes.investorHome, builder: (context, state) => const InvestorHomePage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.investorBatches, builder: (context, state) => const BatchExplorePage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.investorNotifications, builder: (context, state) => const NotificationsPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.investorAccount, builder: (context, state) => const AccountPage())]),
    ],
  ),
  GoRoute(path: Routes.kyc, builder: (context, state) => const KycPage()),
  GoRoute(
    path: '/i/portfolio/:code',
    builder: (context, state) => PortfolioDetailPage(
      code: state.pathParameters['code']!,
      initialTab: state.uri.queryParameters['tab'],
    ),
  ),
  GoRoute(path: InvestorRoutes.contracts, builder: (context, state) => const ContractsPage()),
  GoRoute(path: InvestorRoutes.votes, builder: (context, state) => const VotesPage()),
  GoRoute(path: InvestorRoutes.settlements, builder: (context, state) => const SettlementsPage()),
  GoRoute(
    path: '/i/settlements/:id',
    builder: (context, state) => SettlementStatementPage(id: int.tryParse(state.pathParameters['id']!) ?? 0),
  ),
];

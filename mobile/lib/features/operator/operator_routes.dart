import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/routes.dart';
import '../../shared/widgets/nav_shell.dart';
import '../account/account_page.dart';
import 'batches/operator_batches_page.dart';
import 'delivery/deliveries_page.dart';
import 'operator_core_routes.dart';
import 'operator_work_routes.dart';
import 'today/operator_today_page.dart';

/// Khu người nuôi (/o). Bốn tab: Hôm nay, Lô, Giao hàng, Tài khoản; nút giữa mở camera chụp ảnh tại hộp.
/// Màn con khai ở operator_core_routes.dart (lưu nuôi, nhật ký, cảnh báo, bằng chứng)
/// và operator_work_routes.dart (đo cua, giao hàng).
List<RouteBase> operatorRoutes() => [
  StatefulShellRoute.indexedStack(
    builder: (context, state, shell) => NavShell(
      shell: shell,
      items: const [
        NavItem(Icons.today_rounded, 'Hôm nay'),
        NavItem(Icons.grid_view_rounded, 'Lô'),
        NavItem(Icons.local_shipping_rounded, 'Giao hàng'),
        NavItem(Icons.person_rounded, 'Tài khoản'),
      ],
      centerIcon: Icons.photo_camera_rounded,
      centerLabel: 'Chụp ảnh tại hộp',
      onCenter: () => context.push(Routes.capture),
    ),
    branches: [
      StatefulShellBranch(routes: [GoRoute(path: Routes.operatorToday, builder: (context, state) => const OperatorTodayPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.operatorBatches, builder: (context, state) => const OperatorBatchesPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.operatorDeliveries, builder: (context, state) => const DeliveriesPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.operatorAccount, builder: (context, state) => const AccountPage())]),
    ],
  ),
  ...operatorCoreRoutes(),
  ...operatorWorkRoutes(),
];

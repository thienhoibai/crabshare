import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/routes.dart';
import '../../shared/widgets/nav_shell.dart';
import '../account/account_page.dart';
import 'batches/batches_page.dart';
import 'claims/claim_detail_page.dart';
import 'claims/claim_form_page.dart';
import 'data/customer_models.dart';
import 'data/customer_providers.dart';
import 'deliveries/deliveries_page.dart';
import 'orders/order_page.dart';
import 'orders/orders_page.dart';

/// Đường dẫn màn con của khu khách hàng (các đường dẫn khu khác cần biết nằm ở `Routes`).
abstract final class CustomerRoutes {
  /// Báo vấn đề về hàng đã nhận của một đơn; [shipmentNo] chọn sẵn một chuyến giao.
  static String claimNew(String orderNo, {String? shipmentNo}) => Uri(
    path: '/c/orders/${Uri.encodeComponent(orderNo)}/claim',
    queryParameters: shipmentNo == null ? null : {'shipment': shipmentNo},
  ).toString();

  /// Chi tiết một khiếu nại.
  static String claim(String claimNo) => '/c/claims/${Uri.encodeComponent(claimNo)}';
}

/// Khu khách hàng (/c): bốn tab Đơn, Lô, Giao hàng, Tài khoản và nút giữa quét QR đơn;
/// màn một đơn, báo vấn đề và chi tiết khiếu nại mở chồng lên trên.
List<RouteBase> customerRoutes() => [
  StatefulShellRoute.indexedStack(
    builder: (context, state, shell) => Consumer(
      builder: (context, ref, child) {
        final waiting = (ref.watch(myShipmentsProvider).value ?? const <Shipment>[])
            .where((s) => s.stage == ShipmentStage.accept || s.stage == ShipmentStage.pay)
            .length;
        return NavShell(
          shell: shell,
          items: [
            const NavItem(Icons.receipt_long_rounded, 'Đơn'),
            const NavItem(Icons.grid_view_rounded, 'Lô'),
            NavItem(Icons.local_shipping_rounded, 'Giao hàng', badgeCount: waiting),
            const NavItem(Icons.person_rounded, 'Tài khoản'),
          ],
          centerIcon: Icons.qr_code_scanner_rounded,
          centerLabel: 'Quét QR đơn',
          onCenter: () => context.push(Routes.scan),
        );
      },
    ),
    branches: [
      StatefulShellBranch(routes: [GoRoute(path: Routes.customerOrders, builder: (context, state) => const CustomerOrdersPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.customerBatches, builder: (context, state) => const CustomerBatchesPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.customerDeliveries, builder: (context, state) => const CustomerDeliveriesPage())]),
      StatefulShellBranch(routes: [GoRoute(path: Routes.customerAccount, builder: (context, state) => const AccountPage())]),
    ],
  ),
  GoRoute(
    path: '/c/orders/:orderNo',
    builder: (context, state) => CustomerOrderPage(orderNo: state.pathParameters['orderNo']!),
  ),
  GoRoute(
    path: '/c/orders/:orderNo/claim',
    builder: (context, state) =>
        ClaimFormPage(orderNo: state.pathParameters['orderNo']!, shipmentNo: state.uri.queryParameters['shipment']),
  ),
  GoRoute(
    path: '/c/claims/:claimNo',
    builder: (context, state) => ClaimDetailPage(claimNo: state.pathParameters['claimNo']!),
  ),
];

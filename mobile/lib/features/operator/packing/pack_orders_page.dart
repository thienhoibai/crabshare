import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_repository.dart';
import '../data/packing_models.dart';

/// Danh sách đơn Paid cần đóng gói (UC29).
class PackOrdersPage extends ConsumerWidget {
  const PackOrdersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersToPackProvider);
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => ref.refresh(ordersToPackProvider.future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Đóng gói đơn'),
              const SizedBox(height: 8),
              Text('Quét tem từng con cua cho đơn đã thanh toán.', style: Theme.of(context).textTheme.bodySmall),
              ...orders.when(
                loading: () => [const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))],
                error: (e, _) => [Padding(padding: const EdgeInsets.only(top: 16), child: Text('$e'))],
                data: (list) => [
                  if (list.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 24),
                      child: Text('Không có đơn chờ đóng gói.'),
                    ),
                  for (final order in list) ...[
                    const SizedBox(height: 12),
                    _OrderTile(order: order),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order});

  final OperatorOrderSummary order;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () => context.push(Routes.operatorPackOrder(order.orderNo)),
      child: Row(
        children: [
          const IconTile(icon: Icons.inventory_2_outlined),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(order.orderNo, style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                Text(
                  '${order.customerName} · ${order.batchCode} · ${order.totalKg.toString().replaceAll('.', ',')} kg',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          Text(formatVnd(order.totalAmount), style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

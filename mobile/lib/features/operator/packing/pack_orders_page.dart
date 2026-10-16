import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_orders_repository.dart';
import '../data/packing_models.dart';

/// Đơn của hộ nuôi theo trạng thái: đóng gói (UC29), giao cho nhà xe và báo đã giao (UC30).
class PackOrdersPage extends ConsumerStatefulWidget {
  const PackOrdersPage({super.key});

  @override
  ConsumerState<PackOrdersPage> createState() => _PackOrdersPageState();
}

class _PackOrdersPageState extends ConsumerState<PackOrdersPage> {
  String _status = 'Paid';

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(operatorOrdersProvider(_status));
    return Scaffold(
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(operatorOrdersProvider(_status).future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Đơn hàng'),
              const SizedBox(height: 8),
              Text(
                'Quét tem để đóng gói, giao cho nhà xe rồi báo đã giao.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final entry in operatorOrderStatusLabels.entries) ...[
                      ChoiceChip(
                        label: Text(entry.value),
                        selected: _status == entry.key,
                        onSelected: (_) => setState(() => _status = entry.key),
                      ),
                      const SizedBox(width: 8),
                    ],
                  ],
                ),
              ),
              ...orders.when(
                loading: () => [const LoadingSkeleton(rows: 2)],
                error: (e, _) => [
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(apiErrorMessage(e)),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: () =>
                        ref.invalidate(operatorOrdersProvider(_status)),
                    child: const Text('Thử lại'),
                  ),
                ],
                data: (list) => [
                  if (list.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 24),
                      child: Text(
                        'Không có đơn ${operatorOrderStatusLabel(_status).toLowerCase()}.',
                      ),
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
                Text(
                  order.orderNo,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
                ),
                Text(
                  '${operatorOrderStatusLabel(order.status)} · ${order.customerName} · ${order.batchCode} · ${order.totalKg.toString().replaceAll('.', ',')} kg',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          Text(
            formatVnd(order.totalAmount),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

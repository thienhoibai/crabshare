import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/json.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/customer_models.dart';
import '../data/customer_providers.dart';
import '../widgets/customer_parts.dart';

/// Tab "Đơn": việc cần làm trước (đặt cọc, xác nhận nghiệm thu, trả phần còn lại), rồi các đơn đặt trước của tôi.
class CustomerOrdersPage extends ConsumerWidget {
  const CustomerOrdersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = Text('Đơn của tôi', style: Theme.of(context).textTheme.headlineMedium);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AsyncContent<Paged<Preorder>>(
          value: ref.watch(myOrdersProvider),
          onRefresh: () => refreshMyOrders(ref),
          header: Padding(padding: const EdgeInsets.fromLTRB(20, 12, 20, 0), child: title),
          data: (page) {
            final open = [
              for (final o in page.items)
                if (o.isOpen) o,
            ];
            final closed = [
              for (final o in page.items)
                if (!o.isOpen) o,
            ];
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
              children: [
                title,
                if (page.items.isEmpty) ...[
                  const EmptyState(icon: Icons.receipt_long_outlined, title: 'Bạn chưa có đơn đặt trước nào'),
                  FilledButton(onPressed: () => context.go(Routes.customerBatches), child: const Text('Xem Lô đang nhận đặt trước')),
                ] else ...[
                  _Todo(orders: page.items),
                  const SizedBox(height: 14),
                  for (final o in open) ...[_OrderCard(order: o), const SizedBox(height: 10)],
                  if (closed.isNotEmpty)
                    MoreSection(
                      label: 'Đơn đã xong (${closed.length})',
                      initiallyOpen: open.isEmpty,
                      children: [
                        for (final o in closed) ...[_OrderCard(order: o), const SizedBox(height: 10)],
                      ],
                    ),
                  if (page.total > page.items.length)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Đang hiện ${page.items.length} đơn mới nhất trong ${page.total} đơn.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Việc khách cần làm ngay, lấy từ đơn chờ cọc và chuyến giao của các đơn đang giao.
class _Todo extends ConsumerWidget {
  const _Todo({required this.orders});
  final List<Preorder> orders;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shipments = ref.watch(myShipmentsProvider);
    final list = shipments.value ?? const <Shipment>[];
    void open(String orderNo) => context.push(Routes.customerOrder(orderNo));

    final rows = <Widget>[
      for (final o in orders)
        if (o.status == 'PendingDeposit')
          ActionRow(
            icon: Icons.account_balance_wallet_outlined,
            tone: AppColors.warning,
            title: 'Đặt cọc ${formatVnd(o.depositAmount)}',
            subtitle: [
              'Đơn ${o.orderNo}',
              if (o.holdExpiresAt != null) 'giữ đơn ${formatDueIn(o.holdExpiresAt!)}',
            ].join(' · '),
            onTap: () => open(o.orderNo),
          ),
      for (final s in list)
        if (s.stage == ShipmentStage.accept)
          ActionRow(
            icon: Icons.fact_check_outlined,
            title: 'Nghiệm thu đợt ${s.trancheSeq}',
            subtitle: 'Đơn ${s.orderNo} · ${crabsAndKg(s.crabs, s.kg)}',
            onTap: () => open(s.orderNo),
          ),
      for (final s in list)
        if (s.stage == ShipmentStage.pay)
          ActionRow(
            icon: Icons.payments_outlined,
            tone: AppColors.danger,
            title: 'Còn phải trả ${formatVnd(s.acceptance?.balanceDue ?? 0)}',
            subtitle: [
              'Đơn ${s.orderNo}',
              if (s.acceptance?.balanceDueAt != null) formatDueIn(s.acceptance!.balanceDueAt!),
            ].join(' · '),
            onTap: () => open(s.orderNo),
          ),
    ];
    final failed = shipments.hasError && !shipments.isLoading;
    if (rows.isEmpty && !failed) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(title: 'Cần làm', actionLabel: rows.isEmpty ? null : '${rows.length}'),
        for (final row in rows) ...[row, const SizedBox(height: 10)],
        if (failed)
          Row(
            children: [
              Expanded(child: Text('Chưa tải được chuyến giao.', style: Theme.of(context).textTheme.bodySmall)),
              TextButton(onPressed: () => ref.invalidate(orderDeliveriesProvider), child: const Text('Thử lại')),
            ],
          ),
      ],
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});
  final Preorder order;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final next = o.nextTranche;
    return AppCard(
      onTap: () => context.push(Routes.customerOrder(o.orderNo)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(o.orderNo, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
              ),
              const SizedBox(width: 8),
              StatusPill(kind: 'order', value: o.status),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            [
              'Lô ${o.batchCode}',
              '${o.convertedCrabs} con',
              if (next?.dueDate != null) 'đợt ${next!.seq} ngày ${formatDayMonth(next.dueDate!)}',
            ].join(' · '),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text('Cọc ${formatVnd(o.depositAmount)}', style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              StatusPill(kind: 'deposit', value: o.depositState),
            ],
          ),
        ],
      ),
    );
  }
}

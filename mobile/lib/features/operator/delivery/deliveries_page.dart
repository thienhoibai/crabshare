import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../measure/work_common.dart';
import 'create_shipment_sheet.dart';
import 'delivery_models.dart';
import 'delivery_repository.dart';
import 'shipment_page.dart';

/// Tab "Giao hàng" của người nuôi: chuyến cần xuất hoặc cần ghi cân lần hai ở mọi Lô, rồi các đợt đến hạn chưa có chuyến.
class DeliveriesPage extends ConsumerWidget {
  const DeliveriesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(deliveryBoardProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Text('Giao hàng', style: Theme.of(context).textTheme.headlineMedium),
            ),
            Expanded(
              child: AsyncContent(
                value: board,
                onRefresh: () => ref.refresh(deliveryBoardProvider.future),
                data: (b) => _Board(board: b),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Board extends ConsumerWidget {
  const _Board({required this.board});
  final DeliveryBoard board;

  static const _maxFinished = 20;

  Future<void> _create(BuildContext context, WidgetRef ref, DeliveryTranche tranche) async {
    final shipment = await showCreateShipmentSheet(context, tranche);
    if (shipment == null || !context.mounted) return;
    ref.invalidate(deliveryBoardProvider);
    showAppToast(context, 'Đã lập chuyến giao.');
    context.push(ShipmentPage.location(shipment.shipmentNo, batchCode: tranche.batchCode));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = DateTime.now();
    final toReceive = board.toReceive;
    final toDispatch = board.toDispatch;
    final dueNow = board.dueNow(now);
    final later = board.later(now);
    final waiting = board.waitingCustomer;
    final finished = board.finished.reversed.take(_maxFinished).toList();
    final nothing = toReceive.isEmpty && toDispatch.isEmpty && dueNow.isEmpty && later.isEmpty && waiting.isEmpty;
    Widget tranche(DeliveryTranche t) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: _TrancheCard(tranche: t, overdue: t.overdue(now), onCreate: () => _create(context, ref, t)),
    );

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 0, 20, kNavBarClearance),
      children: [
        if (nothing) const EmptyState(icon: Icons.local_shipping_outlined, title: 'Chưa có việc giao hàng'),
        if (toReceive.isNotEmpty || toDispatch.isNotEmpty) ...[
          SectionHeader(title: 'Cần làm ngay', actionLabel: '${toReceive.length + toDispatch.length}'),
          for (final t in toReceive) _ShipmentCard(tranche: t, action: 'Ghi cân lần hai', icon: Icons.fact_check_outlined),
          for (final t in toDispatch) _ShipmentCard(tranche: t, action: 'Xuất hàng', icon: Icons.local_shipping_rounded),
        ],
        if (dueNow.isNotEmpty) ...[
          SectionHeader(title: 'Đợt đến hạn', actionLabel: '${dueNow.length}'),
          for (final t in dueNow) tranche(t),
        ],
        if (waiting.isNotEmpty) ...[
          const SectionHeader(title: 'Chờ khách xác nhận'),
          for (final t in waiting) _ShipmentCard(tranche: t, icon: Icons.hourglass_bottom_rounded, showStatus: false),
        ],
        if (later.isNotEmpty) MoreSection(label: 'Đợt sắp tới (${later.length})', children: [for (final t in later) tranche(t)]),
        if (finished.isNotEmpty)
          MoreSection(
            label: 'Chuyến đã xong (${board.finished.length})',
            children: [for (final t in finished) _ShipmentCard(tranche: t, icon: Icons.check_circle_outline_rounded)],
          ),
      ],
    );
  }
}

String _where(DeliveryTranche t) => 'Đợt ${t.seq} · Lô ${t.batchCode}';

/// Một chuyến giao đã lập; bấm để mở chuyến. [action] là việc người nuôi cần làm ngay;
/// không có việc thì hiện trạng thái chuyến, trừ khi tiêu đề mục đã nói rõ ([showStatus] = false).
class _ShipmentCard extends StatelessWidget {
  const _ShipmentCard({required this.tranche, required this.icon, this.action, this.showStatus = true});
  final DeliveryTranche tranche;
  final IconData icon;
  final String? action;
  final bool showStatus;

  @override
  Widget build(BuildContext context) {
    final t = tranche;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: () => context.push(ShipmentPage.location(t.shipmentNo!, batchCode: t.batchCode)),
        child: Row(
          children: [
            IconTile(
              icon: icon,
              background: action == null ? AppColors.surfaceMuted : AppColors.accentSoft,
              foreground: action == null ? AppColors.inkMuted : AppColors.accentText,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.recipientName, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.titleMedium),
                  Text(_where(t), style: text.bodySmall),
                  if (action != null) ...[
                    const SizedBox(height: 4),
                    Text(action!, style: const TextStyle(color: AppColors.accentText, fontWeight: FontWeight.w700)),
                  ] else if (showStatus) ...[
                    const SizedBox(height: 4),
                    StatusPill(kind: 'shipment', value: t.shipmentStatus),
                  ],
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppColors.inkMuted),
          ],
        ),
      ),
    );
  }
}

/// Một đợt giao chưa có chuyến: hạn giao, số con đã phân bổ theo từng quy cách, nút lập chuyến.
class _TrancheCard extends StatelessWidget {
  const _TrancheCard({required this.tranche, required this.overdue, required this.onCreate});
  final DeliveryTranche tranche;
  final bool overdue;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final t = tranche;
    final text = Theme.of(context).textTheme;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(t.recipientName, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.titleMedium),
              ),
              if (t.dueDate != null)
                InfoChip(
                  label: 'Hạn ${formatDayMonth(t.dueDate!)}',
                  icon: Icons.event_rounded,
                  background: overdue ? AppColors.danger.withValues(alpha: 0.12) : AppColors.surfaceMuted,
                  foreground: overdue ? AppColors.danger : AppColors.ink,
                ),
            ],
          ),
          Text(_where(t), style: text.bodySmall),
          const SizedBox(height: 12),
          for (final l in t.lines) ...[
            Row(
              children: [
                Expanded(child: Text(specLabel(l.specCode))),
                Text('${l.allocatedCrabs}/${l.orderedCrabs} con', style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 4),
            SoftProgressBar(
              value: l.orderedCrabs == 0 ? 0 : l.allocatedCrabs / l.orderedCrabs,
              height: 6,
              color: l.allocatedCrabs >= l.orderedCrabs ? AppColors.success : AppColors.accent,
            ),
            const SizedBox(height: 10),
          ],
          const SizedBox(height: 2),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: onCreate,
            child: const Text('Lập chuyến'),
          ),
        ],
      ),
    );
  }
}

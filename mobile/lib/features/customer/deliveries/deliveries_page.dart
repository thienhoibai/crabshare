import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/customer_models.dart';
import '../data/customer_providers.dart';
import '../widgets/customer_parts.dart';

/// Tab "Giao hàng": chuyến giao của mọi đơn, chuyến chờ tôi xử lý đứng trước, rồi chuyến đang trên đường.
/// Bấm một chuyến để mở đơn của chuyến đó.
class CustomerDeliveriesPage extends ConsumerWidget {
  const CustomerDeliveriesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = Text('Giao hàng', style: Theme.of(context).textTheme.headlineMedium);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AsyncContent<List<Shipment>>(
          value: ref.watch(myShipmentsProvider),
          onRefresh: () => refreshMyOrders(ref),
          header: Padding(padding: const EdgeInsets.fromLTRB(20, 12, 20, 0), child: title),
          data: (shipments) {
            List<Shipment> at(Set<ShipmentStage> stages) => [
              for (final s in shipments)
                if (stages.contains(s.stage)) s,
            ];
            final todo = at({ShipmentStage.accept, ShipmentStage.pay});
            final moving = at({ShipmentStage.transit, ShipmentStage.scheduled});
            final done = at({ShipmentStage.done});
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
              children: [
                title,
                if (todo.isEmpty && moving.isEmpty) ...[
                  const EmptyState(icon: Icons.local_shipping_outlined, title: 'Chưa có chuyến giao nào đang chờ bạn'),
                  FilledButton(onPressed: () => context.go(Routes.customerOrders), child: const Text('Xem đơn của tôi')),
                ],
                if (todo.isNotEmpty) SectionHeader(title: 'Chờ bạn xử lý', actionLabel: '${todo.length}'),
                for (final s in todo) ...[_ShipmentRow(shipment: s), const SizedBox(height: 10)],
                if (moving.isNotEmpty) const SectionHeader(title: 'Đang giao'),
                for (final s in moving) ...[_ShipmentRow(shipment: s), const SizedBox(height: 10)],
                if (done.isNotEmpty)
                  MoreSection(
                    label: 'Đã nghiệm thu (${done.length})',
                    children: [
                      for (final s in done) ...[_ShipmentRow(shipment: s), const SizedBox(height: 10)],
                    ],
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ShipmentRow extends StatelessWidget {
  const _ShipmentRow({required this.shipment});
  final Shipment shipment;

  @override
  Widget build(BuildContext context) {
    final s = shipment;
    final a = s.acceptance;
    final amount = s.crabs > 0 ? crabsAndKg(s.crabs, s.kg) : 'Chưa cân';
    final (IconData icon, Color tone, String title, String detail) = switch (s.stage) {
      ShipmentStage.accept => (Icons.fact_check_outlined, AppColors.accentText, 'Chờ bạn nghiệm thu', amount),
      ShipmentStage.pay => (
        Icons.payments_outlined,
        AppColors.danger,
        'Còn phải trả ${formatVnd(a?.balanceDue ?? 0)}',
        a?.balanceDueAt == null ? amount : formatDueIn(a!.balanceDueAt!),
      ),
      ShipmentStage.transit => (
        Icons.local_shipping_outlined,
        AppColors.info,
        'Hàng đang trên đường',
        s.dispatchedAt == null ? amount : 'xuất lúc ${formatDayTime(s.dispatchedAt!)}',
      ),
      ShipmentStage.scheduled => (
        Icons.event_outlined,
        AppColors.inkMuted,
        'Đã lên lịch giao',
        s.scheduledAt == null ? amount : 'hẹn ${formatDayTime(s.scheduledAt!)}',
      ),
      ShipmentStage.done => (
        Icons.check_circle_outline_rounded,
        AppColors.success,
        'Đã nghiệm thu',
        s.inReturnWindow() ? 'báo vấn đề tới ${formatDayTime(s.returnWindowEndsAt!)}' : amount,
      ),
      ShipmentStage.closed => (Icons.block_rounded, AppColors.inkMuted, 'Đã đóng', amount),
    };
    return ActionRow(
      icon: icon,
      tone: tone,
      title: title,
      subtitle: 'Đợt ${s.trancheSeq} · đơn ${s.orderNo} · $detail',
      onTap: () => context.push(Routes.customerOrder(s.orderNo)),
    );
  }
}

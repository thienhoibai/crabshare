import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../customer_routes.dart';
import '../data/customer_models.dart';
import '../data/customer_providers.dart';
import 'order_actions.dart';
import 'order_more.dart';
import 'order_rating.dart';

/// Màn một đơn đặt trước. Đầu màn là việc khách cần làm ngay (chuyển cọc, xác nhận nghiệm thu, trả phần còn lại),
/// rồi bốn con số, quy cách đã đặt và các đợt giao; hoá đơn, khiếu nại đã gửi và huỷ đơn nằm trong "Xem thêm".
class CustomerOrderPage extends ConsumerWidget {
  const CustomerOrderPage({super.key, required this.orderNo});
  final String orderNo;

  Future<void> _refresh(WidgetRef ref) {
    ref.invalidate(orderDeliveriesProvider(orderNo));
    ref.invalidate(orderClaimsProvider(orderNo));
    return ref.refresh(orderProvider(orderNo).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        child: AsyncContent<Preorder>(
          value: ref.watch(orderProvider(orderNo)),
          onRefresh: () => _refresh(ref),
          header: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: SubPageHeader(title: 'Đơn $orderNo'),
          ),
          data: (o) => _OrderBody(order: o),
        ),
      ),
    );
  }
}

class _OrderBody extends ConsumerWidget {
  const _OrderBody({required this.order});
  final Preorder order;

  static const _depositInUse = {'Deposited', 'Confirmed', 'Delivering', 'Delivered', 'Completed'};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = order;
    final d = ref.watch(orderDeliveriesProvider(o.orderNo)).value;
    final shipments = d?.shipments ?? const <Shipment>[];
    final known = ref.watch(orderClaimsProvider(o.orderNo)).value ?? const <Claim>[];
    final canClaim = shipments.any((s) => s.inReturnWindow() && !known.any((c) => c.shipmentNo == s.shipmentNo));
    final note = switch (o.status) {
      'Forfeited' => 'Đơn đã mất cọc.${o.cancelReason == null ? '' : ' ${o.cancelReason}'}',
      'CancelRequested' => 'Đã xin huỷ. Tiền cọc được giữ tới khi Lô đóng gọi vốn.',
      _ => o.cancelReason == null ? null : 'Lý do đóng đơn: ${o.cancelReason}',
    };

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
      children: [
        SubPageHeader(title: 'Đơn ${o.orderNo}'),
        const SizedBox(height: 12),
        Row(
          children: [
            StatusPill(kind: 'order', value: o.status),
            const SizedBox(width: 8),
            Flexible(
              child: GestureDetector(
                onTap: () => context.push(Routes.batch(o.batchCode)),
                child: InfoChip(icon: Icons.grid_view_rounded, label: 'Lô ${o.batchCode}'),
              ),
            ),
          ],
        ),
        if (note != null) ...[
          const SizedBox(height: 10),
          Text(note, style: TextStyle(color: o.status == 'Forfeited' ? AppColors.danger : AppColors.inkMuted)),
        ],
        const SizedBox(height: 14),
        OrderActions(order: o),
        FactGrid(
          facts: [
            Fact('Số lượng', '${o.convertedCrabs} con'),
            Fact('Giá trị ước tính', formatVnd(o.estimatedValue)),
            Fact('Tiền cọc', formatVnd(o.depositAmount)),
            if (d != null && d.depositApplied > 0 && _depositInUse.contains(o.status))
              Fact('Cọc chưa dùng', formatVnd(d.depositCredit))
            else
              Fact('Đợt giao', '${o.tranches.length} đợt'),
          ],
        ),
        const SectionHeader(title: 'Quy cách đã đặt'),
        AppCard(
          child: Column(
            children: [
              for (final l in o.lines) _LineRow(line: l),
            ],
          ),
        ),
        if (o.tranches.isNotEmpty) ...[
          const SectionHeader(title: 'Đợt giao'),
          AppCard(
            child: Column(
              children: [
                for (final t in o.tranches)
                  _TrancheRow(tranche: t, order: o, shipment: shipments.where((s) => s.trancheSeq == t.seq).lastOrNull),
              ],
            ),
          ),
        ],
        if (canClaim) ...[
          const SizedBox(height: 14),
          AddBar(label: 'Báo vấn đề về hàng đã nhận', onTap: () => context.push(CustomerRoutes.claimNew(o.orderNo))),
        ],
        if (o.isDelivered) ...[const SizedBox(height: 14), OrderRatingCard(orderNo: o.orderNo)],
        const SizedBox(height: 8),
        OrderMore(order: o),
      ],
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line});
  final PreorderLine line;

  @override
  Widget build(BuildContext context) {
    final l = line;
    final small = Theme.of(context).textTheme.bodySmall;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.specName, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('${formatVnd(l.pricePerKg)} / kg', style: small),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(l.quantity, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('khoảng ${formatVnd(l.estimatedValue)}', style: small),
            ],
          ),
        ],
      ),
    );
  }
}

/// Một đợt giao của đơn: ngày hẹn, số lượng theo quy cách, trạng thái và tình hình chuyến giao của đợt.
class _TrancheRow extends StatelessWidget {
  const _TrancheRow({required this.tranche, required this.order, required this.shipment});
  final OrderTranche tranche;
  final Preorder order;
  final Shipment? shipment;

  String? get _shipmentNote {
    final s = shipment;
    if (s == null) return null;
    return switch (s.stage) {
      ShipmentStage.scheduled => s.scheduledAt == null ? null : 'Hẹn giao ${formatDayTime(s.scheduledAt!)}',
      ShipmentStage.transit => s.dispatchedAt == null ? 'Đang giao' : 'Đang giao, xuất lúc ${formatDayTime(s.dispatchedAt!)}',
      ShipmentStage.accept => 'Chờ bạn xác nhận nghiệm thu',
      ShipmentStage.pay || ShipmentStage.done => 'Đã nghiệm thu ${crabsAndKg(s.crabs, s.kg)}',
      ShipmentStage.closed => statusLabel('shipment', s.status),
    };
  }

  @override
  Widget build(BuildContext context) {
    final t = tranche;
    final note = _shipmentNote;
    final small = Theme.of(context).textTheme.bodySmall;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  ['Đợt ${t.seq}', if (t.dueDate != null) formatDate(t.dueDate!)].join(' · '),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              StatusPill(kind: 'deliveryTranche', value: t.status),
            ],
          ),
          const SizedBox(height: 2),
          for (final l in t.lines) Text('${order.specName(l.specCode)}: ${l.quantity}', style: small),
          if (note != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(note, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.accentText)),
            ),
        ],
      ),
    );
  }
}

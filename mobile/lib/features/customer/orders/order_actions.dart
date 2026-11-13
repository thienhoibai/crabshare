import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/customer_models.dart';
import '../data/customer_providers.dart';
import '../widgets/customer_parts.dart';

/// Việc khách cần làm ngay trên một đơn, đứng đầu màn chi tiết đơn:
/// chuyển cọc, xác nhận nghiệm thu chuyến giao đang chờ, trả phần còn lại sau nghiệm thu.
class OrderActions extends ConsumerWidget {
  const OrderActions({super.key, required this.order});
  final Preorder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = order;
    final deliveries = ref.watch(orderDeliveriesProvider(o.orderNo));
    final d = deliveries.value;
    final shipments = d?.shipments ?? const <Shipment>[];
    // Hàng đang ở cửa thì nghiệm thu đứng trước; khoản còn phải trả đứng sau và chỉ giữ nút chính khi không có việc nào ở trên.
    final toAccept = [
      for (final s in shipments)
        if (s.stage == ShipmentStage.accept) s,
    ];
    final toPay = [
      for (final s in shipments)
        if (s.stage == ShipmentStage.pay) s,
    ];
    final cards = <Widget>[
      if (o.status == 'PendingDeposit')
        PayCard(
          title: 'Đặt cọc để giữ đơn',
          amount: o.deposit?.amount ?? o.depositAmount,
          orderNo: o.orderNo,
          reference: o.deposit?.referenceCode,
          deadline: o.deposit?.expiresAt ?? o.holdExpiresAt,
        ),
      for (final s in toAccept) AcceptanceCard(shipment: s, order: o, depositCredit: d?.depositCredit ?? 0),
      for (final (i, s) in toPay.indexed)
        PayCard(
          title: 'Trả phần còn lại đợt ${s.trancheSeq}',
          amount: s.acceptance?.balanceDue ?? 0,
          orderNo: o.orderNo,
          reference: s.balance?.referenceCode,
          deadline: s.acceptance?.balanceDueAt,
          primary: toAccept.isEmpty && i == 0,
        ),
      if (d == null && deliveries.hasError && !deliveries.isLoading)
        AppCard(
          child: Row(
            children: [
              Expanded(child: Text('Chưa tải được chuyến giao của đơn.', style: Theme.of(context).textTheme.bodySmall)),
              TextButton(onPressed: () => ref.invalidate(orderDeliveriesProvider(o.orderNo)), child: const Text('Thử lại')),
            ],
          ),
        ),
    ];
    if (cards.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final card in cards) ...[card, const SizedBox(height: 12)],
      ],
    );
  }
}

/// Chuyến giao chờ khách xác nhận: kết quả cân khi nhận và hai nút Xác nhận nghiệm thu, Từ chối nhận.
class AcceptanceCard extends ConsumerStatefulWidget {
  const AcceptanceCard({super.key, required this.shipment, required this.order, required this.depositCredit});
  final Shipment shipment;
  final Preorder order;

  /// Tiền cọc chưa trừ vào tiền hàng của đơn.
  final int depositCredit;

  @override
  ConsumerState<AcceptanceCard> createState() => _AcceptanceCardState();
}

class _AcceptanceCardState extends ConsumerState<AcceptanceCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) showAppToast(context, done);
    } catch (error) {
      if (mounted) showAppToast(context, customerErrorMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    final s = widget.shipment;
    final goods = s.goodsValue;
    final applied = widget.depositCredit < goods ? widget.depositCredit : goods;
    final ok = await showConfirmSheet(
      context,
      title: 'Xác nhận nghiệm thu đợt ${s.trancheSeq}',
      message: 'Tiền hàng ${formatVnd(goods)}. Trừ tiền cọc ${formatVnd(applied)}, còn phải trả ${formatVnd(goods - applied)}.',
      confirmLabel: 'Xác nhận nghiệm thu',
    );
    if (ok == null) return;
    await _run(() => ref.read(customerActionsProvider).confirmAcceptance(s), 'Đã xác nhận nghiệm thu.');
  }

  Future<void> _refuse() async {
    final s = widget.shipment;
    final reason = await showConfirmSheet(
      context,
      title: 'Từ chối nhận đợt ${s.trancheSeq}',
      message: 'Bạn mất tiền cọc chưa dùng (${formatVnd(widget.depositCredit)}). Các đợt chưa giao bị huỷ. Không rút lại được.',
      confirmLabel: 'Từ chối và chịu mất cọc',
      danger: true,
      reasonLabel: 'Lý do từ chối',
      reasonRequired: true,
    );
    if (reason == null || !mounted) return;
    if (reason.length < 3) {
      showAppToast(context, 'Lý do từ chối cần ít nhất 3 ký tự.', error: true);
      return;
    }
    await _run(() => ref.read(customerActionsProvider).refuseDelivery(s, reason), 'Đã ghi nhận từ chối nhận hàng.');
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.shipment;
    final a = s.acceptance;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const IconTile(icon: Icons.fact_check_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Nghiệm thu đợt ${s.trancheSeq}', style: Theme.of(context).textTheme.titleMedium),
                    Text('Kiểm hàng rồi xác nhận', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          KeyValueList(
            rows: [
              ('Nhận', a == null ? null : crabsAndKg(a.acceptedCrabs, a.acceptedKg)),
              ('Không nhận', a != null && a.rejectedCrabs > 0 ? '${a.rejectedCrabs} con' : null),
              ('Tiền hàng', formatVnd(s.goodsValue)),
              ('Chênh lệch', a?.discrepancyReason),
            ],
          ),
          MoreSection(
            label: 'Số liệu cân',
            children: [
              // Quy cách không có con nào trong chuyến này thì bỏ qua.
              for (final l in s.lines)
                if ((l.dispatchedCrabs ?? 0) > 0 || (l.receivedCrabs ?? 0) > 0)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _WeighingLine(name: widget.order.specName(l.specCode), line: l),
                  ),
            ],
          ),
          FilledButton(onPressed: _busy ? null : _confirm, child: Text(_busy ? 'Đang gửi…' : 'Xác nhận nghiệm thu')),
          const SizedBox(height: 4),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.danger, minimumSize: const Size.fromHeight(48)),
            onPressed: _busy ? null : _refuse,
            child: const Text('Từ chối nhận'),
          ),
        ],
      ),
    );
  }
}

/// Một quy cách của chuyến giao: cân lúc xuất, cân lúc nhận, số nghiệm thu.
class _WeighingLine extends StatelessWidget {
  const _WeighingLine({required this.name, required this.line});
  final String name;
  final ShipmentLine line;

  static String? _pair(int? crabs, double? kg) => crabs == null ? null : crabsAndKg(crabs, kg);

  @override
  Widget build(BuildContext context) {
    final l = line;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(name, style: const TextStyle(fontWeight: FontWeight.w700)),
        KeyValueList(
          rows: [
            ('Cân lúc xuất', _pair(l.dispatchedCrabs, l.dispatchedKg)),
            ('Cân lúc nhận', _pair(l.receivedCrabs, l.receivedKg)),
            ('Nghiệm thu', _pair(l.acceptedCrabs, l.acceptedKg)),
            ('Đơn giá', '${formatVnd(l.pricePerKg)} / kg'),
          ],
        ),
      ],
    );
  }
}

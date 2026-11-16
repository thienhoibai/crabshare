import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
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
import '../widgets/customer_parts.dart';

/// Phần "Xem thêm" của màn chi tiết đơn: nơi giao, truy xuất, hoá đơn, khiếu nại đã gửi, huỷ đơn.
class OrderMore extends ConsumerWidget {
  const OrderMore({super.key, required this.order});
  final Preorder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = order;
    final d = ref.watch(orderDeliveriesProvider(o.orderNo)).value;
    final traceCode = d?.traceCode;
    final hasAccepted = d?.shipments.any((s) => s.status == 'Accepted') ?? false;
    return MoreSection(
      children: [
        AppCard(
          child: KeyValueList(
            rows: [
              ('Giao tới', o.deliveryAddress),
              ('Khoảng cách', o.deliveryDistanceKm == null ? null : '${NumberFormat.decimalPattern('vi_VN').format(o.deliveryDistanceKm)} km'),
              ('Đặt lúc', o.placedAt == null ? null : '${formatDate(o.placedAt!)} ${formatTime(o.placedAt!)}'),
            ],
          ),
        ),
        if (traceCode != null && traceCode.isNotEmpty) ...[
          const SizedBox(height: 10),
          ActionRow(
            icon: Icons.qr_code_2_rounded,
            title: 'Truy xuất nguồn gốc',
            subtitle: 'Lô, trại và nguồn cua của đơn',
            onTap: () => context.push(Routes.trace(traceCode)),
          ),
        ],
        if (d != null && d.invoices.isNotEmpty) ...[
          const _Label('Hoá đơn'),
          AppCard(
            child: Column(
              children: [
                for (final i in d.invoices) _InvoiceRow(invoice: i),
              ],
            ),
          ),
        ],
        if (hasAccepted) ...[const _Label('Khiếu nại đã gửi'), _ClaimHistory(orderNo: o.orderNo)],
        if (o.isCancellable) ...[const SizedBox(height: 10), _CancelButton(order: o)],
      ],
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 8),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );
}

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({required this.invoice});
  final Invoice invoice;

  @override
  Widget build(BuildContext context) {
    final i = invoice;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(i.invoiceNo, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(
                  [
                    if (i.trancheSeq != null) 'Đợt ${i.trancheSeq}',
                    if (i.issuedAt != null) formatDate(i.issuedAt!),
                  ].join(' · '),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatVnd(i.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              StatusPill(kind: 'invoice', value: i.status),
            ],
          ),
        ],
      ),
    );
  }
}

/// Khiếu nại của đơn mà máy này còn nhớ mã, và ô mở lại một khiếu nại theo mã.
class _ClaimHistory extends ConsumerStatefulWidget {
  const _ClaimHistory({required this.orderNo});
  final String orderNo;

  @override
  ConsumerState<_ClaimHistory> createState() => _ClaimHistoryState();
}

class _ClaimHistoryState extends ConsumerState<_ClaimHistory> {
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _openByCode() async {
    final code = _code.text.trim();
    if (code.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      final claim = await ref.read(customerActionsProvider).openClaimByCode(widget.orderNo, code);
      _code.clear();
      if (mounted) context.push(CustomerRoutes.claim(claim.claimNo));
    } catch (error) {
      if (mounted) showAppToast(context, customerErrorMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final claims = ref.watch(orderClaimsProvider(widget.orderNo));
    final list = claims.value ?? const <Claim>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final c in list) ...[
          ActionRow(
            icon: Icons.report_problem_outlined,
            tone: toneColor(statusTone('claim', c.status)),
            title: [statusLabel('issueType', c.issueType), if (c.affected.isNotEmpty) c.affected].join(' · '),
            subtitle: statusLabel('claim', c.status),
            onTap: () => context.push(CustomerRoutes.claim(c.claimNo)),
          ),
          const SizedBox(height: 10),
        ],
        if (claims.hasError && !claims.isLoading)
          Row(
            children: [
              Expanded(child: Text('Chưa tải được khiếu nại.', style: Theme.of(context).textTheme.bodySmall)),
              TextButton(onPressed: () => ref.invalidate(orderClaimsProvider(widget.orderNo)), child: const Text('Thử lại')),
            ],
          )
        else if (list.isEmpty && !claims.isLoading)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text('Máy này chưa lưu khiếu nại nào của đơn.', style: Theme.of(context).textTheme.bodySmall),
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                onSubmitted: (_) => _openByCode(),
                decoration: const InputDecoration(hintText: 'Mở theo mã khiếu nại'),
              ),
            ),
            const SizedBox(width: 8),
            CircleIconButton(icon: Icons.search_rounded, size: 52, onTap: _busy ? null : _openByCode),
          ],
        ),
      ],
    );
  }
}

class _CancelButton extends ConsumerStatefulWidget {
  const _CancelButton({required this.order});
  final Preorder order;

  @override
  ConsumerState<_CancelButton> createState() => _CancelButtonState();
}

class _CancelButtonState extends ConsumerState<_CancelButton> {
  bool _busy = false;

  /// Hậu quả của việc huỷ theo trạng thái đơn: (lời giải thích, nhãn nút xác nhận).
  (String, String) get _consequence {
    final o = widget.order;
    return switch (o.status) {
      'PendingDeposit' => ('Đơn chưa cọc nên huỷ không mất gì.', 'Huỷ đơn'),
      'Deposited' => (
        'Tiền cọc ${formatVnd(o.depositAmount)} được giữ tới khi Lô đóng gọi vốn: Lô mở thì mất cọc, Lô không mở thì được hoàn.',
        'Xin huỷ đơn',
      ),
      _ => ('Lô đã mở. Huỷ đơn là mất toàn bộ tiền cọc ${formatVnd(o.depositAmount)}.', 'Huỷ đơn và chịu mất cọc'),
    };
  }

  Future<void> _cancel() async {
    final (message, label) = _consequence;
    final reason = await showConfirmSheet(
      context,
      title: 'Huỷ đơn ${widget.order.orderNo}',
      message: message,
      confirmLabel: label,
      danger: true,
      reasonLabel: 'Lý do huỷ (không bắt buộc)',
    );
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(customerActionsProvider).cancelOrder(widget.order.orderNo, reason: reason);
      if (mounted) showAppToast(context, 'Đã ghi nhận huỷ đơn.');
    } catch (error) {
      if (mounted) showAppToast(context, customerErrorMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => TextButton(
    style: TextButton.styleFrom(foregroundColor: AppColors.danger, minimumSize: const Size.fromHeight(48)),
    onPressed: _busy ? null : _cancel,
    child: Text(_busy ? 'Đang huỷ…' : 'Huỷ đơn'),
  );
}

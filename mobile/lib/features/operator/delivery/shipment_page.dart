import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../measure/work_common.dart';
import 'delivery_models.dart';
import 'delivery_repository.dart';
import 'dispatch_form.dart';
import 'receipt_form.dart';
import 'shipment_flow.dart';

/// Một chuyến giao: các bước ở đầu, rồi đúng một form đang cần làm (xuất hàng hoặc giao tới khách),
/// sau đó là biên bản nghiệm thu chờ khách xác nhận. Mã QR gắn theo đơn, mở bằng trang truy xuất.
class ShipmentPage extends ConsumerWidget {
  const ShipmentPage({super.key, required this.shipmentNo, this.batchCode});
  final String shipmentNo;

  /// Mã Lô nếu màn gọi đã biết; không có thì màn tự tìm đợt giao trong các Lô đã mở.
  final String? batchCode;

  /// Đường dẫn tới chuyến giao kèm mã Lô đã biết: `/o/shipments/:no?batch=`.
  static String location(String shipmentNo, {String? batchCode}) => Uri(
    path: Routes.operatorShipment(shipmentNo),
    queryParameters: batchCode == null ? null : {'batch': batchCode},
  ).toString();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = shipmentViewProvider((shipmentNo: shipmentNo, batchCode: batchCode));
    final view = ref.watch(provider);
    void reload() {
      ref.invalidate(provider);
      ref.invalidate(deliveryBoardProvider);
    }

    return Scaffold(
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(provider.future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              SubPageHeader(
                title: 'Chuyến giao',
                trailing: StatusPill(kind: 'shipment', value: view.value?.shipment.status),
              ),
              const SizedBox(height: 16),
              ...view.when(
                loading: () => [const LoadingSkeleton(rows: 2)],
                error: (error, _) => [ErrorView(message: workError(error), onRetry: () => ref.invalidate(provider))],
                data: (v) => _content(context, v, reload),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _content(BuildContext context, ShipmentView v, VoidCallback reload) {
    final s = v.shipment;
    final acc = s.acceptance;
    return [
      AppCard(
        padding: const EdgeInsets.fromLTRB(8, 16, 8, 14),
        child: ShipmentFlow(steps: shipmentSteps(s)),
      ),
      const SizedBox(height: 12),
      _Recipient(view: v),
      const SizedBox(height: 12),
      if (s.needsDispatch && v.tranche == null)
        const AppCard(child: Text('Không tìm thấy đợt giao của chuyến này. Kéo xuống để tải lại.'))
      else if (s.needsDispatch)
        DispatchForm(view: v, onDone: reload)
      else if (s.canRecordReceipt && acc == null)
        ReceiptCard(view: v, onDone: reload)
      else if (acc != null)
        _AcceptanceCard(shipment: s),
      if (s.awaitingCustomer) MoreSection(label: 'Ghi lại cân lần hai', children: [ReceiptCard(view: v, onDone: reload)]),
      if (!s.needsDispatch && s.lines.isNotEmpty)
        MoreSection(label: 'Hàng trong chuyến', children: [AppCard(child: _Lines(lines: s.lines))]),
      MoreSection(
        label: 'Thông tin chuyến',
        children: [
          AppCard(
            child: KeyValueList(
              rows: [
                ('Mã chuyến', s.shipmentNo),
                ('Đơn', s.orderNo),
                ('Dự kiến xuất', _time(s.scheduledAt)),
                ('Đã xuất lúc', _time(s.dispatchedAt)),
                ('Vận chuyển', s.transportCondition),
                ('Hạn đổi trả', _time(s.returnWindowEndsAt)),
              ],
            ),
          ),
        ],
      ),
      if (s.traceCode != null) ...[
        const SizedBox(height: 8),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: () => _openTrace(context, s.traceCode!),
          icon: const Icon(Icons.qr_code_2_rounded),
          label: const Text('Mở trang truy xuất'),
        ),
      ],
    ];
  }

  static String? _time(DateTime? at) => at == null ? null : '${formatTime(at)} · ${formatDate(at)}';

  static Future<void> _openTrace(BuildContext context, String traceCode) =>
      _launch(context, Uri.parse('$webUrl/truy-xuat/${Uri.encodeComponent(traceCode)}'), 'Không mở được trình duyệt.');
}

Future<void> _launch(BuildContext context, Uri uri, String failure) async {
  final messenger = ScaffoldMessenger.of(context);
  var opened = false;
  try {
    opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    opened = false;
  }
  if (!opened && messenger.mounted) messenger.showSnackBar(SnackBar(content: Text(failure)));
}

/// Người nhận: tên, đơn và đợt, địa chỉ, nút gọi điện.
class _Recipient extends StatelessWidget {
  const _Recipient({required this.view});
  final ShipmentView view;

  @override
  Widget build(BuildContext context) {
    final t = view.tranche;
    final s = view.shipment;
    final text = Theme.of(context).textTheme;
    final phone = t?.recipientPhone ?? '';
    return AppCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(t == null || t.recipientName.isEmpty ? 'Đơn ${s.orderNo}' : t.recipientName, style: text.titleMedium),
                const SizedBox(height: 2),
                Text(
                  ['Đợt ${s.trancheSeq}', if (view.batchCode != null) 'Lô ${view.batchCode}'].join(' · '),
                  style: text.bodySmall,
                ),
                if (t != null && t.deliveryAddress.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(t.deliveryAddress),
                ],
              ],
            ),
          ),
          if (phone.isNotEmpty) ...[
            const SizedBox(width: 12),
            Semantics(
              button: true,
              label: 'Gọi $phone',
              child: CircleIconButton(
                icon: Icons.phone_rounded,
                background: AppColors.accentSoft,
                foreground: AppColors.accentText,
                size: 48,
                onTap: () => _launch(context, Uri(scheme: 'tel', path: phone), 'Không mở được cuộc gọi tới $phone.'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Biên bản nghiệm thu: số khách chấp nhận và tiền đã ghi nhận sau khi khách xác nhận.
class _AcceptanceCard extends StatelessWidget {
  const _AcceptanceCard({required this.shipment});
  final Shipment shipment;

  @override
  Widget build(BuildContext context) {
    final acc = shipment.acceptance!;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text('Nghiệm thu', style: Theme.of(context).textTheme.titleMedium)),
              StatusPill(kind: 'acceptance', value: acc.status),
            ],
          ),
          const SizedBox(height: 8),
          KeyValueList(
            rows: [
              ('Khách chấp nhận', '${acc.acceptedCrabs} con · ${formatKg(acc.acceptedKg)}'),
              ('Từ chối', acc.rejectedCrabs > 0 ? '${acc.rejectedCrabs} con' : null),
              ('Chênh lệch', acc.discrepancyReason),
              ('Tiền hàng', acc.goodsValue == null ? null : formatVnd(acc.goodsValue!)),
              ('Trừ cọc', acc.depositApplied == null ? null : formatVnd(acc.depositApplied!)),
              ('Khách còn phải trả', acc.balanceDue == null ? null : formatVnd(acc.balanceDue!)),
              ('Hạn trả', acc.balanceDueAt == null || acc.balancePaidAt != null ? null : formatDate(acc.balanceDueAt!)),
              ('Đã trả lúc', acc.balancePaidAt == null ? null : formatDate(acc.balancePaidAt!)),
            ],
          ),
          if (shipment.balanceStatus != null)
            Align(alignment: Alignment.centerRight, child: StatusPill(kind: 'payment', value: shipment.balanceStatus)),
        ],
      ),
    );
  }
}

/// Số xuất, nhận và chấp nhận của từng dòng; nằm trong phần gấp lại.
class _Lines extends StatelessWidget {
  const _Lines({required this.lines});
  final List<ShipmentLine> lines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final l in lines.where((l) => l.dispatchedCrabs != 0)) ...[
          Text(specLabel(l.specCode), style: const TextStyle(fontWeight: FontWeight.w700)),
          KeyValueList(
            rows: [
              ('Giá', '${formatVnd(l.pricePerKg)} / kg'),
              ('Xuất', l.dispatchedCrabs == null ? null : '${l.dispatchedCrabs} con · ${formatKg(l.dispatchedKg)}'),
              ('Nhận', l.receivedCrabs == null ? null : '${l.receivedCrabs} con · ${formatKg(l.receivedKg)}'),
              ('Chấp nhận', l.acceptedCrabs == null ? null : '${l.acceptedCrabs} con · ${formatKg(l.acceptedKg)}'),
              ('Tiền hàng', l.goodsValue == null ? null : formatVnd(l.goodsValue!)),
            ],
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

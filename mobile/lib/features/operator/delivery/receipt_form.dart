import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../measure/work_common.dart';
import 'delivery_models.dart';
import 'delivery_repository.dart';

/// Giao tới khách: cân lần hai và lập biên bản nghiệm thu chờ khách xác nhận.
/// Mặc định khách nhận đủ, chỉ cần số cân lần hai. Số con, kg chấp nhận, mã cua bị từ chối và lý do
/// chỉ hiện khi đánh dấu "Thiếu hoặc khách từ chối một phần".
class ReceiptForm extends ConsumerStatefulWidget {
  const ReceiptForm({super.key, required this.view, required this.onDone});
  final ShipmentView view;
  final VoidCallback onDone;

  @override
  ConsumerState<ReceiptForm> createState() => _ReceiptFormState();
}

class _LineInputs {
  _LineInputs(ShipmentLine l)
    : receivedCrabs = TextEditingController(text: '${l.receivedCrabs ?? l.dispatchedCrabs ?? 0}'),
      receivedKg = TextEditingController(text: _plain(l.receivedKg)),
      acceptedCrabs = TextEditingController(text: '${l.acceptedCrabs ?? l.receivedCrabs ?? l.dispatchedCrabs ?? 0}'),
      acceptedKg = TextEditingController(text: _plain(l.acceptedKg));

  final TextEditingController receivedCrabs;
  final TextEditingController receivedKg;
  final TextEditingController acceptedCrabs;
  final TextEditingController acceptedKg;

  static String _plain(double? v) =>
      v == null ? '' : (v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString().replaceAll('.', ','));

  void dispose() {
    receivedCrabs.dispose();
    receivedKg.dispose();
    acceptedCrabs.dispose();
    acceptedKg.dispose();
  }
}

class _ReceiptFormState extends ConsumerState<ReceiptForm> {
  late final Map<int, _LineInputs> _inputs = {for (final l in _shipment.lines) l.lineId: _LineInputs(l)};
  late final _reason = TextEditingController(text: _shipment.acceptance?.discrepancyReason ?? '');
  final _rejected = <String>{};

  // Biên bản cũ đã có chênh lệch thì mở sẵn phần chi tiết.
  late bool _partial = () {
    final acc = _shipment.acceptance;
    return acc != null &&
        (acc.rejectedCrabs > 0 ||
            (acc.discrepancyReason ?? '').isNotEmpty ||
            _shipment.lines.any((l) => l.receivedCrabs != l.dispatchedCrabs || l.acceptedKg != l.receivedKg));
  }();
  bool _busy = false;
  String? _error;

  Shipment get _shipment => widget.view.shipment;

  @override
  void dispose() {
    for (final i in _inputs.values) {
      i.dispose();
    }
    _reason.dispose();
    super.dispose();
  }

  /// Số liệu gửi đi của một dòng: nhận đủ thì số con bằng số xuất và kg chấp nhận bằng kg cân lần hai.
  ReceiptLine _value(ShipmentLine l) {
    final i = _inputs[l.lineId]!;
    final sent = l.dispatchedCrabs ?? 0;
    final kg = parseDecimal(i.receivedKg.text) ?? 0;
    return _partial
        ? ReceiptLine(
            lineId: l.lineId,
            receivedCrabs: int.tryParse(i.receivedCrabs.text) ?? 0,
            receivedKg: kg,
            acceptedCrabs: int.tryParse(i.acceptedCrabs.text) ?? 0,
            acceptedKg: parseDecimal(i.acceptedKg.text) ?? 0,
          )
        : ReceiptLine(lineId: l.lineId, receivedCrabs: sent, receivedKg: kg, acceptedCrabs: sent, acceptedKg: sent > 0 ? kg : 0);
  }

  List<String> _problems(List<ReceiptLine> values) => [
    for (final (i, l) in _shipment.lines.indexed) ...[
      if (values[i].receivedCrabs > (l.dispatchedCrabs ?? 0))
        '${specLabel(l.specCode)}: số con nhận vượt số con xuất (${l.dispatchedCrabs ?? 0}).',
      if (values[i].acceptedCrabs > values[i].receivedCrabs) '${specLabel(l.specCode)}: số con chấp nhận vượt số con nhận.',
      if (values[i].acceptedKg > values[i].receivedKg) '${specLabel(l.specCode)}: kg chấp nhận vượt kg nhận.',
      if ((values[i].acceptedCrabs > 0) != (values[i].acceptedKg > 0))
        '${specLabel(l.specCode)}: thiếu kg ${_partial ? 'chấp nhận' : 'cân lần hai'}.',
    ],
  ];

  bool _discrepancy(List<ReceiptLine> values) => [
    for (final (i, l) in _shipment.lines.indexed)
      values[i].receivedCrabs != (l.dispatchedCrabs ?? 0) || values[i].acceptedCrabs != values[i].receivedCrabs,
  ].contains(true);

  Future<void> _submit(List<ReceiptLine> values) async {
    final crabs = values.fold(0, (n, v) => n + v.acceptedCrabs);
    final kg = values.fold(0.0, (n, v) => n + v.acceptedKg);
    final rejected = _partial ? _rejected.toList() : const <String>[];
    final ok = await showConfirmSheet(
      context,
      title: 'Lập biên bản nghiệm thu',
      message:
          'Khách chấp nhận $crabs con · ${formatKg(kg)}${rejected.isEmpty ? '' : ' · từ chối ${rejected.length} con'}. '
          'Biên bản gửi cho khách xác nhận.',
      confirmLabel: 'Lập biên bản',
    );
    if (ok == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(deliveryRepositoryProvider)
          .recordReceipt(
            _shipment.shipmentNo,
            values,
            rejectedCrabCodes: rejected,
            discrepancyReason: _partial ? _reason.text : null,
          );
      if (!mounted) return;
      showAppToast(context, 'Đã lập biên bản. Chờ khách xác nhận.');
      widget.onDone();
    } catch (error) {
      if (mounted) setState(() => _error = workError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    void changed(String _) => setState(() {});
    final values = [for (final l in _shipment.lines) _value(l)];
    final problems = _problems(values);
    final ready = problems.isEmpty && (!_discrepancy(values) || _reason.text.trim().isNotEmpty);
    final shipped = widget.view.shippedCrabs;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Giao tới khách', style: text.titleMedium),
        Text('Cân lần hai', style: text.bodySmall),
        if (!_partial)
          for (final l in _shipment.lines)
            if ((l.dispatchedCrabs ?? 0) > 0) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(specLabel(l.specCode), style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text('${l.dispatchedCrabs} con · xuất ${formatKg(l.dispatchedKg)}', style: text.bodySmall),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  SizedBox(
                    width: 150,
                    child: WorkNumberField(
                      controller: _inputs[l.lineId]!.receivedKg,
                      label: 'Cân',
                      unit: 'kg',
                      enabled: !_busy,
                      onChanged: changed,
                    ),
                  ),
                ],
              ),
            ],
        const SizedBox(height: 6),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _partial,
          onChanged: _busy ? null : (v) => setState(() => _partial = v ?? false),
          title: const Text('Thiếu hoặc khách từ chối một phần'),
        ),
        if (_partial) ...[
          for (final l in _shipment.lines.where((l) => (l.dispatchedCrabs ?? 0) > 0)) ...[
            const SizedBox(height: 8),
            Text(specLabel(l.specCode), style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('Đã xuất ${l.dispatchedCrabs ?? 0} con · ${formatKg(l.dispatchedKg)}', style: text.bodySmall),
            // Chừa chỗ cho nhãn nổi của ô nhập nằm trên mép ô.
            const SizedBox(height: 16),
            _pair(
              WorkNumberField(
                controller: _inputs[l.lineId]!.receivedCrabs,
                label: 'Số con nhận',
                unit: 'con',
                decimal: false,
                enabled: !_busy,
                onChanged: changed,
              ),
              WorkNumberField(
                controller: _inputs[l.lineId]!.receivedKg,
                label: 'Cân lần hai',
                unit: 'kg',
                enabled: !_busy,
                onChanged: changed,
              ),
            ),
            const SizedBox(height: 16),
            _pair(
              WorkNumberField(
                controller: _inputs[l.lineId]!.acceptedCrabs,
                label: 'Con chấp nhận',
                unit: 'con',
                decimal: false,
                enabled: !_busy,
                onChanged: changed,
              ),
              WorkNumberField(
                controller: _inputs[l.lineId]!.acceptedKg,
                label: 'Kg chấp nhận',
                unit: 'kg',
                enabled: !_busy,
                onChanged: changed,
              ),
            ),
          ],
          if (shipped.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text('Mã cua khách từ chối', style: text.bodySmall),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final (code, _) in shipped)
                  FilterChip(
                    label: Text(code),
                    selected: _rejected.contains(code),
                    onSelected: _busy
                        ? null
                        : (on) => setState(() => on ? _rejected.add(code) : _rejected.remove(code)),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            enabled: !_busy,
            minLines: 2,
            maxLines: 3,
            maxLength: 300,
            onChanged: changed,
            decoration: const InputDecoration(labelText: 'Lý do chênh lệch', fillColor: AppColors.background, counterText: ''),
          ),
          if (problems.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(problems.first, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
          ],
        ],
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!, style: const TextStyle(color: AppColors.danger)),
        ],
        const SizedBox(height: 14),
        FilledButton(
          onPressed: ready && !_busy ? () => _submit(values) : null,
          child: Text(_busy ? 'Đang ghi…' : (_shipment.acceptance == null ? 'Lập biên bản nghiệm thu' : 'Ghi lại biên bản')),
        ),
      ],
    );
  }

  static Widget _pair(Widget left, Widget right) => Row(
    children: [
      Expanded(child: left),
      const SizedBox(width: 10),
      Expanded(child: right),
    ],
  );
}

/// Thẻ bọc form nghiệm thu khi đây là việc chính của màn.
class ReceiptCard extends StatelessWidget {
  const ReceiptCard({super.key, required this.view, required this.onDone});
  final ShipmentView view;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) => AppCard(child: ReceiptForm(view: view, onDone: onDone));
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../measure/work_common.dart';
import 'delivery_models.dart';
import 'delivery_repository.dart';

/// Xuất hàng với cân lần một. Số con của từng dòng bằng số con đã phân bổ nên chỉ cần cân và ghi kg.
class DispatchForm extends ConsumerStatefulWidget {
  const DispatchForm({super.key, required this.view, required this.onDone});
  final ShipmentView view;
  final VoidCallback onDone;

  @override
  ConsumerState<DispatchForm> createState() => _DispatchFormState();
}

class _DispatchFormState extends ConsumerState<DispatchForm> {
  late final Map<int, TextEditingController> _kg = {
    for (final l in widget.view.shipment.lines) l.lineId: TextEditingController(),
  };
  late final _transport = TextEditingController(text: widget.view.shipment.transportCondition ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in _kg.values) {
      c.dispose();
    }
    _transport.dispose();
    super.dispose();
  }

  int _count(ShipmentLine l) => widget.view.allocatedOf(l.lineId);
  double _kgOf(ShipmentLine l) => parseDecimal(_kg[l.lineId]?.text ?? '') ?? 0;

  Future<void> _submit(List<ShipmentLine> lines) async {
    final s = widget.view.shipment;
    final crabs = lines.fold(0, (n, l) => n + _count(l));
    final kg = lines.fold(0.0, (n, l) => n + _kgOf(l));
    final ok = await showConfirmSheet(
      context,
      title: 'Xuất hàng',
      message: '$crabs con · ${formatKg(kg)}. Sau khi xuất không sửa được số cân lần một.',
      confirmLabel: 'Xuất hàng',
    );
    if (ok == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(deliveryRepositoryProvider)
          .dispatch(s.shipmentNo, [
            for (final l in s.lines) DispatchLine(lineId: l.lineId, crabs: _count(l), kg: _count(l) > 0 ? _kgOf(l) : 0),
          ], transportCondition: _transport.text);
      if (!mounted) return;
      showAppToast(context, 'Đã xuất hàng.');
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
    final lines = [for (final l in widget.view.shipment.lines) if (_count(l) > 0) l];
    if (lines.isEmpty) {
      return const AppCard(child: Text('Chưa có cua nào được phân bổ cho đợt này nên chưa xuất được.'));
    }
    final ready = lines.every((l) => _kgOf(l) > 0);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Xuất hàng', style: text.titleMedium),
          Text('Cân lần một', style: text.bodySmall),
          for (final l in lines) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(specLabel(l.specCode), style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text('${_count(l)} con', style: text.bodySmall),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 150,
                  child: WorkNumberField(
                    controller: _kg[l.lineId]!,
                    label: 'Cân',
                    unit: 'kg',
                    enabled: !_busy,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          ],
          const SizedBox(height: 14),
          FilledButton(
            onPressed: ready && !_busy ? () => _submit(lines) : null,
            child: Text(_busy ? 'Đang xuất…' : 'Xuất hàng'),
          ),
          MoreSection(
            label: 'Tuỳ chọn',
            children: [
              TextField(
                controller: _transport,
                enabled: !_busy,
                maxLength: 300,
                decoration: const InputDecoration(
                  labelText: 'Điều kiện vận chuyển',
                  fillColor: AppColors.background,
                  counterText: '',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import 'log_thresholds.dart';

class ProductionThresholdSection extends ConsumerStatefulWidget {
  const ProductionThresholdSection({
    super.key,
    required this.batchCode,
    required this.config,
    this.enabled = true,
    required this.onBusyChanged,
    required this.onSaved,
  });
  final String batchCode;
  final ProductionThresholds config;
  final bool enabled;
  final ValueChanged<bool> onBusyChanged;
  final ValueChanged<ProductionThresholdVersion> onSaved;

  @override
  ConsumerState<ProductionThresholdSection> createState() =>
      _ProductionThresholdSectionState();
}

class _ProductionThresholdSectionState
    extends ConsumerState<ProductionThresholdSection> {
  final _form = GlobalKey<FormState>();
  final _controllers = List.generate(6, (_) => TextEditingController());
  bool _editing = false;
  bool _saving = false;
  int _expectedVersion = 0;
  String? _error;

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    super.dispose();
  }

  void _edit() {
    final current = widget.config.current;
    final values = [
      current?.phMin,
      current?.phMax,
      current?.waterTempMinC,
      current?.waterTempMaxC,
      current?.salinityMinPpt,
      current?.salinityMaxPpt,
    ];
    for (var index = 0; index < values.length; index++) {
      _controllers[index].text = values[index] == null
          ? ''
          : formatLogNumber(values[index]);
    }
    setState(() {
      _expectedVersion = current?.versionNo ?? 0;
      _editing = true;
      _error = null;
    });
  }

  Future<void> _save() async {
    if (_saving ||
        !widget.config.canConfigure ||
        !(_form.currentState?.validate() ?? false)) {
      return;
    }
    final account = ref.read(productionAccountProvider);
    setState(() {
      _saving = true;
      _error = null;
    });
    widget.onBusyChanged(true);
    try {
      final values = _controllers
          .map((controller) => parseDecimal(controller.text)!)
          .toList();
      final savedVersion = await ref
          .read(productionActionsProvider)
          .saveThresholds(
            widget.batchCode,
            ProductionThresholdInput(
              expectedVersionNo: _expectedVersion,
              phMin: values[0],
              phMax: values[1],
              waterTempMinC: values[2],
              waterTempMaxC: values[3],
              salinityMinPpt: values[4],
              salinityMaxPpt: values[5],
            ),
          );
      if (!mounted || ref.read(productionAccountProvider) != account) return;
      widget.onSaved(savedVersion);
      setState(() => _editing = false);
    } catch (error) {
      if (mounted && ref.read(productionAccountProvider) == account) {
        setState(() => _error = apiErrorMessage(error));
      }
    } finally {
      if (mounted && ref.read(productionAccountProvider) == account) {
        setState(() => _saving = false);
        widget.onBusyChanged(false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = widget.config.current;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            current == null
                ? 'Chưa cấu hình ngưỡng nước'
                : 'Ngưỡng do Operator cấu hình · phiên bản ${current.versionNo}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          if (current == null)
            Text(
              widget.config.canConfigure
                  ? 'Cấu hình đủ ba khoảng trước khi ghi nhật ký đầu tiên.'
                  : 'Liên hệ Owner của Operator để cấu hình trước khi ghi nhật ký.',
            )
          else ...[
            Text('pH ${ValueRange(current.phMin, current.phMax).format()}'),
            Text(
              'Nhiệt độ ${ValueRange(current.waterTempMinC, current.waterTempMaxC).format()} °C',
            ),
            Text(
              'Độ mặn ${ValueRange(current.salinityMinPpt, current.salinityMaxPpt).format()} ppt',
            ),
            const SizedBox(height: 6),
            Text(
              'Người cấu hình #${current.createdBy} · ${formatDate(current.createdAt)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (widget.config.canConfigure && !_editing)
            TextButton(
              onPressed: widget.enabled ? _edit : null,
              child: Text(current == null ? 'Cấu hình ngưỡng' : 'Đổi ngưỡng'),
            ),
          if (_editing && widget.config.canConfigure) ...[
            const SizedBox(height: 12),
            const Text(
              'Nhập khoảng vận hành của lô. Cấu hình mới chỉ áp dụng cho nhật ký ghi sau khi lưu.',
            ),
            const SizedBox(height: 12),
            Form(
              key: _form,
              child: Column(
                children: [
                  for (final (index, name, label, min, max) in [
                    (0, 'phMin', 'pH thấp nhất', 0.0, 14.0),
                    (1, 'phMax', 'pH cao nhất', 0.0, 14.0),
                    (
                      2,
                      'waterTempMinC',
                      'Nhiệt độ thấp nhất (°C)',
                      -273.1,
                      999.9,
                    ),
                    (
                      3,
                      'waterTempMaxC',
                      'Nhiệt độ cao nhất (°C)',
                      -273.1,
                      999.9,
                    ),
                    (4, 'salinityMinPpt', 'Độ mặn thấp nhất (ppt)', 0.0, 999.9),
                    (5, 'salinityMaxPpt', 'Độ mặn cao nhất (ppt)', 0.0, 999.9),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: TextFormField(
                        key: ValueKey('threshold-$name'),
                        controller: _controllers[index],
                        enabled: !_saving && widget.enabled,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                          signed: true,
                        ),
                        decoration: InputDecoration(
                          labelText: label,
                          errorMaxLines: 3,
                        ),
                        validator: (text) {
                          final error = validateLogNumber(
                            text,
                            min: min,
                            max: max,
                          );
                          if (error != null) return error;
                          if (index.isOdd) {
                            final lower = parseDecimal(
                              _controllers[index - 1].text,
                            );
                            if (lower != null && parseDecimal(text!)! < lower) {
                              return 'Cận trên phải lớn hơn hoặc bằng cận dưới.';
                            }
                          }
                          return null;
                        },
                      ),
                    ),
                ],
              ),
            ),
            if (_error != null) ...[
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
              TextButton(
                onPressed: _saving
                    ? null
                    : () {
                        ref.invalidate(
                          productionThresholdsProvider(widget.batchCode),
                        );
                        setState(() => _editing = false);
                      },
                child: const Text('Tải cấu hình mới'),
              ),
            ],
            Wrap(
              spacing: 12,
              children: [
                FilledButton(
                  key: const ValueKey('save-thresholds'),
                  onPressed: _saving || !widget.enabled ? null : _save,
                  child: Text(_saving ? 'Đang lưu…' : 'Lưu ngưỡng'),
                ),
                TextButton(
                  onPressed: _saving
                      ? null
                      : () => setState(() {
                          _editing = false;
                          _error = null;
                        }),
                  child: const Text('Hủy'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

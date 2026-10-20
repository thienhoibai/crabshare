import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import 'log_thresholds.dart';
import 'production_threshold_section.dart';

class DailyLogFormPage extends ConsumerStatefulWidget {
  const DailyLogFormPage({super.key, this.initialBatchCode});
  final String? initialBatchCode;

  @override
  ConsumerState<DailyLogFormPage> createState() => _DailyLogFormPageState();
}

class _DailyLogFormPageState extends ConsumerState<DailyLogFormPage> {
  final _form = GlobalKey<FormState>();
  final _ph = TextEditingController();
  final _temp = TextEditingController();
  final _salinity = TextEditingController();
  final _feed = TextEditingController();
  final _note = TextEditingController();
  String? _batchCode;
  String? _error;
  bool _saving = false;
  bool _configSaving = false;
  final _loadedConfigs = <String, ProductionThresholds>{};

  @override
  void initState() {
    super.initState();
    _batchCode = widget.initialBatchCode;
  }

  @override
  void dispose() {
    for (final controller in [_ph, _temp, _salinity, _feed, _note]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save(ProductionThresholds config) async {
    if (_saving || _configSaving || !config.canRecord || config.current == null)
      return;
    if (!(_form.currentState?.validate() ?? false)) return;
    final batch = _batchCode;
    if (batch == null) return;
    final account = ref.read(productionAccountProvider);
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(productionActionsProvider)
          .submitLog(
            DailyLogInput(
              batchCode: batch,
              ph: parseDecimal(_ph.text)!,
              waterTempC: parseDecimal(_temp.text)!,
              salinityPpt: parseDecimal(_salinity.text)!,
              feedKg: parseDecimal(_feed.text)!,
              note: _note.text.trim().isEmpty ? null : _note.text.trim(),
            ),
          );
      if (!mounted || ref.read(productionAccountProvider) != account) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Đã lưu nhật ký lên máy chủ cho lô $batch.')),
      );
      Navigator.of(context).pop();
    } catch (error) {
      if (mounted && ref.read(productionAccountProvider) == account) {
        setState(() => _error = apiErrorMessage(error));
        // A midnight rollover or configuration change must use fresh server state.
        ref.invalidate(productionThresholdsProvider(batch));
      }
    } finally {
      if (mounted && ref.read(productionAccountProvider) == account) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(productionAccountProvider);
    ref.listen(productionAccountProvider, (previous, next) {
      if (previous == next) return;
      for (final controller in [_ph, _temp, _salinity, _feed, _note]) {
        controller.clear();
      }
      setState(() {
        _batchCode = null;
        _error = null;
        _saving = false;
        _configSaving = false;
        _loadedConfigs.clear();
      });
    });
    final batchesState = ref.watch(activeBatchesProvider);
    final batches = batchesState.isLoading || batchesState.hasError
        ? const <OperatorBatch>[]
        : (batchesState.value ?? const <OperatorBatch>[])
              .where((batch) => batch.allowsDailyLog)
              .toList();
    if (!batchesState.isLoading &&
        !batchesState.hasError &&
        !batches.any((batch) => batch.code == _batchCode)) {
      _batchCode = batches.isEmpty ? null : batches.first.code;
    }
    final code = _batchCode;
    final configState = code == null
        ? null
        : ref.watch(productionThresholdsProvider(code));
    final freshConfig =
        configState == null || configState.isLoading || configState.hasError
        ? null
        : configState.value;
    if (code != null && freshConfig != null) {
      _loadedConfigs[code] = freshConfig;
    }
    final config = freshConfig ?? _loadedConfigs[code];
    final current = config?.current;
    final selected = batches.where((batch) => batch.code == code).firstOrNull;
    final loggedOnBusinessDate =
        selected?.loggedToday == true &&
        selected?.businessDate == config?.businessDate;
    final busy =
        _saving ||
        _configSaving ||
        configState?.isLoading == true ||
        batchesState.isLoading;
    final canSave =
        !busy &&
        freshConfig != null &&
        config?.canRecord == true &&
        current != null &&
        selected != null &&
        !loggedOnBusinessDate;

    return Scaffold(
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Nhật ký hôm nay'),
              const SizedBox(height: 18),
              if (batchesState.isLoading) const LoadingSkeleton(rows: 1),
              if (batchesState.hasError)
                ErrorView(
                  message: apiErrorMessage(batchesState.error!),
                  onRetry: () => ref.invalidate(activeBatchesProvider),
                ),
              if (!batchesState.isLoading &&
                  !batchesState.hasError &&
                  batches.isEmpty)
                const EmptyState(
                  icon: Icons.edit_note_rounded,
                  title: 'Chưa có lô đang nuôi hoặc thu hoạch để ghi nhật ký.',
                ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final batch in batches)
                    ChoiceChip(
                      label: Text(batch.code),
                      selected: code == batch.code,
                      onSelected: busy
                          ? null
                          : (_) => setState(() {
                              _batchCode = batch.code;
                              _error = null;
                            }),
                      showCheckmark: false,
                    ),
                ],
              ),
              if (configState?.isLoading == true)
                const LoadingSkeleton(rows: 1),
              if (configState?.hasError == true)
                ErrorView(
                  message: apiErrorMessage(configState!.error!),
                  onRetry: () =>
                      ref.invalidate(productionThresholdsProvider(code!)),
                ),
              if (config != null && code != null) ...[
                const SizedBox(height: 16),
                Text(
                  'Ngày ${formatDate(config.businessDate)} · giờ Việt Nam (UTC+7)',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                ProductionThresholdSection(
                  key: ValueKey((code, account.hashCode)),
                  batchCode: code,
                  config: config,
                  enabled: !busy,
                  onBusyChanged: (saving) =>
                      setState(() => _configSaving = saving),
                  onSaved: (version) => setState(() {
                    _loadedConfigs[code] = ProductionThresholds(
                      businessDate: config.businessDate,
                      canConfigure: config.canConfigure,
                      canRecord: config.canRecord,
                      current: version,
                    );
                  }),
                ),
                if (loggedOnBusinessDate) ...[
                  const SizedBox(height: 12),
                  const Text('Lô đã có nhật ký thủ công hôm nay.'),
                ],
                if (current != null && !config.canRecord)
                  const Text('Lô hiện không được phép ghi nhật ký.'),
              ],
              const SizedBox(height: 16),
              _MetricInput(
                fieldKey: const ValueKey('log-ph'),
                controller: _ph,
                label: 'pH',
                unit: '',
                min: 0,
                max: 14,
                range: current == null
                    ? null
                    : ValueRange(current.phMin, current.phMax),
                enabled: !busy,
              ),
              _MetricInput(
                fieldKey: const ValueKey('log-waterTempC'),
                controller: _temp,
                label: 'Nhiệt độ nước',
                unit: '°C',
                min: -273.1,
                max: 999.9,
                range: current == null
                    ? null
                    : ValueRange(current.waterTempMinC, current.waterTempMaxC),
                enabled: !busy,
              ),
              _MetricInput(
                fieldKey: const ValueKey('log-salinityPpt'),
                controller: _salinity,
                label: 'Độ mặn',
                unit: 'ppt',
                min: 0,
                max: 999.9,
                range: current == null
                    ? null
                    : ValueRange(
                        current.salinityMinPpt,
                        current.salinityMaxPpt,
                      ),
                enabled: !busy,
              ),
              _MetricInput(
                fieldKey: const ValueKey('log-feedKg'),
                controller: _feed,
                label: 'Thức ăn',
                unit: 'kg',
                min: 0,
                max: 999999999.999,
                digits: 3,
                enabled: !busy,
              ),
              TextFormField(
                controller: _note,
                enabled: !busy,
                maxLines: 3,
                maxLength: 500,
                decoration: const InputDecoration(
                  labelText: 'Ghi chú',
                  hintText: 'Thay nước, thời tiết, cua bỏ ăn…',
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: AppColors.danger),
                  ),
                ),
              const SizedBox(height: 8),
              FilledButton(
                key: const ValueKey('save-log'),
                onPressed: canSave ? () => _save(config!) : null,
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      )
                    : const Text('Lưu nhật ký'),
              ),
              const SizedBox(height: 8),
              const Text(
                'Số đo ngoài ngưỡng vẫn được lưu và tạo cảnh báo. Ngày ghi được máy chủ xác định lúc lưu.',
                style: TextStyle(color: AppColors.inkMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetricInput extends StatefulWidget {
  const _MetricInput({
    required this.fieldKey,
    required this.controller,
    required this.label,
    required this.unit,
    required this.min,
    required this.max,
    required this.enabled,
    this.range,
    this.digits = 1,
  });
  final Key fieldKey;
  final TextEditingController controller;
  final String label;
  final String unit;
  final double min;
  final double max;
  final bool enabled;
  final ValueRange? range;
  final int digits;

  @override
  State<_MetricInput> createState() => _MetricInputState();
}

class _MetricInputState extends State<_MetricInput> {
  @override
  Widget build(BuildContext context) {
    final value = parseDecimal(widget.controller.text);
    final range = widget.range;
    final outside = value != null && range != null && !range.contains(value);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        key: widget.fieldKey,
        controller: widget.controller,
        enabled: widget.enabled,
        onChanged: (_) => setState(() {}),
        keyboardType: const TextInputType.numberWithOptions(
          decimal: true,
          signed: true,
        ),
        validator: (text) => validateLogNumber(
          text,
          min: widget.min,
          max: widget.max,
          digits: widget.digits,
        ),
        decoration: InputDecoration(
          labelText: widget.label,
          suffixText: widget.unit,
          errorMaxLines: 3,
          helperMaxLines: 3,
          helperText: range == null
              ? null
              : '${outside ? 'Ngoài ngưỡng' : 'Ngưỡng của lô'} ${range.format()}',
          helperStyle: TextStyle(
            color: outside ? AppColors.accentText : AppColors.inkMuted,
          ),
        ),
      ),
    );
  }
}

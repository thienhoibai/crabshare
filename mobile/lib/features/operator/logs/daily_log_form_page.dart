import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/care_log_repository.dart';
import 'log_numbers.dart';

/// Ghi nhật ký chăm sóc hôm nay cho một Lô: lượng thức ăn và ba chỉ số nước.
/// Ba chỉ số nước được điền sẵn từ số đo cảm biến gần nhất của Lô; người nuôi vẫn sửa tay được.
class DailyLogFormPage extends ConsumerStatefulWidget {
  const DailyLogFormPage({super.key, this.initialBatchCode});
  final String? initialBatchCode;

  @override
  ConsumerState<DailyLogFormPage> createState() => _DailyLogFormPageState();
}

class _DailyLogFormPageState extends ConsumerState<DailyLogFormPage> {
  final _form = GlobalKey<FormState>();

  /// Lô người dùng tự chọn; null thì lấy Lô mở sẵn, rồi tới Lô đầu tiên chưa ghi hôm nay.
  String? _picked;

  /// Chữ người dùng đã gõ ở từng ô; ô chưa gõ thì lấy số của cảm biến.
  final _typed = <String, String>{};
  String _note = '';
  bool _saving = false;
  String? _error;

  String? _fromSensor(String field, WaterReading? r) {
    final value = switch (field) {
      'ph' => r?.ph,
      'waterTempC' => r?.temperatureC,
      'salinityPpt' => r?.salinityPpt,
      _ => null,
    };
    return value == null ? null : prefillNumber(value);
  }

  String _text(String field, WaterReading? r) => _typed[field] ?? _fromSensor(field, r) ?? '';

  Future<void> _save(String batchCode, WaterReading? reading) async {
    if (_saving || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(careLogActionsProvider)
          .submit(
            DailyLogInput(
              batchCode: batchCode,
              feedKg: parseDecimal(_text('feedKg', reading))!,
              ph: parseDecimal(_text('ph', reading))!,
              waterTempC: parseDecimal(_text('waterTempC', reading))!,
              salinityPpt: parseDecimal(_text('salinityPpt', reading))!,
              note: _note.trim().isEmpty ? null : _note.trim(),
            ),
          );
      if (!mounted) return;
      showAppToast(context, 'Đã ghi nhật ký Lô $batchCode.');
      final navigator = Navigator.of(context);
      if (navigator.canPop()) {
        navigator.pop();
      } else {
        context.go(Routes.operatorToday);
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = apiErrorMessage(error);
        });
        // Lô có thể vừa được người khác ghi: tải lại tình trạng hôm nay.
        ref.invalidate(careBatchesProvider);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final batchesState = ref.watch(careBatchesProvider);
    final batches = [...?batchesState.value].where((b) => b.recordable).toList();
    CareBatch? byCode(String? code) => batches.where((b) => b.code == code).firstOrNull;
    final selected = byCode(_picked) ?? byCode(widget.initialBatchCode) ?? batches.where((b) => !b.loggedToday).firstOrNull ?? batches.firstOrNull;
    final reading = selected == null ? null : ref.watch(latestWaterProvider(selected.code)).value;
    final sensorUsed = reading != null && ['ph', 'waterTempC', 'salinityPpt'].every((f) => !_typed.containsKey(f) && _fromSensor(f, reading) != null);

    Widget number(String field, String label, String unit, {double min = 0, required double max, int digits = 1, bool autofocus = false}) =>
        KeyedSubtree(
          // Số của cảm biến về sau khi ô đã dựng thì dựng lại ô để nhận số điền sẵn; ô thức ăn không phụ thuộc cảm biến.
          key: ValueKey('$field-${selected?.code}-${field == 'feedKg' ? '' : reading?.measuredAt.millisecondsSinceEpoch}'),
          child: TextFormField(
            key: ValueKey('log-$field'),
            initialValue: _text(field, reading),
            enabled: !_saving,
            autofocus: autofocus,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (value) => setState(() => _typed[field] = value),
            validator: (text) => validateLogNumber(text, min: min, max: max, digits: digits),
            decoration: InputDecoration(labelText: label, suffixText: unit.isEmpty ? null : unit, errorMaxLines: 3),
          ),
        );

    return Scaffold(
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              SubPageHeader(
                title: 'Nhật ký hôm nay',
                trailing: Semantics(
                  label: 'Các bản đã ghi',
                  child: CircleIconButton(icon: Icons.history_rounded, onTap: () => context.push(Routes.operatorLogs)),
                ),
              ),
              const SizedBox(height: 16),
              if (batchesState.isLoading && !batchesState.hasValue) const LoadingSkeleton(rows: 1),
              if (batchesState.hasError && !batchesState.isLoading)
                ErrorView(message: apiErrorMessage(batchesState.error!), onRetry: () => ref.invalidate(careBatchesProvider)),
              if (batchesState.hasValue && batches.isEmpty) const EmptyState(icon: Icons.edit_note_rounded, title: 'Chưa có Lô nào đang lưu nuôi'),
              if (batches.length > 1) ...[
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final b in batches)
                      ChoiceChip(
                        label: Text(b.code),
                        avatar: b.loggedToday ? const Icon(Icons.check_rounded, size: 16, color: AppColors.success) : null,
                        selected: b.code == selected?.code,
                        showCheckmark: false,
                        onSelected: _saving
                            ? null
                            : (_) => setState(() {
                                _picked = b.code;
                                _typed.clear();
                                _error = null;
                              }),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
              if (selected != null) ...[
                Text(
                  [selected.title, if (selected.dayOfCycle != null) 'ngày nuôi ${selected.dayOfCycle}/${selected.cycleDays}'].join(' · '),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                // Nhãn của ô nhập nổi lên mép trên của ô nên cần chừa chỗ phía trên.
                const SizedBox(height: 22),
                if (selected.loggedToday)
                  _LoggedToday(log: selected.latestLog)
                else ...[
                  number('feedKg', 'Thức ăn đã cho', 'kg', max: 999999999.999, digits: 3, autofocus: true),
                  const SizedBox(height: 22),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: number('ph', 'pH', '', max: 14)),
                      const SizedBox(width: 8),
                      Expanded(child: number('waterTempC', 'Nhiệt độ', '°C', max: 999.9)),
                      const SizedBox(width: 8),
                      Expanded(child: number('salinityPpt', 'Độ mặn', '‰', max: 999.9)),
                    ],
                  ),
                  if (sensorUsed) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Chỉ số nước lấy từ cảm biến lúc ${formatTime(reading.measuredAt)} ${formatDayMonth(reading.measuredAt)}.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  MoreSection(
                    label: 'Ghi chú',
                    children: [
                      TextFormField(
                        key: const ValueKey('log-note'),
                        initialValue: _note,
                        enabled: !_saving,
                        maxLines: 3,
                        maxLength: 500,
                        onChanged: (value) => _note = value,
                        decoration: const InputDecoration(hintText: 'Thay nước, vệ sinh hộp, cua bỏ ăn…'),
                      ),
                    ],
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                    ),
                  const SizedBox(height: 8),
                  FilledButton(
                    key: const ValueKey('save-log'),
                    onPressed: _saving ? null : () => _save(selected.code, reading),
                    child: Text(_saving ? 'Đang lưu…' : 'Lưu nhật ký'),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Lô đã có nhật ký hôm nay: hiện lại bốn số vừa ghi thay cho form.
class _LoggedToday extends StatelessWidget {
  const _LoggedToday({required this.log});
  final DailyLog? log;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.check_circle_outline_rounded, color: AppColors.success),
            const SizedBox(width: 8),
            Expanded(child: Text('Hôm nay đã ghi nhật ký', style: Theme.of(context).textTheme.titleMedium)),
          ],
        ),
        if (log != null) ...[
          const SizedBox(height: 10),
          MetricRow(
            metrics: [
              Metric('kg thức ăn', formatLogNumber(log!.feedKg, digits: 3), color: AppColors.success),
              Metric('pH', formatLogNumber(log!.ph)),
              Metric('°C', formatLogNumber(log!.waterTempC), color: AppColors.danger),
              Metric('‰', formatLogNumber(log!.salinityPpt), color: AppColors.info),
            ],
          ),
        ],
      ],
    ),
  );
}

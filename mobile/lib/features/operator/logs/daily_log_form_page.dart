import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import 'log_thresholds.dart';

/// Form nhật ký ngày: người nuôi tự điền pH, nhiệt độ nước, độ mặn, thức ăn, ghi chú.
/// Mỗi trại một cách làm nên mình cung cấp chỗ nhập chung; trại có phần mềm riêng thì đẩy qua ingestion API.
class DailyLogFormPage extends ConsumerStatefulWidget {
  const DailyLogFormPage({super.key, this.initialBatchCode});

  final String? initialBatchCode;

  @override
  ConsumerState<DailyLogFormPage> createState() => _DailyLogFormPageState();
}

class _DailyLogFormPageState extends ConsumerState<DailyLogFormPage> {
  final _ph = TextEditingController();
  final _temp = TextEditingController();
  final _salinity = TextEditingController();
  final _feed = TextEditingController();
  final _note = TextEditingController();
  String? _batchCode;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _batchCode = widget.initialBatchCode;
  }

  @override
  void dispose() {
    for (final c in [_ph, _temp, _salinity, _feed, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    final batch = _batchCode;
    if (batch == null ||
        !(ref.read(activeBatchesProvider).value?.any((b) => b.code == batch) ??
            false)) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Chọn lô trước khi lưu.')));
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(operatorRepositoryProvider)
          .submitLog(
            DailyLogInput(
              batchCode: batch,
              ph: parseDecimal(_ph.text),
              waterTempC: parseDecimal(_temp.text),
              salinityPpt: parseDecimal(_salinity.text),
              feedKg: parseDecimal(_feed.text),
              note: _note.text.trim().isEmpty ? null : _note.text.trim(),
            ),
          );
      if (!mounted) return;
      ref.invalidate(dailyLogsProvider);
      ref.invalidate(activeBatchesProvider);
      ref.invalidate(todaySummaryProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Đã thử nhật ký minh hoạ lô $batch. Chưa lưu lên máy chủ.',
          ),
        ),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiErrorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final batchesState = ref.watch(activeBatchesProvider);
    final batches = batchesState.value ?? const <OperatorBatch>[];
    _batchCode ??= batches.isEmpty ? null : batches.first.code;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            const SubPageHeader(title: 'Nhật ký hôm nay'),
            const SizedBox(height: 18),
            const DemoNotice(),
            if (batchesState.isLoading) const LoadingSkeleton(rows: 1),
            if (batchesState.hasError)
              ErrorView(
                message: apiErrorMessage(batchesState.error!),
                onRetry: () => ref.invalidate(activeBatchesProvider),
              ),
            Wrap(
              spacing: 8,
              children: [
                for (final b in batches)
                  ChoiceChip(
                    label: Text(b.code),
                    selected: _batchCode == b.code,
                    onSelected: (_) => setState(() => _batchCode = b.code),
                    showCheckmark: false,
                    backgroundColor: AppColors.surface,
                    selectedColor: AppColors.ink,
                    labelStyle: TextStyle(
                      color: _batchCode == b.code
                          ? Colors.white
                          : AppColors.ink,
                      fontWeight: FontWeight.w600,
                    ),
                    side: BorderSide.none,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            GridView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount:
                    MediaQuery.sizeOf(context).width < 360 ||
                        MediaQuery.textScalerOf(context).scale(1) > 1.2
                    ? 1
                    : 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                mainAxisExtent:
                    168 *
                    MediaQuery.textScalerOf(context).scale(1).clamp(1, 1.6),
              ),
              children: [
                _MetricInput(
                  controller: _ph,
                  label: 'pH',
                  unit: '',
                  icon: Icons.science_outlined,
                  range: LogThresholds.ph,
                ),
                _MetricInput(
                  controller: _temp,
                  label: 'Nhiệt độ nước',
                  unit: '°C',
                  icon: Icons.thermostat_outlined,
                  range: LogThresholds.waterTempC,
                ),
                _MetricInput(
                  controller: _salinity,
                  label: 'Độ mặn',
                  unit: '‰',
                  icon: Icons.water_drop_outlined,
                  range: LogThresholds.salinityPpt,
                ),
                _MetricInput(
                  controller: _feed,
                  label: 'Thức ăn',
                  unit: 'kg',
                  icon: Icons.set_meal_outlined,
                  range: LogThresholds.feedKg,
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              maxLines: 3,
              maxLength: 500,
              decoration: const InputDecoration(
                hintText: 'Ghi chú (thay nước, thời tiết, cua bỏ ăn…)',
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed:
                  _saving ||
                      batchesState.isLoading ||
                      batchesState.hasError ||
                      !batches.any((b) => b.code == _batchCode)
                  ? null
                  : _save,
              child: _saving
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Lưu nhật ký minh hoạ'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ô nhập một chỉ số: số lớn ở giữa, báo cam khi ngoài khoảng thường gặp.
class _MetricInput extends StatefulWidget {
  const _MetricInput({
    required this.controller,
    required this.label,
    required this.unit,
    required this.icon,
    required this.range,
  });

  final TextEditingController controller;
  final String label;
  final String unit;
  final IconData icon;
  final ValueRange range;

  @override
  State<_MetricInput> createState() => _MetricInputState();
}

class _MetricInputState extends State<_MetricInput> {
  @override
  Widget build(BuildContext context) {
    final value = parseDecimal(widget.controller.text);
    final outOfRange = value != null && !widget.range.contains(value);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(
          color: outOfRange ? AppColors.accent : Colors.transparent,
          width: 2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(widget.icon, size: 20, color: AppColors.accentText),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  widget.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const Spacer(),
          TextField(
            controller: widget.controller,
            onChanged: (_) => setState(() {}),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700),
            decoration: InputDecoration(
              hintText: '—',
              suffixText: widget.unit,
              filled: false,
              isDense: true,
              contentPadding: EdgeInsets.zero,
              border: InputBorder.none,
            ),
          ),
          const Spacer(),
          Text(
            outOfRange
                ? 'Ngoài khoảng ${widget.range.format()}'
                : 'Thường gặp ${widget.range.format()}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              color: outOfRange ? AppColors.accentText : AppColors.inkMuted,
              fontWeight: outOfRange ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}

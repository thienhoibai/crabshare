import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../data/holding_models.dart';
import '../data/holding_repository.dart';
import '../logs/log_numbers.dart';
import 'crab_sheet_forms.dart';

/// Phiếu của con cua đang ở một hộp: tình trạng và các thao tác tại hộp (đã kiểm tra, lột xác, ăn kém, chuyển hộp, báo chết).
/// Lịch sử và nguồn cua nằm trong khối gấp. Trả về câu báo thành công, hoặc null khi người dùng đóng.
Future<String?> showCrabSheet(BuildContext context, {required String batchCode, required BoxState box, List<BoxState> emptyBoxes = const []}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => _CrabSheet(batchCode: batchCode, box: box, emptyBoxes: emptyBoxes),
    );

enum _Mode { actions, dead, move }

class _CrabSheet extends ConsumerStatefulWidget {
  const _CrabSheet({required this.batchCode, required this.box, required this.emptyBoxes});
  final String batchCode;
  final BoxState box;
  final List<BoxState> emptyBoxes;

  @override
  ConsumerState<_CrabSheet> createState() => _CrabSheetState();
}

class _CrabSheetState extends ConsumerState<_CrabSheet> {
  _Mode _mode = _Mode.actions;
  bool _busy = false;
  String? _error;

  String get _slot => widget.box.slotCode;
  String get _crabCode => widget.box.crabCode!;

  Future<void> _run(Future<void> Function() work, String done) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await work();
      if (mounted) Navigator.of(context).pop(done);
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = apiErrorMessage(error);
        });
      }
    }
  }

  /// Sự kiện không cần ảnh: hỏi lại một lần, kèm ô ghi chú tuỳ chọn.
  Future<void> _record(String eventType, String label, {String? message}) async {
    final note = await showConfirmSheet(
      context,
      title: '$label · hộp $_slot',
      message: message,
      confirmLabel: 'Ghi',
      reasonLabel: 'Ghi chú (không bắt buộc)',
    );
    if (note == null || !mounted) return;
    await _run(
      () => ref.read(boxActionsProvider).record(batchCode: widget.batchCode, crabCode: _crabCode, eventType: eventType, note: note),
      'Đã ghi "$label" cho hộp $_slot.',
    );
  }

  void _back() => setState(() {
    _mode = _Mode.actions;
    _error = null;
  });

  @override
  Widget build(BuildContext context) {
    final actions = ref.read(boxActionsProvider);
    return PopScope(
      canPop: !_busy,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
          child: SafeArea(
            top: false,
            child: switch (_mode) {
              _Mode.actions => _actions(context),
              _Mode.dead => CrabDeadForm(
                slotCode: _slot,
                busy: _busy,
                error: _error,
                onBack: _back,
                onSubmit: (photo, note) => _run(
                  () => actions.reportDead(batchCode: widget.batchCode, crabCode: _crabCode, slotCode: _slot, photo: photo, note: note),
                  'Đã ghi cua chết ở hộp $_slot.',
                ),
              ),
              _Mode.move => CrabMoveForm(
                slotCode: _slot,
                emptyBoxes: widget.emptyBoxes,
                busy: _busy,
                error: _error,
                onBack: _back,
                onSubmit: (target, reason) => _run(
                  () => actions.move(batchCode: widget.batchCode, crabCode: _crabCode, slotCode: target, reason: reason),
                  'Đã chuyển cua sang hộp $target.',
                ),
              ),
            },
          ),
        ),
      ),
    );
  }

  Widget _actions(BuildContext context) {
    final detail = ref.watch(crabProvider(_crabCode));
    final crab = detail.value;
    final secondary = OutlinedButton.styleFrom(
      minimumSize: const Size.fromHeight(52),
      foregroundColor: AppColors.ink,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text('Hộp $_slot', style: Theme.of(context).textTheme.titleLarge)),
            StatusPill(kind: 'crabCondition', value: crab?.condition ?? widget.box.crabCondition),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          crab == null
              ? 'Cua $_crabCode'
              : 'Cua $_crabCode · ${statusLabel('sex', crab.sex)} · ${formatLogNumber(crab.receivedWeightG, digits: 0)} g lúc nhận',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _busy ? null : () => _record('Inspected', 'Đã kiểm tra'),
          icon: const Icon(Icons.check_rounded),
          label: Text(_busy ? 'Đang gửi…' : 'Đã kiểm tra'),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                style: secondary,
                onPressed: _busy ? null : () => _record('Molted', 'Lột xác', message: 'Tình trạng cua chuyển sang "Đang lột".'),
                child: const Text('Lột xác'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton(
                style: secondary,
                onPressed: _busy ? null : () => _record('AbnormalFeeding', 'Ăn kém'),
                child: const Text('Ăn kém'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                style: secondary,
                onPressed: _busy ? null : () => setState(() => _mode = _Mode.move),
                child: const Text('Chuyển hộp'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton(
                style: secondary.copyWith(
                  foregroundColor: const WidgetStatePropertyAll(AppColors.danger),
                  side: const WidgetStatePropertyAll(BorderSide(color: AppColors.danger)),
                ),
                onPressed: _busy ? null : () => setState(() => _mode = _Mode.dead),
                child: const Text('Báo chết'),
              ),
            ),
          ],
        ),
        if (_error != null) ...[const SizedBox(height: 10), Text(_error!, style: const TextStyle(color: AppColors.danger))],
        const SizedBox(height: 6),
        MoreSection(
          label: 'Lịch sử',
          children: [
            if (detail.isLoading)
              const Padding(
                padding: EdgeInsets.all(12),
                child: Center(child: CircularProgressIndicator(strokeWidth: 3)),
              )
            else if (crab == null)
              Text(detail.hasError ? apiErrorMessage(detail.error!) : 'Chưa có sự kiện nào.', style: Theme.of(context).textTheme.bodySmall)
            else
              for (final e in crab.events.reversed) _EventRow(event: e),
          ],
        ),
        if (crab != null)
          MoreSection(
            label: 'Nguồn cua',
            children: [
              KeyValueList(
                rows: [
                  ('Vùng xuất xứ', crab.originRegion),
                  ('Ngày thu', crab.harvestedOn == null ? null : formatDate(crab.harvestedOn!)),
                  ('Nhận vào tồn', crab.receivedAt == null ? null : formatDate(crab.receivedAt!)),
                  ('Độ trưởng thành', statusLabel('maturity', crab.maturity)),
                  ('Lô nguồn', crab.lotCode),
                  if (crab.replacesCrabCode != null) ('Thả bù thay', crab.replacesCrabCode),
                ],
              ),
            ],
          ),
      ],
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event});
  final CrabEvent event;

  @override
  Widget build(BuildContext context) {
    final e = event;
    final detail = [
      if (e.slotCode != null) 'Hộp ${e.slotCode}',
      if (e.reason != null && e.reason!.isNotEmpty) e.reason!,
      if (e.weightG != null) '${formatLogNumber(e.weightG, digits: 0)} g',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(crabEventLabel(e.type), style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              Text('${formatDayMonth(e.occurredAt)} ${formatTime(e.occurredAt)}', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          if (detail.isNotEmpty) Text(detail, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

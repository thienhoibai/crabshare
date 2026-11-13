import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import 'measure_models.dart';
import 'measure_repository.dart';
import 'work_common.dart';

/// Chọn con cua theo số hộp rồi mở lượt đo. Mặc định đo bằng trạm của trại; đo tay và đổi trạm nằm trong "Tuỳ chọn".
class CrabPicker extends ConsumerStatefulWidget {
  const CrabPicker({super.key, required this.board, required this.onOpened});

  final MeasureBoard board;
  final void Function(MeasureSession session, WaitingCrab crab) onOpened;

  @override
  ConsumerState<CrabPicker> createState() => _CrabPickerState();
}

class _CrabPickerState extends ConsumerState<CrabPicker> {
  static const _shown = 5;

  final _search = TextEditingController();
  String? _pickedCode;
  String? _stationCode;
  bool _byHand = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Station> get _stations => widget.board.stations;
  bool get _manual => _byHand || _stations.isEmpty;
  Station? get _station =>
      _stations.isEmpty ? null : _stations.firstWhere((s) => s.code == _stationCode, orElse: () => _stations.first);

  Future<void> _open(WaitingCrab crab) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await ref
          .read(measureRepositoryProvider)
          .openSession(crabCode: crab.crabCode, stationCode: _manual ? null : _station!.code);
      if (!mounted) return;
      setState(() => _busy = false);
      widget.onOpened(session, crab);
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = workError(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final measured = widget.board.measuredCodes;
    final all = widget.board.pickList;
    final query = _search.text.trim().toLowerCase();
    final matches = query.isEmpty
        ? all
        : [
            for (final c in all)
              if ((c.slotCode ?? '').toLowerCase().contains(query) || c.crabCode.toLowerCase().contains(query)) c,
          ];
    final picked = all.where((c) => c.crabCode == _pickedCode).firstOrNull;
    final numericBoxes = all.every((c) => c.slotCode != null && int.tryParse(c.slotCode!) != null);
    final station = _station;
    final where = picked == null ? '' : ' · ${picked.slotCode == null ? picked.crabCode : 'hộp ${picked.slotCode}'}';

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Chọn cua cần đo', style: text.titleMedium),
          const SizedBox(height: 10),
          if (_manual)
            const InfoChip(label: 'Đo tay bằng cân và thước kẹp', icon: Icons.straighten_rounded, background: AppColors.surfaceMuted)
          else
            Row(
              children: [
                const Icon(Icons.scale_rounded, size: 18, color: AppColors.inkMuted),
                const SizedBox(width: 6),
                Flexible(child: Text('Trạm ${station!.code}', style: const TextStyle(fontWeight: FontWeight.w600))),
                const SizedBox(width: 8),
                StatusPill(kind: 'device', value: station.status),
              ],
            ),
          const SizedBox(height: 12),
          TextField(
            controller: _search,
            onChanged: (_) => setState(() {}),
            keyboardType: numericBoxes ? TextInputType.number : TextInputType.text,
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              hintText: 'Số hộp',
              prefixIcon: Icon(Icons.search_rounded),
              fillColor: AppColors.background,
            ),
          ),
          const SizedBox(height: 8),
          if (matches.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Text('Không có hộp nào khớp', textAlign: TextAlign.center, style: text.bodySmall),
            ),
          for (final crab in matches.take(_shown))
            _CrabRow(
              crab: crab,
              measured: measured.contains(crab.crabCode),
              selected: crab.crabCode == _pickedCode,
              onTap: _busy ? null : () => setState(() => _pickedCode = crab.crabCode),
            ),
          if (matches.length > _shown)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Còn ${matches.length - _shown} con khác, gõ số hộp để tìm', style: text.bodySmall),
            ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: picked == null || _busy ? null : () => _open(picked),
            child: Text(_busy ? 'Đang mở…' : '${_manual ? 'Mở lượt đo tay' : 'Mở lượt đo'}$where'),
          ),
          if (_stations.isNotEmpty)
            MoreSection(
              label: 'Tuỳ chọn',
              children: [
                if (_stations.length > 1 && !_byHand)
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in _stations)
                        ChoiceChip(
                          label: Text(s.code),
                          selected: s.code == station!.code,
                          onSelected: (_) => setState(() => _stationCode = s.code),
                        ),
                    ],
                  ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _byHand,
                  onChanged: _busy ? null : (v) => setState(() => _byHand = v),
                  title: const Text('Đo tay bằng cân và thước kẹp'),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// Một dòng chọn cua: số hộp lớn, mã cua nhỏ.
class _CrabRow extends StatelessWidget {
  const _CrabRow({required this.crab, required this.measured, required this.selected, required this.onTap});
  final WaitingCrab crab;
  final bool measured;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final box = crab.slotCode;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Material(
        color: selected ? AppColors.accentSoft : AppColors.background,
        borderRadius: BorderRadius.circular(AppRadius.chip),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          box == null ? crab.crabCode : 'Hộp $box',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                        ),
                        if (box != null) Text(crab.crabCode, style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  if (measured) const InfoChip(label: 'Đã đo', background: AppColors.surface, foreground: AppColors.inkMuted),
                  const SizedBox(width: 8),
                  Icon(
                    selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                    color: selected ? AppColors.accentText : AppColors.inkMuted,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

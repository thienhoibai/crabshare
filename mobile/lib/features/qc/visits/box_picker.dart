import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../data/site_visit_repository.dart';

/// Chọn các hộp đã xem bằng cách bấm vào mã hộp. Trại nhiều hộp thì gõ vài ký tự để tìm; hộp đã chọn luôn nằm trên cùng.
class BoxPicker extends StatefulWidget {
  const BoxPicker({super.key, required this.boxes, required this.picked, required this.onToggle});
  final List<VisitBox> boxes;
  final Set<String> picked;

  /// Bấm một hộp: chọn nếu chưa chọn, bỏ chọn nếu đã chọn.
  final ValueChanged<String> onToggle;

  /// Số hộp hiện tối đa khi chưa tìm.
  static const pageSize = 24;

  @override
  State<BoxPicker> createState() => _BoxPickerState();
}

class _BoxPickerState extends State<BoxPicker> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _query.text.trim().toUpperCase();
    final matches = [
      for (final b in widget.boxes)
        if (query.isEmpty || b.slotCode.toUpperCase().contains(query)) b,
    ];
    final shown = matches.take(BoxPicker.pageSize).toList();
    final shownCodes = {for (final b in shown) b.slotCode};
    final pickedAbove = [
      for (final b in widget.boxes)
        if (widget.picked.contains(b.slotCode) && !shownCodes.contains(b.slotCode)) b,
    ];
    final more = matches.length - shown.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.boxes.length > BoxPicker.pageSize) ...[
          TextField(
            controller: _query,
            textCapitalization: TextCapitalization.characters,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              hintText: 'Tìm mã hộp',
              prefixIcon: Icon(Icons.search_rounded),
              fillColor: AppColors.background,
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
        ],
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final b in [...pickedAbove, ...shown])
              _BoxChip(box: b, picked: widget.picked.contains(b.slotCode), onTap: () => widget.onToggle(b.slotCode)),
          ],
        ),
        if (more > 0)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Còn $more hộp khác, gõ mã để tìm.', style: Theme.of(context).textTheme.bodySmall),
          ),
      ],
    );
  }
}

class _BoxChip extends StatelessWidget {
  const _BoxChip({required this.box, required this.picked, required this.onTap});
  final VisitBox box;
  final bool picked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: picked,
      child: Material(
        color: picked ? AppColors.ink : (box.occupied ? AppColors.accentSoft : AppColors.surfaceMuted),
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48, minWidth: 64),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Center(
              widthFactor: 1,
              child: Text(
                box.slotCode,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: picked ? Colors.white : (box.occupied ? AppColors.ink : AppColors.inkMuted),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

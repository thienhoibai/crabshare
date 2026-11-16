import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/status_labels.dart';
import '../data/holding_models.dart';

/// Tình trạng một hộp trên sơ đồ, quyết định màu ô.
enum BoxLook {
  healthy(AppColors.success),
  attention(AppColors.warning),
  dead(AppColors.danger),
  empty(AppColors.inkMuted),
  maintenance(AppColors.inkMuted);

  const BoxLook(this.color);
  final Color color;

  /// [deadCrabCode] khác null: hộp trống vì con ở đó đã chết và chưa thả bù.
  static BoxLook of(BoxState box, {String? deadCrabCode}) {
    if (box.inMaintenance) return maintenance;
    if (!box.hasCrab) return deadCrabCode != null ? dead : empty;
    return box.crabCondition == 'Weak' || box.crabCondition == 'Molting' ? attention : healthy;
  }
}

const boxGridDelegate = SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 1);

/// Một ô hộp trên sơ đồ: số hộp và một chữ tình trạng, màu theo [BoxLook].
class BoxTile extends StatelessWidget {
  const BoxTile({super.key, required this.box, required this.look, required this.onTap});
  final BoxState box;
  final BoxLook look;
  final VoidCallback? onTap;

  String get _label => switch (look) {
    BoxLook.maintenance => 'Bảo trì',
    BoxLook.dead => 'Chết',
    BoxLook.empty => 'Trống',
    _ => statusLabel('crabCondition', box.crabCondition),
  };

  @override
  Widget build(BuildContext context) {
    final plain = look == BoxLook.empty;
    return Semantics(
      button: true,
      label: 'Hộp ${box.slotCode}, $_label',
      child: Material(
        color: plain
            ? AppColors.surface
            : look == BoxLook.maintenance
            ? AppColors.surfaceMuted
            : look.color.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ExcludeSemantics(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(box.slotCode, maxLines: 1, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  _label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  // Màu nền báo tình trạng; chữ giữ màu đậm cho dễ đọc ngoài trời.
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: plain || look == BoxLook.maintenance ? AppColors.inkMuted : AppColors.ink,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

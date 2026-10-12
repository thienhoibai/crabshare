import 'package:material_ui/material_ui.dart';

import '../../app/theme/app_theme.dart';

/// Bộ khối giao diện dùng chung theo mẫu (thẻ trắng bo lớn, chip icon, thanh "+", tiêu đề mục...).
/// Màn hình nào cũng ghép từ các khối này để giữ một phong cách.

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(16), this.color = AppColors.surface});

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(AppRadius.card),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
    );
  }
}

/// Lời chào đầu trang: avatar chữ cái + tên + nút chuông.
class GreetingHeader extends StatelessWidget {
  const GreetingHeader({super.key, required this.name, required this.subtitle, this.onBell});

  final String name;
  final String subtitle;
  final VoidCallback? onBell;

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().isEmpty ? '?' : name.trim().split(RegExp(r'\s+')).last.characters.first.toUpperCase();
    return Row(
      children: [
        CircleAvatar(
          radius: 24,
          backgroundColor: AppColors.accentSoft,
          child: Text(initials, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.accentText, fontSize: 18)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Xin chào, $name', maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
              Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        CircleIconButton(icon: Icons.notifications_none_rounded, onTap: onBell),
      ],
    );
  }
}

class CircleIconButton extends StatelessWidget {
  const CircleIconButton({super.key, required this.icon, this.onTap, this.background = AppColors.surface, this.foreground = AppColors.ink, this.size = 46});

  final IconData icon;
  final VoidCallback? onTap;
  final Color background;
  final Color foreground;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(width: size, height: size, child: Icon(icon, color: foreground, size: size * 0.48)),
      ),
    );
  }
}

/// Thanh "+" rộng (mẫu: thêm bữa ăn) — ở đây: ghi nhật ký / góp vốn lô mới.
class AddBar extends StatelessWidget {
  const AddBar({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceMuted,
      borderRadius: BorderRadius.circular(AppRadius.chip),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.chip),
        onTap: onTap,
        child: SizedBox(
          height: 54,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: const BoxDecoration(color: AppColors.ink, shape: BoxShape.circle),
                child: const Icon(Icons.add_rounded, color: Colors.white, size: 18),
              ),
              const SizedBox(width: 10),
              Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium)),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Trending Recipes ........ See All"
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, this.actionLabel, this.onAction});

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 22, bottom: 12),
      child: Row(
        children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
          if (actionLabel != null)
            GestureDetector(
              onTap: onAction,
              child: Text(actionLabel!, style: const TextStyle(color: AppColors.inkMuted, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}

/// Một chỉ số nhỏ có chấm màu (mẫu: Protein · Carbs · Fat).
class Metric {
  const Metric(this.label, this.value, {this.color = AppColors.accent});
  final String label;
  final String value;
  final Color color;
}

class MetricRow extends StatelessWidget {
  const MetricRow({super.key, required this.metrics});

  final List<Metric> metrics;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 14,
      runSpacing: 6,
      children: [
        for (final m in metrics)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 7, height: 7, decoration: BoxDecoration(color: m.color, shape: BoxShape.circle)),
              const SizedBox(width: 5),
              Text(m.value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(width: 3),
              Text(m.label, style: const TextStyle(color: AppColors.inkMuted, fontSize: 13)),
            ],
          ),
      ],
    );
  }
}

/// Chip danh mục: icon trong ô vuông trắng bo góc + nhãn bên dưới.
class CategoryChip extends StatelessWidget {
  const CategoryChip({super.key, required this.icon, required this.label, required this.selected, required this.onTap});

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 62,
            height: 62,
            decoration: BoxDecoration(
              color: selected ? AppColors.accent : AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.chip),
            ),
            child: Icon(icon, color: selected ? AppColors.ink : AppColors.accentText, size: 26),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, fontWeight: selected ? FontWeight.w700 : FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

/// Thanh tiến độ mảnh bo tròn (mẫu: thanh độ khó).
class SoftProgressBar extends StatelessWidget {
  const SoftProgressBar({super.key, required this.value, this.height = 8, this.color = AppColors.accent});

  final double value;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height),
      child: LinearProgressIndicator(
        value: value.clamp(0.0, 1.0),
        minHeight: height,
        backgroundColor: AppColors.surfaceMuted,
        valueColor: AlwaysStoppedAnimation(color),
      ),
    );
  }
}

/// Chip nhỏ nổi trên ảnh (mẫu: "15 min", "★ 4.8").
class InfoChip extends StatelessWidget {
  const InfoChip({super.key, required this.label, this.icon, this.background = AppColors.surface, this.foreground = AppColors.ink});

  final String label;
  final IconData? icon;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 15, color: foreground), const SizedBox(width: 4)],
          Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: foreground)),
        ],
      ),
    );
  }
}

/// Ảnh bo góc lấy từ assets (ảnh thật của lô sẽ thay bằng Image.network khi có API).
class RoundedImage extends StatelessWidget {
  const RoundedImage(this.asset, {super.key, this.width, this.height, this.radius = 16});

  final String asset;
  final double? width;
  final double? height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.asset(asset, width: width, height: height, fit: BoxFit.cover),
    );
  }
}

/// Ô icon nền cam nhạt (đầu dòng thông báo, cảnh báo...).
class IconTile extends StatelessWidget {
  const IconTile({super.key, required this.icon, this.background = AppColors.accentSoft, this.foreground = AppColors.accentText, this.size = 46});

  final IconData icon;
  final Color background;
  final Color foreground;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(14)),
      child: Icon(icon, color: foreground, size: size * 0.5),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message});

  final IconData icon;
  final String title;
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
      child: Column(
        children: [
          IconTile(icon: icon, size: 64),
          const SizedBox(height: 14),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(message!, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const IconTile(icon: Icons.wifi_off_rounded, size: 64),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 14),
            OutlinedButton(onPressed: onRetry, child: const Text('Thử lại')),
          ],
        ),
      ),
    );
  }
}

/// Thanh tiêu đề cho màn hình con: nút quay lại tròn + tiêu đề.
class SubPageHeader extends StatelessWidget {
  const SubPageHeader({super.key, required this.title, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        CircleIconButton(icon: Icons.arrow_back_rounded, onTap: () => Navigator.of(context).maybePop()),
        const SizedBox(width: 12),
        Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge, maxLines: 1, overflow: TextOverflow.ellipsis)),
        ?trailing,
      ],
    );
  }
}

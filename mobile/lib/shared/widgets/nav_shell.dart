import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme/app_theme.dart';

/// Khoảng trống dưới cùng để nội dung không bị thanh điều hướng nổi che mất.
const kNavBarClearance = 120.0;

class NavItem {
  const NavItem(this.icon, this.label, {this.badgeCount = 0});
  final IconData icon;
  final String label;
  final int badgeCount;
}

/// Khung chung của 2 vai: thanh điều hướng tối bo tròn + nút tròn cam ở giữa (theo mẫu).
/// 4 tab là 4 nhánh của StatefulShellRoute; nút giữa mở một màn hình riêng (quét tem / chụp bằng chứng).
class NavShell extends StatelessWidget {
  const NavShell({
    super.key,
    required this.shell,
    required this.items,
    required this.centerIcon,
    required this.centerLabel,
    required this.onCenter,
  }) : assert(items.length == 4, 'Thanh điều hướng có đúng 4 tab + 1 nút giữa');

  final StatefulNavigationShell shell;
  final List<NavItem> items;
  final IconData centerIcon;
  final String centerLabel;
  final VoidCallback onCenter;

  void _goTab(int index) =>
      shell.goBranch(index, initialLocation: index == shell.currentIndex);

  @override
  Widget build(BuildContext context) {
    Widget tab(int i) => Expanded(
      child: _NavTab(
        item: items[i],
        selected: shell.currentIndex == i,
        onTap: () => _goTab(i),
      ),
    );

    return Scaffold(
      extendBody: true,
      body: shell,
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 0, 16, 14),
        child: Container(
          height: 70,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: AppColors.nav,
            borderRadius: BorderRadius.circular(35),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.18),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            children: [
              tab(0),
              tab(1),
              Expanded(
                child: Center(
                  child: Semantics(
                    button: true,
                    label: centerLabel,
                    child: GestureDetector(
                      onTap: onCenter,
                      child: Container(
                        width: 54,
                        height: 54,
                        decoration: const BoxDecoration(
                          color: AppColors.accent,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(centerIcon, color: AppColors.ink, size: 26),
                      ),
                    ),
                  ),
                ),
              ),
              tab(2),
              tab(3),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavTab extends StatelessWidget {
  const _NavTab({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final NavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: item.badgeCount > 0
          ? '${item.label}, ${item.badgeCount} chưa đọc'
          : item.label,
      child: InkResponse(
        onTap: onTap,
        radius: 28,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  item.icon,
                  size: 25,
                  color: selected ? Colors.white : const Color(0xFF8A8580),
                ),
                if (item.badgeCount > 0)
                  Positioned(
                    right: -12,
                    top: -7,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 1,
                      ),
                      decoration: const BoxDecoration(
                        color: AppColors.accent,
                        borderRadius: BorderRadius.all(Radius.circular(20)),
                      ),
                      child: Text(
                        item.badgeCount > 99 ? '99+' : '${item.badgeCount}',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 5),
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: selected ? 5 : 0,
              height: 5,
              decoration: const BoxDecoration(
                color: AppColors.accent,
                shape: BoxShape.circle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

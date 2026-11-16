import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../app/routes.dart';
import '../../app/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/app_ui.dart';
import '../../shared/widgets/nav_shell.dart';

/// Tab "Tài khoản" dùng chung cho mọi khu: hồ sơ, đổi khu khi có nhiều vai, mục theo vai, đăng xuất.
class AccountPage extends ConsumerWidget {
  const AccountPage({super.key});

  static const _roleLabels = {
    Roles.investor: 'Nhà đầu tư',
    Roles.customer: 'Khách hàng',
    Roles.operatorMember: 'Người nuôi',
    Roles.qcInspector: 'Nhân viên kiểm phẩm',
    Roles.platformAdmin: 'Quản trị',
    Roles.evidenceReviewer: 'Thẩm định bằng chứng',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    if (user == null) return const SizedBox.shrink();
    final here = GoRouterState.of(context).matchedLocation;
    final otherAreas = [
      for (final a in areasFor(user))
        if (!here.startsWith(a.$2.substring(0, 3))) a,
    ];

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
          children: [
            Text('Tài khoản', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 14),
            AppCard(
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 30,
                    backgroundColor: AppColors.accentSoft,
                    child: Text(
                      user.fullName.trim().isEmpty ? '?' : user.fullName.trim().characters.first,
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.accentText),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.fullName, style: Theme.of(context).textTheme.titleLarge),
                        Text(user.email, style: Theme.of(context).textTheme.bodySmall),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            for (final r in user.roles)
                              InfoChip(label: _roleLabels[r] ?? r, background: AppColors.accentSoft, foreground: AppColors.accentText),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (otherAreas.isNotEmpty) ...[
              const SizedBox(height: 14),
              AppCard(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  children: [
                    for (final a in otherAreas)
                      _MenuTile(icon: Icons.swap_horiz_rounded, title: 'Chuyển sang khu ${a.$1.toLowerCase()}', onTap: () => context.go(a.$2)),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            AppCard(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                children: [
                  if (user.isInvestor)
                    _MenuTile(icon: Icons.verified_user_outlined, title: 'Xác minh danh tính', onTap: () => context.push(Routes.kyc)),
                  if (user.isInvestor || user.isOperator)
                    _MenuTile(icon: Icons.account_balance_outlined, title: 'Tài khoản nhận tiền', onTap: () => context.push(Routes.payoutAccount)),
                  _MenuTile(icon: Icons.qr_code_scanner_rounded, title: 'Quét QR đơn hàng', onTap: () => context.push(Routes.scan)),
                  _MenuTile(
                    icon: Icons.dns_outlined,
                    title: 'Máy chủ',
                    trailing: apiUrl.replaceFirst(RegExp(r'^https?://'), ''),
                    onTap: null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(54),
                foregroundColor: AppColors.danger,
                side: const BorderSide(color: AppColors.danger),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
              ),
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                try {
                  await ref.read(sessionProvider.notifier).signOut();
                } catch (_) {
                  if (messenger.mounted) {
                    messenger.showSnackBar(
                      const SnackBar(content: Text('Đã đăng xuất. Không xoá được phiên đã lưu; hãy thử lại trước khi đóng ứng dụng.')),
                    );
                  }
                }
              },
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Đăng xuất'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.title, required this.onTap, this.trailing});

  final IconData icon;
  final String title;
  final String? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: IconTile(icon: icon, size: 40),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      trailing: trailing != null
          ? SizedBox(
              width: MediaQuery.sizeOf(context).width * .30,
              child: Text(
                trailing!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.end,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            )
          : (onTap == null ? null : const Icon(Icons.chevron_right_rounded)),
    );
  }
}

import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../app/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/session.dart';
import '../../shared/widgets/app_ui.dart';
import '../../shared/widgets/nav_shell.dart';

/// Tab "Tài khoản" dùng chung cho cả hai vai; mục hiển thị theo vai trò.
class AccountPage extends ConsumerWidget {
  const AccountPage({super.key});

  static const _roleLabels = {
    Roles.investor: 'Nhà đầu tư',
    Roles.customer: 'Khách hàng',
    Roles.operatorMember: 'Hộ nuôi',
    Roles.platformAdmin: 'Quản trị',
    Roles.evidenceReviewer: 'Thẩm định bằng chứng',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    if (user == null) return const SizedBox.shrink();

    void soon() => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đang xây dựng')));

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
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
                    child: Text(user.fullName.characters.first, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppColors.accentText)),
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
            const SizedBox(height: 14),
            AppCard(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                children: [
                  if (user.isInvestor) ...[
                    _MenuTile(icon: Icons.verified_user_outlined, title: 'Xác minh danh tính (eKYC)', onTap: () => context.push(Routes.kyc)),
                    _MenuTile(icon: Icons.account_balance_outlined, title: 'Tài khoản nhận tiền', onTap: soon),
                    _MenuTile(icon: Icons.description_outlined, title: 'Hợp đồng đã ký', onTap: soon),
                  ],
                  if (user.isOperator) ...[
                    _MenuTile(icon: Icons.storefront_outlined, title: 'Thông tin hộ nuôi', onTap: soon),
                    _MenuTile(icon: Icons.grid_view_rounded, title: 'Danh sách hộp (đánh số)', onTap: soon),
                    _MenuTile(icon: Icons.print_outlined, title: 'Máy in tem', onTap: soon),
                  ],
                  _MenuTile(icon: Icons.translate_rounded, title: 'Ngôn ngữ', trailing: 'Tiếng Việt', onTap: soon),
                  _MenuTile(icon: Icons.dns_outlined, title: 'Máy chủ', trailing: apiUrl.replaceFirst(RegExp(r'^https?://'), ''), onTap: null),
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
              onPressed: () => ref.read(sessionProvider.notifier).signOut(),
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
          ? Text(trailing!, style: Theme.of(context).textTheme.bodySmall)
          : (onTap == null ? null : const Icon(Icons.chevron_right_rounded)),
    );
  }
}

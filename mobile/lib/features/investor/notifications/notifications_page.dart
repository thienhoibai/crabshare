import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/investor_models.dart';
import '../data/investor_repository.dart';

/// Tab "Thông báo": tiền đã xác nhận, nhật ký/bằng chứng mới, cảnh báo, hợp đồng, quyết toán.
/// Đẩy thông báo thật (FCM) là task riêng; hiện đọc danh sách từ repository.
class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  static IconData _icon(NotificationKind kind) => switch (kind) {
        NotificationKind.payment => Icons.account_balance_wallet_outlined,
        NotificationKind.production => Icons.edit_note_rounded,
        NotificationKind.alert => Icons.warning_amber_rounded,
        NotificationKind.settlement => Icons.receipt_long_outlined,
        NotificationKind.contract => Icons.draw_outlined,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(investorNotificationsProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: items.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(message: apiErrorMessage(e), onRetry: () => ref.invalidate(investorNotificationsProvider)),
          data: (list) => ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              Text('Thông báo', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 14),
              if (list.isEmpty) const EmptyState(icon: Icons.notifications_none_rounded, title: 'Chưa có thông báo'),
              for (final n in list) ...[
                AppCard(
                  onTap: n.batchCode == null ? null : () => context.push(Routes.batch(n.batchCode!)),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      IconTile(
                        icon: _icon(n.kind),
                        background: n.kind == NotificationKind.alert ? const Color(0xFFFBE0DF) : AppColors.accentSoft,
                        foreground: n.kind == NotificationKind.alert ? AppColors.danger : AppColors.accentText,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(n.title, style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 2),
                            Text(n.body),
                            const SizedBox(height: 6),
                            Text(formatAgo(n.at), style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

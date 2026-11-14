import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../investor_routes.dart';
import '../widgets/investor_ui.dart';
import 'notification_repository.dart';

/// Tab "Thông báo": tiền về, hợp đồng đủ chữ ký, nhật ký mới, cảnh báo, quyết toán công bố, chi trả xong.
/// Bấm một thông báo để đánh dấu đã đọc và mở đúng mục của Lô. Mốc đã đọc lưu trên máy theo từng tài khoản.
class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  static IconData _icon(String type) => switch (type) {
    'PaymentConfirmed' || 'PayoutSucceeded' => Icons.account_balance_wallet_outlined,
    'ProductionReceived' => Icons.edit_note_rounded,
    'AlertRaised' => Icons.warning_amber_rounded,
    'SettlementPublished' => Icons.receipt_long_outlined,
    'ContractSigned' => Icons.draw_outlined,
    _ => Icons.notifications_none_rounded,
  };

  /// Mục của màn Lô tôi đã góp ứng với loại thông báo.
  static String _tab(String type) => switch (type) {
    'ProductionReceived' || 'AlertRaised' => 'nhat-trinh',
    'SettlementPublished' || 'PayoutSucceeded' => 'quyet-toan',
    _ => 'khoan-gop',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(investorNotificationsProvider);
    final read = ref.watch(notificationReadProvider);
    final userId = ref.watch(sessionProvider.select((s) => s.user?.userId));
    final readState = read.value?.userId == userId ? read.value : null;
    final marker = readState?.marker ?? const NotificationReadMarker();
    final unread = ref.watch(unreadNotificationsProvider);
    final saving = readState?.saving ?? true;
    final controller = ref.read(notificationReadProvider.notifier);

    Future<void> open(NotificationEvent n) async {
      if (saving) return;
      if (marker.isUnread(n)) await controller.mark(one: n);
      if (n.canOpenPortfolio && context.mounted && ref.read(sessionProvider).user?.userId == userId) {
        context.push(InvestorRoutes.portfolioTab(n.batchCode, _tab(n.type)));
      }
    }

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(investorNotificationsProvider.future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              Row(
                children: [
                  Expanded(child: Text('Thông báo', style: Theme.of(context).textTheme.headlineMedium)),
                  if (unread > 0)
                    TextButton(
                      onPressed: saving ? null : () => controller.mark(all: items.value),
                      child: Text('Đọc tất cả ($unread)'),
                    ),
                ],
              ),
              if (readState?.error != null) QuietNote(readState!.error!),
              const SizedBox(height: 12),
              ...items.when(
                skipLoadingOnReload: true,
                loading: () => const [LoadingSkeleton(rows: 2)],
                error: (error, _) => [
                  ErrorView(message: apiErrorMessage(error), onRetry: () => ref.invalidate(investorNotificationsProvider)),
                ],
                data: (list) => [
                  if (list.isEmpty) const EmptyState(icon: Icons.notifications_none_rounded, title: 'Chưa có thông báo'),
                  for (final n in list) ...[
                    _NotificationCard(
                      event: n,
                      icon: _icon(n.type),
                      unread: marker.isUnread(n),
                      onTap: n.canOpenPortfolio || marker.isUnread(n) ? () => open(n) : null,
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({required this.event, required this.icon, required this.unread, required this.onTap});
  final NotificationEvent event;
  final IconData icon;
  final bool unread;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final alert = event.type == 'AlertRaised';
    return AppCard(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconTile(
            icon: icon,
            background: alert ? AppColors.danger.withValues(alpha: 0.12) : AppColors.accentSoft,
            foreground: alert ? AppColors.danger : AppColors.accentText,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(event.title, style: text.titleMedium)),
                    if (unread)
                      Semantics(
                        label: 'Chưa đọc',
                        child: const Icon(Icons.circle, size: 8, color: AppColors.accent),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(event.body),
                const SizedBox(height: 4),
                Text(formatAgo(event.at), style: text.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

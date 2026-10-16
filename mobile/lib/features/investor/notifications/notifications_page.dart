import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import 'notification_repository.dart';

class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});
  static IconData _icon(String type) => switch (type) {
    'PaymentConfirmed' ||
    'PayoutSucceeded' => Icons.account_balance_wallet_outlined,
    'ProductionReceived' => Icons.edit_note_rounded,
    'AlertRaised' => Icons.warning_amber_rounded,
    'SettlementPublished' => Icons.receipt_long_outlined,
    'ContractSigned' => Icons.draw_outlined,
    _ => Icons.notifications_none_rounded,
  };
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(investorNotificationsProvider);
    final read = ref.watch(notificationReadProvider);
    final userId = ref.watch(sessionProvider.select((s) => s.user?.userId));
    final readState = read.value?.userId == userId ? read.value : null;
    final marker = readState?.marker ?? const NotificationReadMarker();
    final count = ref.watch(unreadNotificationsProvider);
    final saving = readState?.saving ?? true;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(investorNotificationsProvider.future),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              Text(
                'Thông báo',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    items.hasError
                        ? 'Chưa cập nhật được'
                        : items.isLoading || readState == null
                        ? 'Đang cập nhật…'
                        : '$count chưa đọc',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  TextButton.icon(
                    onPressed:
                        items.hasValue &&
                            !items.isLoading &&
                            !items.hasError &&
                            !saving &&
                            count > 0
                        ? () => ref
                              .read(notificationReadProvider.notifier)
                              .mark(all: items.value)
                        : null,
                    icon: const Icon(Icons.done_all_rounded, size: 18),
                    label: const Text('Đọc tất cả'),
                  ),
                  IconButton(
                    tooltip: 'Làm mới thông báo',
                    onPressed: items.isLoading
                        ? null
                        : () => ref.invalidate(investorNotificationsProvider),
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
              if (readState?.error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Text(
                    readState!.error!,
                    style: const TextStyle(color: AppColors.danger),
                  ),
                ),
              const SizedBox(height: 6),
              ...items.when(
                loading: () => [const LoadingSkeleton(rows: 2)],
                error: (e, _) => [
                  ErrorView(
                    message: apiErrorMessage(e),
                    onRetry: () =>
                        ref.invalidate(investorNotificationsProvider),
                  ),
                ],
                data: (list) => [
                  if (list.isEmpty)
                    const EmptyState(
                      icon: Icons.notifications_none_rounded,
                      title: 'Chưa có thông báo',
                    ),
                  for (final n in list) ...[
                    AppCard(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          IconTile(
                            icon: _icon(n.type),
                            background: n.type == 'AlertRaised'
                                ? const Color(0xFFFBE0DF)
                                : AppColors.accentSoft,
                            foreground: n.type == 'AlertRaised'
                                ? AppColors.danger
                                : AppColors.accentText,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        n.title,
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleMedium,
                                      ),
                                    ),
                                    if (marker.isUnread(n))
                                      Semantics(
                                        label: 'Chưa đọc',
                                        child: const Icon(
                                          Icons.circle,
                                          size: 7,
                                          color: AppColors.accent,
                                        ),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(n.body),
                                const SizedBox(height: 6),
                                Text(
                                  formatAgo(n.at),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                Wrap(
                                  spacing: 8,
                                  children: [
                                    if (n.canOpenPortfolio)
                                      TextButton(
                                        onPressed: saving
                                            ? null
                                            : () async {
                                                await ref
                                                    .read(
                                                      notificationReadProvider
                                                          .notifier,
                                                    )
                                                    .mark(one: n);
                                                if (context.mounted &&
                                                    ref
                                                            .read(
                                                              sessionProvider,
                                                            )
                                                            .user
                                                            ?.userId ==
                                                        userId) {
                                                  context.push(
                                                    Routes.portfolioBatch(
                                                      n.batchCode,
                                                    ),
                                                  );
                                                }
                                              },
                                        child: Text('Xem lô ${n.batchCode}'),
                                      ),
                                    if (marker.isUnread(n))
                                      TextButton(
                                        onPressed: saving
                                            ? null
                                            : () => ref
                                                  .read(
                                                    notificationReadProvider
                                                        .notifier,
                                                  )
                                                  .mark(one: n),
                                        child: const Text('Đã đọc'),
                                      ),
                                  ],
                                ),
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
              const SizedBox(height: 8),
              Text(
                'Mốc đã đọc được lưu riêng cho tài khoản trên thiết bị này.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

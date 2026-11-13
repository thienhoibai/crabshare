import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/contract_repository.dart';
import '../data/portfolio_repository.dart';
import '../data/settlement_repository.dart';
import '../investor_routes.dart';
import '../kyc/kyc_repository.dart';
import '../notifications/notification_repository.dart';
import '../widgets/investor_ui.dart';
import 'investor_todos.dart';

/// Tab "Tổng quan": số tiền tôi đã góp (kèm đã giải ngân theo mốc và còn giữ), việc cần làm, rồi các Lô của tôi.
/// Chỉ có số đã ghi nhận, không có số dự kiến.
class InvestorHomePage extends ConsumerWidget {
  const InvestorHomePage({super.key});

  Future<void> _refresh(WidgetRef ref) {
    ref.invalidate(kycDetailsProvider);
    ref.invalidate(myContributionsProvider);
    ref.invalidate(myContractsProvider);
    ref.invalidate(mySettlementsProvider);
    return ref.refresh(portfolioProvider.future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    final portfolio = ref.watch(portfolioProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AsyncContent(
          value: portfolio,
          onRefresh: () => _refresh(ref),
          data: (items) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              GreetingHeader(
                name: user?.fullName ?? '',
                subtitle: 'Nhà đầu tư',
                notificationCount: ref.watch(unreadNotificationsProvider),
                onBell: () => context.go(Routes.investorNotifications),
              ),
              const SizedBox(height: 16),
              if (items.isNotEmpty) const _MoneyHero(),
              const _Todos(),
              if (items.isEmpty) ...[
                const EmptyState(icon: Icons.savings_outlined, title: 'Bạn chưa góp vốn vào Lô nào'),
                FilledButton(
                  onPressed: () => context.go(Routes.investorBatches),
                  child: const Text('Xem Lô đang gọi vốn'),
                ),
              ] else ...[
                const SizedBox(height: 18),
                const _Shortcuts(),
                const SectionHeader(title: 'Lô của tôi'),
                for (final item in items) ...[
                  _MyBatchCard(item: item, onTap: () => context.push(Routes.portfolioBatch(item.batch.code))),
                  const SizedBox(height: 10),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MoneyHero extends ConsumerWidget {
  const _MoneyHero();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(overviewMoneyProvider).when(
      skipLoadingOnReload: true,
      loading: () => const AppCard(color: AppColors.ink, child: SizedBox(height: 150, width: double.infinity)),
      error: (error, _) => SectionError(error: error, onRetry: () => ref.invalidate(overviewMoneyProvider)),
      data: (money) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MoneyCard(
            title: 'Tôi đã góp',
            figures: money.figures,
            sub: [
              '${money.frozenBatches} Lô đã chốt vốn',
              if (money.waitingAmount > 0) 'thêm ${formatVnd(money.waitingAmount)} chờ chốt vốn',
            ].join(' · '),
          ),
          if (money.missing > 0) QuietNote('Chưa lấy được số tiền của ${money.missing} Lô.'),
        ],
      ),
    );
  }
}

class _Todos extends ConsumerWidget {
  const _Todos();

  static IconData _icon(TodoKind kind) => switch (kind) {
    TodoKind.kyc => Icons.verified_user_outlined,
    TodoKind.payment => Icons.qr_code_2_rounded,
    TodoKind.contract => Icons.draw_outlined,
    TodoKind.vote => Icons.how_to_vote_outlined,
    TodoKind.settlement => Icons.receipt_long_outlined,
  };

  void _open(BuildContext context, WidgetRef ref, InvestorTodo todo) {
    switch (todo.kind) {
      case TodoKind.kyc:
        context.push(Routes.kyc);
      case TodoKind.payment:
        openWeb(context, ref, WebPaths.contribute(todo.batchCode!));
      case TodoKind.contract:
        context.push(InvestorRoutes.contracts);
      case TodoKind.vote:
        context.push(InvestorRoutes.portfolioTab(todo.batchCode!, 'bieu-quyet'));
      case TodoKind.settlement:
        context.push(InvestorRoutes.settlement(todo.settlementId!));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todos = ref.watch(investorTodosProvider).value ?? const <InvestorTodo>[];
    if (todos.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: 'Việc cần làm'),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            children: [
              for (final todo in todos)
                ListTile(
                  onTap: () => _open(context, ref, todo),
                  minVerticalPadding: 10,
                  leading: IconTile(icon: _icon(todo.kind), size: 42),
                  title: Text(todo.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(todo.sub, style: Theme.of(context).textTheme.bodySmall),
                  trailing: const Icon(Icons.chevron_right_rounded),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Shortcuts extends StatelessWidget {
  const _Shortcuts();

  @override
  Widget build(BuildContext context) {
    Widget chip(IconData icon, String label, String path) =>
        Expanded(child: CategoryChip(icon: icon, label: label, selected: false, onTap: () => context.push(path)));
    return Row(
      children: [
        chip(Icons.draw_outlined, 'Hợp đồng', InvestorRoutes.contracts),
        chip(Icons.how_to_vote_outlined, 'Biểu quyết', InvestorRoutes.votes),
        chip(Icons.receipt_long_outlined, 'Quyết toán', InvestorRoutes.settlements),
      ],
    );
  }
}

/// Thẻ gọn của một Lô tôi đã góp: ảnh, tên, trạng thái, số tiền và tỷ lệ vốn.
class _MyBatchCard extends StatelessWidget {
  const _MyBatchCard({required this.item, required this.onTap});
  final PortfolioItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final b = item.batch;
    final text = Theme.of(context).textTheme;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          RoundedImage(crabImage(b.crabType), width: 64, height: 64, radius: 16),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(b.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.titleMedium),
                const SizedBox(height: 2),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(text: formatVnd(item.confirmedAmount), style: const TextStyle(fontWeight: FontWeight.w700)),
                      TextSpan(text: ' · ${ratioText(item.capitalRatio)} vốn Lô', style: text.bodySmall),
                    ],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    StatusPill(kind: 'batch', value: b.status),
                    if (b.openAlerts > 0)
                      InfoChip(
                        label: '${b.openAlerts} cảnh báo',
                        background: AppColors.danger.withValues(alpha: 0.12),
                        foreground: AppColors.danger,
                      ),
                  ],
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.inkMuted),
        ],
      ),
    );
  }
}

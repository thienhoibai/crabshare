import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../../../shared/widgets/segmented_gauge.dart';
import '../data/investor_models.dart';
import '../data/investor_repository.dart';
import '../kyc/kyc_repository.dart';

/// Tab "Tổng quan" của nhà đầu tư — bố cục theo màn dashboard của mẫu:
/// đồng hồ bán nguyệt (tiến độ chu kỳ nuôi), thanh "+", thẻ từng khoản góp.
class InvestorHomePage extends ConsumerStatefulWidget {
  const InvestorHomePage({super.key});

  @override
  ConsumerState<InvestorHomePage> createState() => _InvestorHomePageState();
}

class _InvestorHomePageState extends ConsumerState<InvestorHomePage> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    final contributions = ref.watch(myContributionsProvider);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: contributions.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(message: apiErrorMessage(e), onRetry: () => ref.invalidate(myContributionsProvider)),
          data: (items) {
            final selected = items.isEmpty ? null : items[_selected.clamp(0, items.length - 1)];
            return RefreshIndicator(
              onRefresh: () async {
                await Future.wait([ref.refresh(myContributionsProvider.future), ref.refresh(kycDetailsProvider.future)]);
              },
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
                children: [
                  GreetingHeader(
                    name: user?.fullName ?? '',
                    subtitle: 'Danh mục góp vốn của bạn',
                    onBell: () => context.go(Routes.investorNotifications),
                  ),
                  const SizedBox(height: 14),
                  const _KycBanner(),
                  if (selected == null)
                    const EmptyState(
                      icon: Icons.savings_outlined,
                      title: 'Bạn chưa góp vốn lô nào',
                      message: 'Chọn một lô đang gọi vốn để bắt đầu.',
                    )
                  else ...[
                    _BatchSwitcher(items: items, selected: _selected, onSelect: (i) => setState(() => _selected = i)),
                    const SizedBox(height: 12),
                    _CycleGaugeCard(contribution: selected),
                  ],
                  const SizedBox(height: 14),
                  AddBar(label: 'Góp vốn lô mới', onTap: () => context.go(Routes.investorBatches)),
                  SectionHeader(title: 'Khoản góp của tôi', actionLabel: '${items.length} lô'),
                  for (final c in items) ...[
                    _ContributionCard(contribution: c, onTap: () => context.push(Routes.batch(c.batch.code))),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _KycBanner extends ConsumerWidget {
  const _KycBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final verification = ref.watch(kycStatusProvider);
    if (verification.hasError) {
      return Padding(padding: const EdgeInsets.only(bottom: 14),
          child: ErrorView(message: apiErrorMessage(verification.error!), onRetry: () => ref.invalidate(kycDetailsProvider)));
    }
    final status = verification.value;
    if (status == KycStatus.verified) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: AppCard(
        color: AppColors.ink,
        onTap: () => context.push(Routes.kyc),
        child: Row(
          children: [
            const IconTile(icon: Icons.verified_user_outlined, background: AppColors.accent, foreground: AppColors.ink),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    status == null ? 'Đang kiểm tra danh tính…'
                        : status == KycStatus.rejected ? 'Xác minh chưa đạt — hãy thử lại' : 'Xác minh danh tính để góp vốn',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  const Text('Chụp CCCD và ảnh khuôn mặt', style: TextStyle(color: Color(0xFFBDB7B1), fontSize: 13)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: Colors.white),
          ],
        ),
      ),
    );
  }
}

class _BatchSwitcher extends StatelessWidget {
  const _BatchSwitcher({required this.items, required this.selected, required this.onSelect});

  final List<Contribution> items;
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final isSelected = i == selected;
          return ChoiceChip(
            label: Text(items[i].batch.code),
            selected: isSelected,
            onSelected: (_) => onSelect(i),
            showCheckmark: false,
            backgroundColor: AppColors.surface,
            selectedColor: AppColors.ink,
            labelStyle: TextStyle(color: isSelected ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600),
            side: BorderSide.none,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
          );
        },
      ),
    );
  }
}

class _CycleGaugeCard extends StatelessWidget {
  const _CycleGaugeCard({required this.contribution});

  final Contribution contribution;

  @override
  Widget build(BuildContext context) {
    final b = contribution.batch;
    final text = Theme.of(context).textTheme;
    final day = b.dayOfCycle;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 18),
      child: Column(
        children: [
          SegmentedGauge(
            value: b.cycleProgress,
            center: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(day == null ? '—' : '$day', style: text.displaySmall),
                    const SizedBox(width: 4),
                    Text('ngày', style: text.titleMedium),
                  ],
                ),
                Text('Chu kỳ ${b.cycleDays} ngày', style: text.bodySmall),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _GaugeFact(label: 'Trạng thái', value: b.status.label)),
              Expanded(child: _GaugeFact(label: 'Cua đang nuôi', value: b.aliveCount == null ? '—' : '${formatCount(b.aliveCount!)} con')),
              Expanded(
                child: _GaugeFact(
                  label: 'Dự kiến thu',
                  value: b.expectedHarvestDate == null ? '—' : formatDayMonth(b.expectedHarvestDate!),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GaugeFact extends StatelessWidget {
  const _GaugeFact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        const SizedBox(height: 2),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

/// Thẻ một khoản góp — bố cục theo thẻ bữa ăn của mẫu (ảnh, tên, giờ, số lớn, % cam, hàng chỉ số).
class _ContributionCard extends StatelessWidget {
  const _ContributionCard({required this.contribution, required this.onTap});

  final Contribution contribution;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final b = contribution.batch;
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              RoundedImage(b.crabType.image, width: 58, height: 58, radius: 14),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text('${b.code} · góp ${formatDate(contribution.paidAt)}', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              InfoChip(label: b.status.label, background: AppColors.accentSoft, foreground: AppColors.accentText),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(formatVnd(contribution.amount), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: -0.5)),
              ),
              Text(
                '${contribution.sharePct.toStringAsFixed(2).replaceAll('.', ',')}% vốn lô',
                style: const TextStyle(color: AppColors.accentText, fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 10),
          MetricRow(metrics: [
            Metric('ngày nuôi', b.dayOfCycle == null ? '—' : '${b.dayOfCycle}/${b.cycleDays}'),
            Metric('con', b.aliveCount == null ? '—' : formatCount(b.aliveCount!), color: AppColors.ink),
            Metric('cảnh báo', '${b.openAlerts}', color: b.openAlerts > 0 ? AppColors.danger : AppColors.success),
          ]),
        ],
      ),
    );
  }
}

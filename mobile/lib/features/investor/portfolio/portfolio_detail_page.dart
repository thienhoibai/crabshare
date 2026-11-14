import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../batches/batch_timeline.dart';
import '../data/batch_repository.dart';
import '../data/decision_repository.dart';
import '../data/device_repository.dart';
import '../data/portfolio_repository.dart';
import '../data/settlement_repository.dart';
import '../data/timeline_repository.dart';
import '../widgets/investor_ui.dart';
import 'portfolio_sections.dart';

/// Các mục của màn Lô tôi đã góp; [slug] là giá trị của `?tab=` trên đường dẫn.
enum PortfolioTab {
  contributions('khoan-gop', 'Khoản góp'),
  timeline('nhat-trinh', 'Nhật trình'),
  devices('thiet-bi', 'Thiết bị'),
  votes('bieu-quyet', 'Biểu quyết'),
  settlement('quyet-toan', 'Quyết toán');

  const PortfolioTab(this.slug, this.label);
  final String slug, label;

  static PortfolioTab fromSlug(String? slug) =>
      values.firstWhere((t) => t.slug == slug, orElse: () => PortfolioTab.contributions);
}

/// Một Lô tôi đã góp: ba số tiền của tôi và tiến độ ở đầu, rồi mỗi lúc một mục
/// (khoản góp, nhật trình, thiết bị, biểu quyết, quyết toán).
class PortfolioDetailPage extends ConsumerStatefulWidget {
  const PortfolioDetailPage({super.key, required this.code, this.initialTab});
  final String code;
  final String? initialTab;

  @override
  ConsumerState<PortfolioDetailPage> createState() => _PortfolioDetailPageState();
}

class _PortfolioDetailPageState extends ConsumerState<PortfolioDetailPage> {
  late PortfolioTab _tab = PortfolioTab.fromSlug(widget.initialTab);

  Future<void> _refresh() {
    final code = widget.code;
    ref.read(timelineRefreshProvider.notifier).refresh();
    ref.invalidate(moneySummaryProvider(code));
    ref.invalidate(batchProgressProvider(code));
    ref.invalidate(batchDecisionsProvider(code));
    ref.invalidate(boxImagesProvider(code));
    ref.invalidate(settlementReadinessProvider(code));
    ref.invalidate(mySettlementsProvider);
    return ref.refresh(portfolioDetailProvider(code).future);
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(portfolioDetailProvider(widget.code));
    return Scaffold(
      body: SubPageBody<PortfolioDetail>(
        title: 'Lô ${widget.code}',
        value: detail,
        onRefresh: _refresh,
        children: (d) {
          final item = d.position;
          final b = item.batch;
          final text = Theme.of(context).textTheme;
          return [
            Text(b.title, style: text.titleLarge),
            const SizedBox(height: 2),
            Text([statusLabel('crabType', b.crabType), b.operatorName].join(' · '), style: text.bodySmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
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
            const SizedBox(height: 14),
            _Summary(item: item),
            const SizedBox(height: 16),
            PillTabs<PortfolioTab>(
              items: [for (final t in PortfolioTab.values) (t, t.label)],
              value: _tab,
              onChanged: (tab) => setState(() => _tab = tab),
              wrap: true,
            ),
            const SizedBox(height: 10),
            switch (_tab) {
              PortfolioTab.contributions => ContributionsSection(detail: d),
              PortfolioTab.timeline => BatchTimeline(code: b.code),
              PortfolioTab.devices => DevicesSection(code: b.code),
              PortfolioTab.votes => VotesSection(item: item),
              PortfolioTab.settlement => SettlementSection(item: item),
            },
          ];
        },
      ),
    );
  }
}

/// Ba số tiền của tôi ở Lô này và một dòng tiến độ.
class _Summary extends ConsumerWidget {
  const _Summary({required this.item});
  final PortfolioItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final code = item.batch.code;
    final money = item.frozen ? ref.watch(moneySummaryProvider(code)) : null;
    final mine = money?.value?.mine;
    final progress = ref.watch(batchProgressProvider(code)).value;
    final share = '${ratioText(item.capitalRatio)} vốn của Lô';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MoneyCard(
          title: 'Tôi đã góp vào Lô này',
          figures: mine ?? MoneyFigures(contributed: item.confirmedAmount),
          partsKnown: mine != null,
          sub: item.frozen ? share : '$share · Lô chưa chốt vốn',
        ),
        if (money != null && money.hasError) const QuietNote('Chưa lấy được số đã giải ngân.'),
        if (progress != null && progress.hasData) ...[
          const SizedBox(height: 10),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: MetricRow(
              metrics: [
                Metric('con đang nuôi', formatCount(progress.crabsAlive), color: AppColors.success),
                if (progress.daysRaised != null) Metric('ngày nuôi', '${progress.daysRaised}', color: AppColors.ink),
                if (progress.deadCrabs != null) Metric('con chết', formatCount(progress.deadCrabs!), color: AppColors.danger),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

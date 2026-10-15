import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/models/batch_enums.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/investor_models.dart';
import '../data/investor_repository.dart';

/// Các lô đã công bố; bộ lọc và phân trang dùng API.
class BatchExplorePage extends ConsumerWidget {
  const BatchExplorePage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final batches = ref.watch(batchesProvider);
    final type = ref.watch(discoveryTypeProvider);
    final status = ref.watch(discoveryStatusProvider);
    final page = ref.watch(discoveryPageProvider);
    void resetPage() => ref.read(discoveryPageProvider.notifier).select(1);
    return Scaffold(body: SafeArea(bottom: false, child: Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(20, 12, 20, 8), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Khám phá lô nuôi', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 14),
        DropdownButtonFormField<CrabType>(
          isExpanded: true,
          initialValue: type, decoration: const InputDecoration(labelText: 'Loại cua'),
          items: [const DropdownMenuItem<CrabType>(value: null, child: Text('Tất cả loại cua')),
            for (final t in CrabType.values) DropdownMenuItem(value: t, child: Text(t.label))],
          onChanged: (v) { resetPage(); ref.read(discoveryTypeProvider.notifier).select(v); }),
        const SizedBox(height: 10),
        DropdownButtonFormField<BatchStatus>(
          isExpanded: true,
          initialValue: status, decoration: const InputDecoration(labelText: 'Trạng thái'),
          items: [const DropdownMenuItem<BatchStatus>(value: null, child: Text('Tất cả trạng thái')),
            for (final s in [BatchStatus.funding, BatchStatus.cancelled, BatchStatus.stocked, BatchStatus.inProduction, BatchStatus.harvesting, BatchStatus.settlement, BatchStatus.closed])
              DropdownMenuItem(value: s, child: Text(s.label))],
          onChanged: (v) { resetPage(); ref.read(discoveryStatusProvider.notifier).select(v); }),
      ])),
      Expanded(child: batches.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: apiErrorMessage(e), onRetry: () => ref.invalidate(batchesProvider)),
        data: (result) => ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, kNavBarClearance), children: [
          Text('${result.total} lô · Trang ${result.page}', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          if (result.items.isEmpty) const EmptyState(icon: Icons.search_off_rounded, title: 'Không có lô phù hợp'),
          for (final b in result.items) ...[
            _FundingBatchCard(batch: b, onTap: () => context.push(Routes.batch(b.code))), const SizedBox(height: 14)],
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: page > 1 ? () => ref.read(discoveryPageProvider.notifier).select(page - 1) : null,
                  child: const Text('Trang trước'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton(
                  onPressed: result.hasNext ? () => ref.read(discoveryPageProvider.notifier).select(page + 1) : null,
                  child: const Text('Trang sau'),
                ),
              ),
            ],
          ),
        ]))),
    ])));
  }
}

/// Thẻ lớn có ảnh — theo thẻ "Trending Recipes" của mẫu.
/// Thanh tiến độ thể hiện số vốn đã gọi (không phải lợi suất).
class _FundingBatchCard extends StatelessWidget {
  const _FundingBatchCard({required this.batch, required this.onTap});

  final BatchSummary batch;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final b = batch;
    final progress = b.discoveryProgress;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              RoundedImage(b.crabType.image, height: 190, width: double.infinity, radius: 18),
              Positioned(
                left: 10,
                top: 10,
                child: InfoChip(
                  icon: Icons.schedule_rounded,
                  label: b.status == BatchStatus.funding && b.fundingDeadline != null ? formatDueIn(b.fundingDeadline!) : b.status.label,
                ),
              ),
              const Positioned(right: 10, top: 10, child: InfoChip(icon: Icons.verified_rounded, label: 'Đã duyệt')),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 12, 6, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(b.title, style: Theme.of(context).textTheme.titleLarge)),
                    Text(b.code, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
                const SizedBox(height: 2),
                Text(b.operatorName, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: SoftProgressBar(value: progress?.barValue ?? 0)),
                    const SizedBox(width: 10),
                    Text(progress?.percentLabel ?? '—', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.accentText)),
                  ],
                ),
                const SizedBox(height: 10),
                MetricRow(metrics: [
                  Metric('mục tiêu', formatMillions(b.targetCapital)),
                  Metric('tối thiểu', formatMillions(b.minContribution), color: AppColors.ink),
                  Metric('ngày nuôi', '${b.cycleDays}', color: AppColors.success),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

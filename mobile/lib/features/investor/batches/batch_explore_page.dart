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

/// Tab "Lô" — bố cục theo màn Explore của mẫu: ô tìm kiếm, chip danh mục, thẻ lớn có ảnh.
class BatchExplorePage extends ConsumerStatefulWidget {
  const BatchExplorePage({super.key});

  @override
  ConsumerState<BatchExplorePage> createState() => _BatchExplorePageState();
}

class _BatchExplorePageState extends ConsumerState<BatchExplorePage> {
  CrabType? _type;
  String _query = '';

  static const _categories = <(CrabType?, IconData, String)>[
    (null, Icons.apps_rounded, 'Tất cả'),
    (CrabType.fattening, Icons.set_meal_outlined, 'Cua thịt'),
    (CrabType.roe, Icons.egg_alt_outlined, 'Cua gạch'),
    (CrabType.softShell, Icons.water_drop_outlined, 'Cua lột'),
  ];

  bool _matches(BatchSummary b) {
    final q = _query.trim().toLowerCase();
    return (_type == null || b.crabType == _type) &&
        (q.isEmpty || b.title.toLowerCase().contains(q) || b.code.toLowerCase().contains(q) || b.operatorName.toLowerCase().contains(q));
  }

  @override
  Widget build(BuildContext context) {
    final batches = ref.watch(batchesProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: batches.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(message: apiErrorMessage(e), onRetry: () => ref.invalidate(batchesProvider)),
          data: (all) {
            final visible = all.where(_matches).toList();
            final funding = visible.where((b) => b.status == BatchStatus.funding).toList();
            final running = visible.where((b) => b.status != BatchStatus.funding).toList();
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
              children: [
                Text('Khám phá lô nuôi', style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 14),
                TextField(
                  onChanged: (v) => setState(() => _query = v),
                  decoration: const InputDecoration(
                    hintText: 'Tìm lô, mã lô, hộ nuôi…',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    for (final (type, icon, label) in _categories)
                      Expanded(
                        child: CategoryChip(icon: icon, label: label, selected: _type == type, onTap: () => setState(() => _type = type)),
                      ),
                  ],
                ),
                SectionHeader(title: 'Đang gọi vốn', actionLabel: '${funding.length} lô'),
                if (funding.isEmpty)
                  const EmptyState(icon: Icons.search_off_rounded, title: 'Không có lô phù hợp')
                else
                  for (final b in funding) ...[
                    _FundingBatchCard(batch: b, onTap: () => context.push(Routes.batch(b.code))),
                    const SizedBox(height: 14),
                  ],
                if (running.isNotEmpty) ...[
                  const SectionHeader(title: 'Đang nuôi & thu hoạch'),
                  SizedBox(
                    height: 210,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: running.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (context, i) => _SmallBatchCard(batch: running[i], onTap: () => context.push(Routes.batch(running[i].code))),
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
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
    final percent = (b.fundingProgress * 100).round();
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
                  label: b.fundingDeadline == null ? 'Đang mở' : formatDueIn(b.fundingDeadline!),
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
                    Expanded(child: SoftProgressBar(value: b.fundingProgress)),
                    const SizedBox(width: 10),
                    Text('$percent%', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.accentText)),
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

class _SmallBatchCard extends StatelessWidget {
  const _SmallBatchCard({required this.batch, required this.onTap});

  final BatchSummary batch;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 200,
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                RoundedImage(batch.crabType.image, height: 110, width: double.infinity, radius: 14),
                Positioned(left: 8, top: 8, child: InfoChip(label: batch.status.label)),
              ],
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(batch.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 6),
                  SoftProgressBar(value: batch.cycleProgress, height: 6, color: AppColors.ink),
                  const SizedBox(height: 4),
                  Text('Ngày ${batch.dayOfCycle ?? '—'}/${batch.cycleDays}', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

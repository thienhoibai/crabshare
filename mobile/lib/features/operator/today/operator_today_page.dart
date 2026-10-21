import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/auth/session.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/models/batch_enums.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../../../shared/widgets/segmented_gauge.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import '../evidence/capture_requests_section.dart';
import '../logs/log_thresholds.dart';

/// Tab "Hôm nay" của hộ nuôi — bố cục theo dashboard của mẫu:
/// đồng hồ việc trong ngày, thanh "+" ghi nhật ký, yêu cầu chụp, thẻ từng lô.
class OperatorTodayPage extends ConsumerWidget {
  const OperatorTodayPage({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(activeBatchesProvider);
    await Future.wait([
      ref.read(activeBatchesProvider.future),
      ref.refresh(captureRequestsProvider.future),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    final summaryState = ref.watch(todaySummaryProvider);
    final summary = summaryState.isLoading || summaryState.hasError
        ? null
        : summaryState.value;
    final batches = ref.watch(activeBatchesProvider);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AppRefreshIndicator(
          onRefresh: () => _refresh(ref),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              GreetingHeader(
                name: user?.fullName ?? '',
                subtitle: summary?.businessDate == null
                    ? ''
                    : formatWeekday(summary!.businessDate!),
                onBell: () => context.go(Routes.operatorAlerts),
              ),
              const SizedBox(height: 18),
              const Text(
                'Tiến độ nhật ký hôm nay',
                style: TextStyle(color: AppColors.inkMuted),
              ),
              AppCard(
                padding: const EdgeInsets.fromLTRB(16, 22, 16, 18),
                child: Column(
                  children: [
                    SegmentedGauge(
                      value: summary == null || summary.total == 0
                          ? 0
                          : summary.done / summary.total,
                      center: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(
                                '${summary?.done ?? '—'}',
                                style: text.displaySmall,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '/ ${summary?.total ?? '—'} lô',
                                style: text.titleMedium,
                              ),
                            ],
                          ),
                          Text('Nhật ký đã ghi hôm nay', style: text.bodySmall),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      summary == null
                          ? ''
                          : summary.total == 0
                          ? 'Chưa có lô cần ghi nhật ký hôm nay.'
                          : summary.done >= summary.total
                          ? 'Đã ghi đủ nhật ký hôm nay.'
                          : 'Còn ${summary.total - summary.done} lô chưa ghi nhật ký hôm nay.',
                      style: text.bodySmall,
                    ),
                  ],
                ),
              ),
              if (summaryState.hasError)
                ErrorView(
                  message: apiErrorMessage(summaryState.error!),
                  onRetry: () => ref.invalidate(activeBatchesProvider),
                ),
              const SizedBox(height: 14),
              AddBar(
                label: 'Ghi nhật ký hôm nay',
                onTap: () => context.push(Routes.dailyLogNew),
              ),
              const SizedBox(height: 10),
              AddBar(
                label: 'Đóng gói đơn — quét tem',
                onTap: () => context.push(Routes.operatorPack),
              ),
              const SizedBox(height: 10),
              AddBar(
                label: 'Quản lý tem đã in',
                onTap: () => context.push(Routes.operatorTags),
              ),
              const CaptureRequestsSection(),
              const SectionHeader(title: 'Lô đang nuôi'),
              ...batches.when(
                loading: () => [const LoadingSkeleton(rows: 2)],
                error: (e, _) => [
                  ErrorView(
                    message: apiErrorMessage(e),
                    onRetry: () => ref.invalidate(activeBatchesProvider),
                  ),
                ],
                data: (list) => [
                  if (list.isEmpty)
                    const EmptyState(
                      icon: Icons.water_outlined,
                      title: 'Chưa có lô đang nuôi',
                    ),
                  for (final b in list) ...[
                    _BatchCard(batch: b),
                    const SizedBox(height: 12),
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

/// Thẻ lô — theo thẻ bữa ăn của mẫu: ảnh, tên, ngày nuôi, số lớn, % cam, hàng chỉ số, nút sửa.
class _BatchCard extends StatelessWidget {
  const _BatchCard({required this.batch});

  final OperatorBatch batch;

  @override
  Widget build(BuildContext context) {
    final b = batch;
    final log = b.latestLog;
    final harvesting = b.status == BatchStatus.harvesting;
    return AppCard(
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
                    Text(
                      '${b.code} · ${b.title}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${b.status.label} · ngày ${b.dayOfCycle ?? '—'}/${b.cycleDays}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              if (b.allowsDailyLog)
                CircleIconButton(
                  icon: Icons.edit_outlined,
                  size: 40,
                  background: AppColors.background,
                  onTap: () => context.push(Routes.dailyLogFor(b.code)),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: [
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: formatCount(b.aliveCount),
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const TextSpan(
                      text: '  con',
                      style: TextStyle(color: AppColors.inkMuted),
                    ),
                  ],
                ),
              ),
              Text(
                '${(b.survivalRate * 100).toStringAsFixed(1).replaceAll('.', ',')}% còn nuôi',
                style: const TextStyle(
                  color: AppColors.accentText,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          MetricRow(
            metrics: [
              Metric('pH', formatLogNumber(log?.ph)),
              Metric(
                '°C',
                formatLogNumber(log?.waterTempC),
                color: AppColors.danger,
              ),
              Metric(
                'ppt',
                formatLogNumber(log?.salinityPpt),
                color: const Color(0xFF4C8DD6),
              ),
              Metric(
                'kg ăn',
                formatLogNumber(log?.feedKg, digits: 3),
                color: AppColors.success,
              ),
            ],
          ),
          if (b.allowsDailyLog && !b.loggedToday) ...[
            const SizedBox(height: 10),
            const InfoChip(
              icon: Icons.error_outline_rounded,
              label: 'Chưa ghi nhật ký hôm nay',
              background: AppColors.accentSoft,
              foreground: AppColors.accentText,
            ),
          ],
          if (harvesting) ...[
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () => context.push(Routes.harvest(b.code)),
              icon: const Icon(Icons.scale_outlined),
              label: const Text('Thu hoạch: cân & in tem'),
            ),
          ],
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => context.push(Routes.slotEvents(b.code)),
            icon: const Icon(Icons.event_note_outlined),
            label: const Text('Sự kiện hộp'),
          ),
        ],
      ),
    );
  }
}

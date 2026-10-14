import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/models/batch_enums.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../../../shared/widgets/segmented_gauge.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import '../evidence/capture_requests_section.dart';

/// Tab "Hôm nay" của hộ nuôi — bố cục theo dashboard của mẫu:
/// đồng hồ việc trong ngày, thanh "+" ghi nhật ký, yêu cầu chụp, thẻ từng lô.
class OperatorTodayPage extends ConsumerWidget {
  const OperatorTodayPage({super.key});

  Future<void> _refresh(WidgetRef ref) {
    ref.invalidate(todaySummaryProvider);
    ref.invalidate(captureRequestsProvider);
    return ref.refresh(activeBatchesProvider.future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider).user;
    final summary = ref.watch(todaySummaryProvider).value;
    final batches = ref.watch(activeBatchesProvider);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => _refresh(ref),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              GreetingHeader(
                name: user?.fullName ?? '',
                subtitle: formatWeekday(DateTime.now()),
                onBell: () => context.go(Routes.operatorAlerts),
              ),
              const SizedBox(height: 18),
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
                                '/ ${summary?.total ?? '—'} việc',
                                style: text.titleMedium,
                              ),
                            ],
                          ),
                          Text('Việc cần làm hôm nay', style: text.bodySmall),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      summary == null
                          ? ''
                          : summary.done >= summary.total
                          ? 'Xong hết việc hôm nay 🎉'
                          : 'Còn ${summary.total - summary.done} việc: nhật ký, yêu cầu chụp, cảnh báo',
                      style: text.bodySmall,
                    ),
                  ],
                ),
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
              const CaptureRequestsSection(),
              const SectionHeader(title: 'Lô đang nuôi'),
              ...batches.when(
                loading: () => [
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: CircularProgressIndicator(),
                    ),
                  ),
                ],
                error: (e, _) => [Text('$e')],
                data: (list) => [
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

  String _num(double? v, {int digits = 1}) =>
      v == null ? '—' : v.toStringAsFixed(digits).replaceAll('.', ',');

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
              CircleIconButton(
                icon: Icons.edit_outlined,
                size: 40,
                background: AppColors.background,
                onTap: () => context.push(Routes.dailyLogFor(b.code)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text.rich(
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
              Metric('pH', _num(log?.ph)),
              Metric('°C', _num(log?.waterTempC), color: AppColors.danger),
              Metric(
                '‰',
                _num(log?.salinityPpt, digits: 0),
                color: const Color(0xFF4C8DD6),
              ),
              Metric('kg ăn', _num(log?.feedKg), color: AppColors.success),
            ],
          ),
          if (!b.loggedToday) ...[
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
        ],
      ),
    );
  }
}

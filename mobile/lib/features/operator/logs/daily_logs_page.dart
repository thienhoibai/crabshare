import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import 'log_thresholds.dart';

/// Tab "Nhật ký": các bản ghi ngày (pH, nhiệt độ nước, độ mặn, thức ăn) theo từng lô.
class DailyLogsPage extends ConsumerWidget {
  const DailyLogsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logs = ref.watch(dailyLogsProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AsyncContent(
          value: logs,
          onRefresh: () => ref.refresh(dailyLogsProvider.future),
          data: (list) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              Text(
                'Nhật ký nuôi',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 14),
              if (list.isEmpty)
                const EmptyState(
                  icon: Icons.edit_note_rounded,
                  title: 'Chưa có nhật ký',
                ),
              AddBar(
                label: 'Ghi nhật ký hôm nay',
                onTap: () => context.push(Routes.dailyLogNew),
              ),
              const SizedBox(height: 8),
              for (final log in list) ...[
                const SizedBox(height: 10),
                _LogCard(log: log),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LogCard extends StatelessWidget {
  const _LogCard({required this.log});

  final DailyLog log;

  @override
  Widget build(BuildContext context) {
    final flagged = log.flag != PlausibilityFlag.ok;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${formatDate(log.logDate)} · ${log.batchCode}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              InfoChip(
                label: log.flag.label,
                background: flagged
                    ? AppColors.accentSoft
                    : const Color(0xFFE3F2E9),
                foreground: flagged ? AppColors.accentText : AppColors.success,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 16,
            runSpacing: 12,
            children: [
              _Value(label: 'pH', value: formatLogNumber(log.ph)),
              _Value(
                label: 'Nhiệt độ °C',
                value: formatLogNumber(log.waterTempC),
              ),
              _Value(
                label: 'Độ mặn ppt',
                value: formatLogNumber(log.salinityPpt),
              ),
              _Value(
                label: 'Thức ăn kg',
                value: formatLogNumber(log.feedKg, digits: 3),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Nguồn ${log.source} · ${log.recordedBy == null ? 'Chưa có người ghi' : 'Người ghi #${log.recordedBy}'}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (log.recordedAt != null)
            Text(
              'Lưu lúc ${formatTime(log.recordedAt!)} ${formatDate(log.recordedAt!)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 6),
          if (log.thresholdsApplied case final thresholds?) ...[
            Text(
              'Ngưỡng áp dụng · phiên bản ${log.thresholdVersion}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            Text(
              'pH ${ValueRange(thresholds.phMin, thresholds.phMax).format()} · '
              '${ValueRange(thresholds.waterTempMinC, thresholds.waterTempMaxC).format()} °C · '
              '${ValueRange(thresholds.salinityMinPpt, thresholds.salinityMaxPpt).format()} ppt',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ] else
            Text(
              'Chưa có phiên bản ngưỡng · dữ liệu lịch sử',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if (log.note != null) ...[
            const SizedBox(height: 10),
            Text(log.note!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

class _Value extends StatelessWidget {
  const _Value({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 125,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

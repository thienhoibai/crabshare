import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/json.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/care_log_repository.dart';
import 'log_numbers.dart';

/// Các bản nhật ký chăm sóc đã ghi của hộ nuôi, mới nhất đứng trước.
class DailyLogsPage extends ConsumerWidget {
  const DailyLogsPage({super.key});

  static const _header = Padding(
    padding: EdgeInsets.fromLTRB(20, 12, 20, 0),
    child: SubPageHeader(title: 'Nhật ký chăm sóc'),
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logs = ref.watch(careLogsProvider);
    return Scaffold(
      body: SafeArea(
        child: AsyncContent<Paged<DailyLog>>(
          value: logs,
          onRefresh: () => ref.refresh(careLogsProvider.future),
          header: _header,
          data: (page) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Nhật ký chăm sóc'),
              const SizedBox(height: 14),
              AddBar(label: 'Ghi nhật ký hôm nay', onTap: () => context.push(Routes.dailyLogNew)),
              if (page.items.isEmpty) const EmptyState(icon: Icons.edit_note_rounded, title: 'Chưa có nhật ký nào'),
              for (final log in page.items) ...[const SizedBox(height: 10), _LogCard(log: log)],
              if (page.total > page.items.length) ...[
                const SizedBox(height: 12),
                Text('Đang hiện ${page.items.length} bản ghi gần nhất.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
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

  static const _flags = {'OutOfRange': 'Ngoài khoảng', 'Inconsistent': 'Không nhất quán'};
  static const _sources = {'FarmApi': 'Phần mềm của trại', 'Device': 'Thiết bị'};

  @override
  Widget build(BuildContext context) {
    final flag = _flags[log.flag];
    final source = _sources[log.source];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('${formatDate(log.logDate)} · ${log.batchCode}', style: Theme.of(context).textTheme.titleMedium)),
              if (flag != null) InfoChip(label: flag, background: AppColors.accentSoft, foreground: AppColors.accentText),
            ],
          ),
          const SizedBox(height: 10),
          MetricRow(
            metrics: [
              Metric('kg thức ăn', formatLogNumber(log.feedKg, digits: 3), color: AppColors.success),
              Metric('pH', formatLogNumber(log.ph)),
              Metric('°C', formatLogNumber(log.waterTempC), color: AppColors.danger),
              Metric('‰', formatLogNumber(log.salinityPpt), color: AppColors.info),
            ],
          ),
          if (source != null) ...[const SizedBox(height: 6), Text('Nguồn: $source', style: Theme.of(context).textTheme.bodySmall)],
          if (log.note != null && log.note!.isNotEmpty) ...[const SizedBox(height: 6), Text(log.note!, style: Theme.of(context).textTheme.bodySmall)],
        ],
      ),
    );
  }
}

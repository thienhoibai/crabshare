import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import 'measure_models.dart';
import 'work_common.dart';

/// Danh sách gọn các con đã đo: hôm nay ở trên, các ngày trước gấp lại. Bấm một dòng để xem lại lượt đo.
class MeasureResults extends StatelessWidget {
  const MeasureResults({super.key, required this.decisions, required this.onOpen, this.now});

  final List<GradeDecision> decisions;
  final ValueChanged<GradeDecision> onOpen;
  final DateTime? now;

  static const _maxEarlier = 30;

  @override
  Widget build(BuildContext context) {
    final today = now ?? DateTime.now();
    bool isToday(GradeDecision d) {
      final at = d.createdAt?.toLocal();
      return at != null && at.year == today.year && at.month == today.month && at.day == today.day;
    }

    final newest = decisions.reversed.toList();
    final todays = newest.where(isToday).toList();
    final earlier = newest.where((d) => !isToday(d)).toList();
    if (newest.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (todays.isNotEmpty) ...[
          SectionHeader(title: 'Hôm nay', actionLabel: '${todays.length} con'),
          _ResultList(rows: todays, onOpen: onOpen, showDay: false),
        ],
        if (earlier.isNotEmpty)
          MoreSection(
            label: 'Các ngày trước (${earlier.length})',
            children: [_ResultList(rows: earlier.take(_maxEarlier).toList(), onOpen: onOpen, showDay: true)],
          ),
      ],
    );
  }
}

class _ResultList extends StatelessWidget {
  const _ResultList({required this.rows, required this.onOpen, required this.showDay});
  final List<GradeDecision> rows;
  final ValueChanged<GradeDecision> onOpen;
  final bool showDay;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (final (i, d) in rows.indexed) ...[
            if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16, color: AppColors.surfaceMuted),
            InkWell(
              onTap: () => onOpen(d),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            d.crabCode,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        const SizedBox(width: 8),
                        StatusPill(kind: 'grade', value: d.status),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(_summary(d), style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _summary(GradeDecision d) => [
    if (d.weightG != null) formatNumber(d.weightG, 'g'),
    if (d.size != null) statusLabel('sizeCode', d.size),
    if (d.grade != null) statusLabel('gradeCode', d.grade),
    if (showDay && d.createdAt != null) formatDayMonth(d.createdAt!),
  ].join(' · ');
}

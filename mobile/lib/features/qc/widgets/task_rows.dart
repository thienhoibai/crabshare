import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/grading_repository.dart';
import '../data/incoming_repository.dart';
import '../data/qc_models.dart';
import '../data/qc_repository.dart';
import 'qc_parts.dart';

/// Tải lại việc của tôi cùng các số đi kèm từng hàng (tiến độ phiếu, số con chờ duyệt).
Future<void> refreshQcTasks(WidgetRef ref) {
  ref.invalidate(batchReceiptsProvider);
  ref.invalidate(gradingSummaryProvider);
  return ref.refresh(qcTasksProvider.future);
}

String _batchLine(String code, BatchHead? head) => head == null ? 'Lô $code' : 'Lô $code · ${head.title}';

/// Một phiếu nhận hàng chờ kiểm: số phiếu, tiến độ đã kiểm, số con bị loại.
class IncomingTaskRow extends ConsumerWidget {
  const IncomingTaskRow({super.key, required this.row});
  final ReceiptTask row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final head = ref.watch(batchHeadProvider(row.task.batchCode)).value;
    final r = row.receipt;
    if (r == null) {
      return QcRowCard(
        icon: Icons.fact_check_outlined,
        title: 'Phiếu nhận hàng',
        subtitle: _batchLine(row.task.batchCode, head),
        onTap: () => showAppToast(context, 'Chưa tra được số phiếu. Kéo xuống để tải lại.'),
      );
    }
    return QcRowCard(
      icon: Icons.fact_check_outlined,
      title: r.receiptNo,
      subtitle: _batchLine(row.task.batchCode, head),
      bottom: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SoftProgressBar(value: r.declaredCount == 0 ? 0 : r.inspected / r.declaredCount),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
              children: [
                TextSpan(text: '${r.inspected} / ${r.declaredCount} con'),
                if (r.rejectedCount > 0) TextSpan(text: ' · loại ${r.rejectedCount}', style: const TextStyle(color: AppColors.danger)),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
      onTap: () => context.push(Routes.qcReceipt(r.receiptNo, batchCode: row.task.batchCode)),
    );
  }
}

/// Buổi đo của một Lô, hoặc các con bị giữ lại của Lô đang chờ tôi xác nhận lần hai ([count] con).
class GradingTaskRow extends ConsumerWidget {
  const GradingTaskRow({super.key, required this.task, this.count = 1});
  final QcTask task;
  final int count;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final head = ref.watch(batchHeadProvider(task.batchCode)).value;
    final summary = ref.watch(gradingSummaryProvider(task.batchCode)).value;
    final second = task.kind == QcKinds.second;
    final waiting = second ? count : summary?.waiting;
    return QcRowCard(
      icon: second ? Icons.verified_user_outlined : Icons.straighten_rounded,
      title: task.batchCode,
      subtitle: [
        if (head != null) head.title,
        if (!second && summary != null && summary.notMeasured > 0) '${summary.notMeasured} con chưa đo',
      ].join(' · '),
      trailing: waiting == null
          ? null
          : InfoChip(
              label: second ? '$waiting chờ xác nhận' : '$waiting chờ duyệt',
              background: (waiting > 0 ? AppColors.warning : AppColors.inkMuted).withValues(alpha: 0.14),
              foreground: waiting > 0 ? AppColors.accentText : AppColors.inkMuted,
            ),
      onTap: () => context.push(Routes.qcGradingBatch(task.batchCode)),
    );
  }
}

/// Một lần thăm trại giữa vụ được phân cho tôi.
class VisitTaskRow extends ConsumerWidget {
  const VisitTaskRow({super.key, required this.task});
  final QcTask task;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final head = ref.watch(batchHeadProvider(task.batchCode)).value;
    return QcRowCard(
      icon: Icons.place_outlined,
      title: task.batchCode,
      subtitle: [if (head != null) head.title, if (head?.executorName != null) head!.executorName!].join(' · '),
      onTap: () => context.push(Routes.qcSiteVisit(task.assignmentId, batchCode: task.batchCode)),
    );
  }
}

/// Các hàng việc của những loại [kinds], gom theo loại, mới nhất trước. [titles]: hiện tên loại phía trên mỗi nhóm.
class TaskGroups extends ConsumerWidget {
  const TaskGroups({super.key, required this.tasks, required this.kinds, this.titles = false});
  final List<QcTask> tasks;
  final List<String> kinds;
  final bool titles;

  List<Widget> _rows(WidgetRef ref, String kind) {
    final list = newestFirst(tasks.where((t) => t.kind == kind));
    switch (kind) {
      case QcKinds.incoming:
        final me = ref.watch(myUserIdProvider);
        final byTask = <int, ReceiptTask>{};
        for (final code in {for (final t in list) t.batchCode}) {
          final receipts = ref.watch(batchReceiptsProvider(code)).value ?? const [];
          for (final row in matchReceipts(list.where((t) => t.batchCode == code), receipts, me)) {
            byTask[row.task.assignmentId] = row;
          }
        }
        return [for (final t in list) IncomingTaskRow(key: ValueKey(t.assignmentId), row: byTask[t.assignmentId] ?? ReceiptTask(t, null))];
      case QcKinds.second:
        // Mỗi con bị giữ lại là một việc; gom theo Lô vì cùng dẫn tới hàng chờ của Lô đó.
        final seen = <String>{};
        return [
          for (final t in list)
            if (seen.add(t.batchCode))
              GradingTaskRow(key: ValueKey(t.assignmentId), task: t, count: list.where((x) => x.batchCode == t.batchCode).length),
        ];
      case QcKinds.grading:
        return [for (final t in list) GradingTaskRow(key: ValueKey(t.assignmentId), task: t)];
      case QcKinds.visit:
        return [for (final t in list) VisitTaskRow(key: ValueKey(t.assignmentId), task: t)];
      default:
        return const [];
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final kind in kinds)
          if (tasks.any((t) => t.kind == kind)) ...[
            if (titles) SectionHeader(title: statusLabel('qcKind', kind)),
            ..._rows(ref, kind),
          ],
      ],
    );
  }
}

/// Thân của một màn danh sách việc theo loại: các hàng việc, hoặc một câu khi chưa có việc.
class KindTaskList extends ConsumerWidget {
  const KindTaskList({
    super.key,
    required this.kinds,
    required this.emptyIcon,
    required this.emptyTitle,
    this.bottomPadding = 24,
    this.footer,
  });
  final List<String> kinds;
  final IconData emptyIcon;
  final String emptyTitle;
  final double bottomPadding;

  /// Phần thêm bên dưới danh sách.
  final Widget? footer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AsyncContent<List<QcTask>>(
      value: keepData(ref.watch(qcTasksProvider)),
      onRefresh: () => refreshQcTasks(ref),
      data: (tasks) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottomPadding),
        children: [
          if (tasks.any((t) => kinds.contains(t.kind)))
            TaskGroups(tasks: tasks, kinds: kinds, titles: kinds.length > 1)
          else
            EmptyState(icon: emptyIcon, title: emptyTitle),
          ?footer,
        ],
      ),
    );
  }
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/qc_models.dart';
import '../data/qc_repository.dart';
import '../widgets/qc_parts.dart';
import '../widgets/task_rows.dart';

/// Tab "Việc": mọi việc đang chờ của tôi, gom theo loại. Việc đã xong tự rời danh sách.
class QcTasksPage extends ConsumerWidget {
  const QcTasksPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
              child: Text('Việc được giao', style: Theme.of(context).textTheme.headlineMedium),
            ),
            Expanded(
              child: AsyncContent<List<QcTask>>(
                value: keepData(ref.watch(qcTasksProvider)),
                onRefresh: () => refreshQcTasks(ref),
                data: (tasks) {
                  // Loại việc chưa có màn làm việc trong ứng dụng (kiểm xuất hàng, kiểm khi tranh chấp).
                  final others = newestFirst(tasks.where((t) => !QcKinds.work.contains(t.kind)));
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, kNavBarClearance),
                    children: [
                      if (tasks.isEmpty)
                        const EmptyState(icon: Icons.task_alt_rounded, title: 'Chưa có việc nào chờ bạn')
                      else ...[
                        FactGrid(
                          facts: [
                            for (final kind in QcKinds.work)
                              () {
                                final count = tasks.where((t) => t.kind == kind).length;
                                return Fact(statusLabel('qcKind', kind), '$count', color: count > 0 ? AppColors.accentText : AppColors.inkMuted);
                              }(),
                          ],
                        ),
                        TaskGroups(tasks: tasks, kinds: QcKinds.work, titles: true),
                        if (others.isNotEmpty)
                          MoreSection(
                            label: 'Việc khác · ${others.length}',
                            children: [
                              KeyValueList(rows: [for (final t in others) (statusLabel('qcKind', t.kind), 'Lô ${t.batchCode}')]),
                            ],
                          ),
                      ],
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

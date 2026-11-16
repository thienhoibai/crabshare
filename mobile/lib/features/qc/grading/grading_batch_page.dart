import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/grading_models.dart';
import '../data/grading_repository.dart';
import '../data/qc_models.dart';
import '../data/qc_repository.dart';
import '../widgets/qc_parts.dart';
import 'decision_actions.dart';
import 'decision_card.dart';
import 'handled_tab.dart';

/// Hàng chờ duyệt phân hạng của một Lô: mỗi lần một con trên một thẻ lớn; làm xong con này thì con kế tiếp hiện ra.
/// Buổi đo: người được phân việc của Lô duyệt, giữ lại, loại, nhập thước kẹp. Con đã bị giữ lại: chỉ người kiểm
/// thứ hai xác nhận giữ rồi duyệt hoặc loại. Đổi size, hạng chỉ làm với con đã duyệt nên nằm ở tab "Đã xử lý".
class GradingBatchPage extends ConsumerStatefulWidget {
  const GradingBatchPage({super.key, required this.batchCode});
  final String batchCode;

  @override
  ConsumerState<GradingBatchPage> createState() => _GradingBatchPageState();
}

class _GradingBatchPageState extends ConsumerState<GradingBatchPage> {
  bool _handledTab = false;
  int _pos = 0;

  /// Sau khi nhập thước kẹp, bám theo phiên bản đề xuất mới của đúng con đó.
  String? _pinnedCrab;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // Người nuôi đo từng con ở trạm trong lúc kiểm phẩm đứng duyệt, nên tự hỏi lại để thấy đề xuất mới.
    _poll = Timer.periodic(const Duration(seconds: 20), (_) {
      ref.invalidate(gradeDecisionsProvider(widget.batchCode));
      ref.invalidate(gradingSummaryProvider(widget.batchCode));
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _refresh() {
    ref.invalidate(gradingSummaryProvider(widget.batchCode));
    ref.invalidate(qcTasksProvider);
    return ref.refresh(gradeDecisionsProvider(widget.batchCode).future);
  }

  void _go(int next) => setState(() {
    _pinnedCrab = null;
    _pos = next;
  });

  @override
  Widget build(BuildContext context) {
    final code = widget.batchCode;
    final decisions = ref.watch(gradeDecisionsProvider(code));
    final summary = ref.watch(gradingSummaryProvider(code)).value;
    final head = ref.watch(batchHeadProvider(code)).value;
    final tasks = ref.watch(qcTasksProvider);
    final ruleSets = ref.watch(gradeRuleSetsProvider).value;
    final me = ref.watch(myUserIdProvider);
    final mine = (tasks.value ?? const <QcTask>[]).where((t) => t.batchCode == code);
    final hasSession = mine.any((t) => t.kind == QcKinds.grading);
    final hasSecond = mine.any((t) => t.kind == QcKinds.second);
    DecisionRole role(GradeDecision d) => roleOf(d, me: me, hasSession: hasSession, hasSecond: hasSecond);

    final all = decisions.value ?? const <GradeDecision>[];
    final queue = [for (final d in all) if (d.isWaiting) d]
      ..sort((a, b) {
        final byRole = role(a).order - role(b).order;
        return byRole != 0 ? byRole : a.createdAt.compareTo(b.createdAt);
      });
    final handled = [for (final d in all) if (d.isHandled) d]
      ..sort((a, b) => (b.decidedAt ?? b.createdAt).compareTo(a.decidedAt ?? a.createdAt));
    final caption = [?head?.title, if (summary != null) statusLabel('crabType', summary.crabType)].join(' · ');

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: SubPageHeader(title: 'Lô $code'),
            ),
            if (caption.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(78, 0, 20, 0),
                child: Text(caption, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
              child: QcChoice<bool>(
                expand: true,
                value: _handledTab,
                onChanged: (v) => setState(() => _handledTab = v),
                options: [(false, 'Chờ duyệt · ${queue.length}'), (true, 'Đã xử lý · ${handled.length}')],
              ),
            ),
            Expanded(
              child: AsyncContent<List<GradeDecision>>(
                value: keepData(decisions),
                onRefresh: _refresh,
                data: (_) {
                  if (_handledTab) return HandledTab(decisions: handled, bySpec: summary?.bySpec ?? const []);
                  // Chỉ bám theo con vừa đo lại khi tôi còn việc phải làm với nó; còn lại giữ vị trí trong hàng chờ.
                  final pinned = _pinnedCrab == null ? -1 : queue.indexWhere((d) => d.crabCode == _pinnedCrab && role(d).order == 0);
                  final index = pinned >= 0 ? pinned : min(_pos, queue.length - 1);
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
                    children: [
                      if (queue.isEmpty)
                        EmptyState(
                          icon: Icons.check_circle_outline_rounded,
                          title: 'Không có con nào chờ duyệt',
                          message: summary != null && summary.notMeasured > 0 ? 'Còn ${summary.notMeasured} con chưa đo ở trạm.' : null,
                        )
                      else ...[
                        if (queue.length > 1) _Pager(index: index, total: queue.length, onGo: _go),
                        _waitingCard(queue[index], role(queue[index]), ruleSetOf(ruleSets, summary?.crabType, queue[index].ruleSetVersion), !tasks.hasValue),
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

  Widget _waitingCard(GradeDecision d, DecisionRole role, GradeRuleSet? ruleSet, bool checking) {
    void pin(String crabCode) => setState(() => _pinnedCrab = crabCode);
    return DecisionCard(
      key: ValueKey(d.decisionNo),
      decision: d,
      ruleSet: ruleSet,
      actions: DecisionActions(decision: d, role: role, checking: checking, onRemeasured: pin),
      extra: role == DecisionRole.session && !d.needsCaliper
          ? Padding(padding: const EdgeInsets.only(top: 8), child: CaliperButton(decision: d, onRemeasured: pin))
          : null,
    );
  }
}

/// "Con 2 / 5" với nút lùi, tới để xem con khác trong hàng chờ.
class _Pager extends StatelessWidget {
  const _Pager({required this.index, required this.total, required this.onGo});
  final int index;
  final int total;
  final ValueChanged<int> onGo;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(
      children: [
        Semantics(
          label: 'Con trước',
          child: CircleIconButton(
            icon: Icons.chevron_left_rounded,
            foreground: index == 0 ? AppColors.surfaceMuted : AppColors.ink,
            onTap: index == 0 ? null : () => onGo(index - 1),
          ),
        ),
        Expanded(
          child: Text('Con ${index + 1} / $total', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
        ),
        Semantics(
          label: 'Con sau',
          child: CircleIconButton(
            icon: Icons.chevron_right_rounded,
            foreground: index >= total - 1 ? AppColors.surfaceMuted : AppColors.ink,
            onTap: index >= total - 1 ? null : () => onGo(index + 1),
          ),
        ),
      ],
    ),
  );
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/grading_models.dart';
import '../data/grading_repository.dart';
import '../data/qc_models.dart';
import '../widgets/qc_parts.dart';
import 'decision_card.dart';
import 'decision_sheets.dart';

/// Kết quả cuối của một quyết định: size và hạng đã duyệt, hoặc chip "Loại bỏ".
class _FinalPills extends StatelessWidget {
  const _FinalPills(this.d);
  final GradeDecision d;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 6,
    runSpacing: 6,
    alignment: WrapAlignment.end,
    children: d.isApproved
        ? [StatusPill(kind: 'sizeCode', value: d.finalSize), StatusPill(kind: 'gradeCode', value: d.finalGrade)]
        : [StatusPill(kind: 'grade', value: d.status)],
  );
}

/// Tab "Đã xử lý": các con đã duyệt hoặc đã loại của Lô. Bấm một con để xem quyết định hiện hành, đổi size, hạng
/// hoặc loại bỏ. Người không đủ quyền bấm thì lỗi của máy chủ hiện trong hộp thao tác.
class HandledTab extends StatelessWidget {
  const HandledTab({super.key, required this.decisions, required this.bySpec});
  final List<GradeDecision> decisions;
  final List<SpecCount> bySpec;

  Future<void> _open(BuildContext context, GradeDecision d) async {
    final action = await showQcSheet<String>(context, _HandledSheet(decision: d));
    if (action == null || !context.mounted) return;
    await showQcSheet<GradeDecision>(context, action == 'revise' ? ReviseSheet(decision: d) : RejectSheet(decision: d));
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        if (decisions.isEmpty)
          const EmptyState(icon: Icons.inventory_2_outlined, title: 'Chưa có con nào được duyệt hoặc loại')
        else
          AppCard(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              children: [
                for (final d in decisions)
                  ListTile(
                    onTap: () => _open(context, d),
                    title: Text(d.crabCode, style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                    subtitle: Text(
                      '${formatNum(d.weightG, 1)} g${d.versionNo > 1 ? ' · phiên bản ${d.versionNo}' : ''}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    trailing: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 190), child: _FinalPills(d)),
                  ),
              ],
            ),
          ),
        if (bySpec.isNotEmpty)
          MoreSection(
            label: 'Theo quy cách · ${bySpec.length}',
            children: [
              KeyValueList(rows: [for (final s in bySpec) (specName(null, s.size, s.grade), '${s.count} con')]),
            ],
          ),
      ],
    );
  }
}

/// Quyết định hiện hành của một con đã xử lý. Đóng hộp và trả 'revise' hoặc 'reject' khi bấm nút tương ứng.
class _HandledSheet extends ConsumerWidget {
  const _HandledSheet({required this.decision});
  final GradeDecision decision;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = decision;
    final older = [
      for (final v in (ref.watch(crabHistoryProvider(d.crabCode)).value ?? const <GradeDecision>[]).reversed)
        if (v.decisionNo != d.decisionNo && v.isHandled) v,
    ];
    return SafeArea(
      top: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.88),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(d.crabCode, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: d.isApproved
                    ? [
                        ProposalPill(kind: 'sizeCode', value: d.finalSize),
                        ProposalPill(kind: 'gradeCode', value: d.finalGrade),
                      ]
                    : [ProposalPill(kind: 'grade', value: d.status)],
              ),
              if (d.reason != null || d.sensoryNote != null) ...[
                const SizedBox(height: 10),
                Text([?d.reason, ?d.sensoryNote].join(' · ')),
              ],
              if (d.hasPhoto) ...[
                const SizedBox(height: 12),
                AuthImage('/api/grade-decisions/${Uri.encodeComponent(d.decisionNo)}/photo', height: 180),
              ],
              MoreSection(
                label: 'Chi tiết',
                children: [
                  KeyValueList(
                    rows: [
                      ('Đề xuất', specName(null, d.proposedSize, d.proposedGrade)),
                      ('Quy cách', d.specCode),
                      ('Khối lượng', d.weightG == null ? null : '${formatNum(d.weightG, 1)} g'),
                      ('Chỉ số C', d.cIndex == null ? null : formatNum(d.cIndex, 4)),
                      ('Tình trạng', d.liveStatus == null ? null : liveStatusLabels[d.liveStatus] ?? d.liveStatus),
                      ('An toàn thực phẩm', d.foodSafety == null ? null : foodSafetyLabels[d.foodSafety] ?? d.foodSafety),
                      ('Lúc', '${formatTime(d.decidedAt ?? d.createdAt)} ${formatDate(d.decidedAt ?? d.createdAt)}'),
                    ],
                  ),
                  for (final v in older)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              ['Phiên bản ${v.versionNo}', ?v.reason].join(' · '),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ),
                          const SizedBox(width: 10),
                          _FinalPills(v),
                        ],
                      ),
                    ),
                ],
              ),
              if (d.isCurrent && d.isApproved) ...[
                const SizedBox(height: 6),
                FilledButton.icon(
                  onPressed: () => Navigator.of(context).pop('revise'),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Đổi size/hạng'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: AppColors.danger, minimumSize: const Size.fromHeight(48)),
                  onPressed: () => Navigator.of(context).pop('reject'),
                  child: const Text('Loại bỏ'),
                ),
              ],
              TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Đóng')),
            ],
          ),
        ),
      ),
    );
  }
}

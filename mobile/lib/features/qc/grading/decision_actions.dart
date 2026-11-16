import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_parts.dart';
import '../data/grading_models.dart';
import '../data/grading_repository.dart';
import '../data/qc_models.dart';
import '../widgets/qc_parts.dart';
import 'decision_sheets.dart';

ButtonStyle _outlined(Color color) => OutlinedButton.styleFrom(
  minimumSize: const Size.fromHeight(52),
  foregroundColor: color,
  side: BorderSide(color: color.withValues(alpha: 0.5)),
  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
  textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
);

/// Nút "Nhập thước kẹp" phụ, đặt trong phần gấp của thẻ khi quyết định không bắt buộc đo thước kẹp.
class CaliperButton extends StatelessWidget {
  const CaliperButton({super.key, required this.decision, required this.onRemeasured, this.primary = false});
  final GradeDecision decision;
  final ValueChanged<String> onRemeasured;
  final bool primary;

  Future<void> _open(BuildContext context) async {
    final updated = await showQcSheet<GradeDecision>(context, CaliperSheet(decision: decision));
    if (updated != null) onRemeasured(updated.crabCode);
  }

  @override
  Widget build(BuildContext context) => primary
      ? FilledButton.icon(onPressed: () => _open(context), icon: const Icon(Icons.straighten_rounded), label: const Text('Nhập thước kẹp'))
      : OutlinedButton.icon(
          style: _outlined(AppColors.ink),
          onPressed: () => _open(context),
          icon: const Icon(Icons.straighten_rounded),
          label: const Text('Nhập thước kẹp'),
        );
}

/// Nút thao tác trên một con đang chờ, theo vai của tôi. Buổi đo: Duyệt, Giữ lại, Loại bỏ (nút chính thành
/// "Nhập thước kẹp" khi quyết định bắt buộc đo thước kẹp). Người kiểm thứ hai: Xác nhận giữ rồi Duyệt hoặc Loại bỏ.
class DecisionActions extends ConsumerWidget {
  const DecisionActions({super.key, required this.decision, required this.role, required this.checking, required this.onRemeasured});
  final GradeDecision decision;
  final DecisionRole role;

  /// Chưa biết tôi có được phân việc của Lô này hay không.
  final bool checking;

  /// Sau khi nhập thước kẹp: mã cua để màn hình bám theo phiên bản đề xuất mới.
  final ValueChanged<String> onRemeasured;

  Future<void> _confirmHold(BuildContext context, WidgetRef ref) async {
    final ok = await showConfirmSheet(
      context,
      title: 'Xác nhận giữ ${decision.crabCode}',
      message: [if (decision.reason != null) 'Lý do giữ lại: ${decision.reason}.', 'Sau đó bạn duyệt hoặc loại con này.'].join(' '),
      confirmLabel: 'Xác nhận giữ',
    );
    if (ok == null || !context.mounted) return;
    try {
      final updated = await ref.read(gradingRepositoryProvider).confirmHold(decision.decisionNo);
      if (!context.mounted) return;
      applyDecision(ref, decision.batchCode, updated);
      showAppToast(context, 'Đã xác nhận giữ. Giờ bạn duyệt hoặc loại.');
    } catch (error) {
      if (context.mounted) showAppToast(context, qcErrorMessage(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = decision;
    if (checking) return const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator(strokeWidth: 3)));
    if (role == DecisionRole.holder) return const QcNote('Bạn đã giữ lại con này. Chờ người kiểm thứ hai.');
    if (role == DecisionRole.none) return const QcNote('Con này không phân cho bạn.');

    if (role == DecisionRole.second && d.secondConfirmedAt == null) {
      return FilledButton.icon(
        onPressed: () => _confirmHold(context, ref),
        icon: const Icon(Icons.verified_user_outlined),
        label: const Text('Xác nhận giữ'),
      );
    }
    final session = role == DecisionRole.session;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (d.needsCaliper && session)
          CaliperButton(decision: d, onRemeasured: onRemeasured, primary: true)
        else
          FilledButton.icon(
            onPressed: d.needsCaliper ? null : () => showQcSheet<GradeDecision>(context, ApproveSheet(decision: d)),
            icon: const Icon(Icons.check_rounded),
            label: const Text('Duyệt'),
          ),
        const SizedBox(height: 8),
        Row(
          children: [
            if (session) ...[
              Expanded(
                child: OutlinedButton.icon(
                  style: _outlined(AppColors.ink),
                  onPressed: () => showQcSheet<GradeDecision>(context, HoldSheet(decision: d)),
                  icon: const Icon(Icons.pause_circle_outline_rounded),
                  label: const Text('Giữ lại'),
                ),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: OutlinedButton.icon(
                style: _outlined(AppColors.danger),
                onPressed: () => showQcSheet<GradeDecision>(context, RejectSheet(decision: d)),
                icon: const Icon(Icons.delete_outline_rounded),
                label: const Text('Loại bỏ'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

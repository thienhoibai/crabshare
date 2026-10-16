import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/app_theme.dart';
import '../../../app/routes.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';

/// Tab "Cảnh báo": hao hụt, chất lượng nước, thiếu dữ liệu, trễ mốc, bằng chứng bị gắn cờ.
/// Hộ nuôi phải xác nhận + ghi cách xử lý trước hạn, quá hạn thì hệ thống leo thang lên quản trị.
class AlertsPage extends ConsumerWidget {
  const AlertsPage({super.key});

  static IconData iconFor(AlertType type) => switch (type) {
    AlertType.mortality => Icons.heart_broken_outlined,
    AlertType.waterQuality => Icons.water_drop_outlined,
    AlertType.milestoneDelay => Icons.schedule_rounded,
    AlertType.lowStock => Icons.inventory_2_outlined,
    AlertType.dataSilence => Icons.edit_off_outlined,
    AlertType.evidenceFlag => Icons.flag_outlined,
  };

  static Color colorFor(AlertSeverity s) => switch (s) {
    AlertSeverity.low => AppColors.inkMuted,
    AlertSeverity.medium => AppColors.accentText,
    AlertSeverity.high || AlertSeverity.critical => AppColors.danger,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(alertsProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Cảnh báo',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 12),
                  AddBar(
                    label: 'Bằng chứng bị gắn cờ',
                    onTap: () => context.push(Routes.flaggedEvidence),
                  ),
                ],
              ),
            ),
            Expanded(
              child: AsyncContent(
                value: alerts,
                onRefresh: () => ref.refresh(alertsProvider.future),
                data: (list) {
                  final open = list
                      .where(
                        (a) =>
                            a.status == AlertStatus.open ||
                            a.status == AlertStatus.escalated,
                      )
                      .toList();
                  final done = list.where((a) => !open.contains(a)).toList();
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(
                      20,
                      12,
                      20,
                      kNavBarClearance,
                    ),
                    children: [
                      SectionHeader(
                        title: 'Cần phản hồi',
                        actionLabel: '${open.length}',
                      ),
                      if (open.isEmpty)
                        const EmptyState(
                          icon: Icons.check_circle_outline_rounded,
                          title: 'Không có cảnh báo mở',
                        ),
                      for (final a in open) ...[
                        _AlertCard(alert: a),
                        const SizedBox(height: 10),
                      ],
                      if (done.isNotEmpty)
                        const SectionHeader(title: 'Đã xử lý'),
                      for (final a in done) ...[
                        _AlertCard(alert: a),
                        const SizedBox(height: 10),
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

class _AcknowledgeSheet extends ConsumerStatefulWidget {
  const _AcknowledgeSheet({required this.alert});
  final AlertItem alert;
  @override
  ConsumerState<_AcknowledgeSheet> createState() => _AcknowledgeSheetState();
}

class _AcknowledgeSheetState extends ConsumerState<_AcknowledgeSheet> {
  final _note = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(alertsProvider.notifier)
          .acknowledge(widget.alert.id, _note.text.trim());
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = apiErrorMessage(error);
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Xác nhận cảnh báo',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 6),
            Text(
              widget.alert.message,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _note,
              enabled: !_busy,
              maxLines: 3,
              maxLength: 300,
              decoration: const InputDecoration(hintText: 'Đã xử lý thế nào?'),
              validator: (value) => value == null || value.trim().isEmpty
                  ? 'Vui lòng ghi cách xử lý cảnh báo.'
                  : null,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppColors.danger),
                ),
              ),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: Text(_busy ? 'Đang gửi…' : 'Gửi xác nhận'),
            ),
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(context).pop(),
              child: const Text('Hủy'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _AlertCard extends ConsumerWidget {
  const _AlertCard({required this.alert});

  final AlertItem alert;

  Future<void> _acknowledge(BuildContext context, WidgetRef ref) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        isDismissible: false,
        enableDrag: false,
        backgroundColor: AppColors.background,
        showDragHandle: true,
        builder: (context) => _AcknowledgeSheet(alert: alert),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = AlertsPage.colorFor(alert.severity);
    final isOpen =
        alert.status == AlertStatus.open ||
        alert.status == AlertStatus.escalated;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconTile(
                icon: AlertsPage.iconFor(alert.type),
                foreground: color,
                background: color.withValues(alpha: 0.12),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${alert.type.label} · ${alert.batchCode}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      '${alert.severity.label} · ${formatAgo(alert.raisedAt)}',
                      style: TextStyle(
                        color: color,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(alert.message),
          if (alert.responseNote != null) ...[
            const SizedBox(height: 6),
            Text(
              'Phản hồi: ${alert.responseNote}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  isOpen
                      ? 'Hạn phản hồi: ${formatDueIn(alert.ackDeadline)}'
                      : alert.status.label,
                  style: TextStyle(
                    color: isOpen ? AppColors.accentText : AppColors.success,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (alert.canAcknowledge)
                FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 42),
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                  ),
                  onPressed: () => _acknowledge(context, ref),
                  child: const Text('Xác nhận'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

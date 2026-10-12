import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_theme.dart';
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
        child: alerts.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorView(message: apiErrorMessage(e), onRetry: () => ref.invalidate(alertsProvider)),
          data: (list) {
            final open = list.where((a) => a.status == AlertStatus.open || a.status == AlertStatus.escalated).toList();
            final done = list.where((a) => !open.contains(a)).toList();
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
              children: [
                Text('Cảnh báo', style: Theme.of(context).textTheme.headlineMedium),
                SectionHeader(title: 'Cần phản hồi', actionLabel: '${open.length}'),
                if (open.isEmpty) const EmptyState(icon: Icons.check_circle_outline_rounded, title: 'Không có cảnh báo mở'),
                for (final a in open) ...[_AlertCard(alert: a), const SizedBox(height: 10)],
                if (done.isNotEmpty) const SectionHeader(title: 'Đã xử lý'),
                for (final a in done) ...[_AlertCard(alert: a), const SizedBox(height: 10)],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _AlertCard extends ConsumerWidget {
  const _AlertCard({required this.alert});

  final AlertItem alert;

  Future<void> _acknowledge(BuildContext context, WidgetRef ref) async {
    final note = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Xác nhận cảnh báo', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            Text(alert.message, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            TextField(controller: note, maxLines: 3, maxLength: 300, decoration: const InputDecoration(hintText: 'Đã xử lý thế nào?')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Gửi xác nhận')),
          ],
        ),
      ),
    );
    if (confirmed == true && note.text.trim().isNotEmpty) {
      await ref.read(alertsProvider.notifier).acknowledge(alert.id, note.text.trim());
    }
    note.dispose();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = AlertsPage.colorFor(alert.severity);
    final isOpen = alert.status == AlertStatus.open || alert.status == AlertStatus.escalated;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconTile(icon: AlertsPage.iconFor(alert.type), foreground: color, background: color.withValues(alpha: 0.12)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${alert.type.label} · ${alert.batchCode}', style: Theme.of(context).textTheme.titleMedium),
                    Text('${alert.severity.label} · ${formatAgo(alert.raisedAt)}', style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(alert.message),
          if (alert.responseNote != null) ...[
            const SizedBox(height: 6),
            Text('Phản hồi: ${alert.responseNote}', style: Theme.of(context).textTheme.bodySmall),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  isOpen ? 'Hạn phản hồi: ${formatDueIn(alert.ackDeadline)}' : alert.status.label,
                  style: TextStyle(color: isOpen ? AppColors.accentText : AppColors.success, fontWeight: FontWeight.w700),
                ),
              ),
              if (isOpen)
                FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 42), padding: const EdgeInsets.symmetric(horizontal: 18)),
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

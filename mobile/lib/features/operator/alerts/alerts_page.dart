import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/alert_repository.dart';
import '../data/operator_models.dart';

/// Cảnh báo của hộ nuôi: cảnh báo đang mở đứng trước, mỗi cái một nút phản hồi; cảnh báo đã phản hồi nằm trong khối gấp.
class AlertsPage extends ConsumerWidget {
  const AlertsPage({super.key});

  static IconData iconFor(String type) => switch (type) {
    'Mortality' => Icons.heart_broken_outlined,
    'WaterQuality' => Icons.water_drop_outlined,
    'MilestoneDelay' => Icons.schedule_rounded,
    'LowStock' => Icons.inventory_2_outlined,
    'DataSilence' || 'MissingCareLog' => Icons.edit_off_outlined,
    'EvidenceFlag' => Icons.flag_outlined,
    'DeviceOffline' => Icons.wifi_off_rounded,
    'NoCrabDetected' => Icons.image_search_rounded,
    _ => Icons.warning_amber_rounded,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final alerts = ref.watch(alertsProvider);
    return Scaffold(
      body: SafeArea(
        child: AsyncContent<List<AlertItem>>(
          value: alerts,
          onRefresh: () => ref.refresh(alertsProvider.future),
          header: const Padding(
            padding: EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: SubPageHeader(title: 'Cảnh báo'),
          ),
          data: (list) {
            final open = [
              for (final a in list)
                if (a.isOpen) a,
            ];
            final done = [
              for (final a in list)
                if (!a.isOpen) a,
            ];
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: [
                const SubPageHeader(title: 'Cảnh báo'),
                const SizedBox(height: 14),
                if (open.isEmpty) const EmptyState(icon: Icons.check_circle_outline_rounded, title: 'Không có cảnh báo đang mở'),
                for (final a in open) ...[_AlertCard(key: ValueKey(a.id), alert: a), const SizedBox(height: 10)],
                if (done.isNotEmpty)
                  MoreSection(
                    label: 'Đã phản hồi (${done.length})',
                    children: [
                      for (final a in done) ...[_AlertCard(key: ValueKey(a.id), alert: a), const SizedBox(height: 10)],
                    ],
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _AlertCard extends ConsumerStatefulWidget {
  const _AlertCard({super.key, required this.alert});
  final AlertItem alert;

  @override
  ConsumerState<_AlertCard> createState() => _AlertCardState();
}

class _AlertCardState extends ConsumerState<_AlertCard> {
  bool _busy = false;

  Future<void> _acknowledge() async {
    final alert = widget.alert;
    final note = await showConfirmSheet(
      context,
      title: 'Phản hồi cảnh báo',
      message: alert.message,
      confirmLabel: 'Gửi phản hồi',
      reasonLabel: 'Đã xử lý thế nào?',
      reasonRequired: true,
    );
    if (note == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(alertsProvider.notifier).acknowledge(alert.id, note);
      if (mounted) showAppToast(context, 'Đã gửi phản hồi.');
    } catch (error) {
      if (mounted) showAppToast(context, apiErrorMessage(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final alert = widget.alert;
    final color = toneColor(statusTone('severity', alert.severity));
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
                    Text(statusLabel('alertType', alert.type), style: Theme.of(context).textTheme.titleMedium),
                    Text('${alert.batchCode} · ${formatAgo(alert.raisedAt)}', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              if (!alert.isOpen) StatusPill(kind: 'alert', value: alert.status),
            ],
          ),
          const SizedBox(height: 10),
          Text(alert.message),
          if (alert.responseNote != null) ...[
            const SizedBox(height: 6),
            Text('Phản hồi: ${alert.responseNote}', style: Theme.of(context).textTheme.bodySmall),
          ],
          if (alert.isOpen) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    alert.acknowledgedAt != null ? 'Đã phản hồi, chờ xử lý' : 'Hạn phản hồi: ${formatDueIn(alert.ackDeadline)}',
                    style: const TextStyle(color: AppColors.accentText, fontWeight: FontWeight.w700),
                  ),
                ),
                if (alert.type == 'EvidenceFlag') TextButton(onPressed: () => context.push(Routes.flaggedEvidence), child: const Text('Xem ảnh')),
                if (alert.canAcknowledge)
                  FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 48), padding: const EdgeInsets.symmetric(horizontal: 20)),
                    onPressed: _busy ? null : _acknowledge,
                    child: Text(_busy ? 'Đang gửi…' : 'Phản hồi'),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

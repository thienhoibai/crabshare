import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/alert_repository.dart';
import '../data/operator_repository.dart';
import '../evidence/capture_requests_repository.dart';
import '../evidence/evidence_explanation_repository.dart';

/// Tab "Hôm nay" của người nuôi: ba con số, danh sách việc đang chờ (bấm vào là tới màn xử lý), hai lối tắt.
class OperatorTodayPage extends ConsumerStatefulWidget {
  const OperatorTodayPage({super.key});

  @override
  ConsumerState<OperatorTodayPage> createState() => _OperatorTodayPageState();
}

class _Todo {
  const _Todo({required this.icon, required this.title, required this.sub, required this.route, this.color = AppColors.accentText});
  final IconData icon;
  final String title;
  final String sub;
  final String route;
  final Color color;
}

class _OperatorTodayPageState extends ConsumerState<OperatorTodayPage> with WidgetsBindingObserver {
  /// Số yêu cầu chụp hiện thành từng dòng; phần còn lại gộp thành một câu.
  static const _maxCaptureRows = 4;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Mở lại ứng dụng thì việc đang chờ có thể đã đổi (yêu cầu chụp quá hạn, cảnh báo mới).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) _invalidate();
  }

  void _invalidate() {
    ref.invalidate(operatorDashboardProvider);
    ref.invalidate(operatorBatchesProvider);
    ref.invalidate(alertsProvider);
    ref.invalidate(captureRequestsProvider);
    ref.invalidate(flaggedEvidenceProvider);
  }

  Future<void> _refresh() async {
    _invalidate();
    await Future.wait([
      ref.read(operatorDashboardProvider.future),
      ref.read(operatorBatchesProvider.future),
      ref.read(alertsProvider.future),
      ref.read(captureRequestsProvider.future),
      ref.read(flaggedEvidenceProvider.future),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    final dash = ref.watch(operatorDashboardProvider);
    final batches = ref.watch(operatorBatchesProvider);
    final alerts = ref.watch(alertsProvider);
    final requests = ref.watch(captureRequestsProvider);
    final flagged = ref.watch(flaggedEvidenceProvider);
    final sources = <AsyncValue<Object?>>[dash, alerts, requests, flagged];
    final loading = sources.any((s) => s.isLoading && !s.hasValue);
    final failed = sources.where((s) => s.hasError && !s.isLoading).firstOrNull;

    final now = DateTime.now();
    final openAlerts = [...?alerts.value].where((a) => a.isOpen).toList();
    final logsDue = dash.value?.logsDue ?? const [];
    final waiting = [...?requests.value].where((r) => r.status == 'Open' && r.dueAt.isAfter(now)).toList();
    final toExplain = [...?flagged.value].where((e) => e.needsExplanation).toList();

    final todos = <_Todo>[
      if (openAlerts.isNotEmpty)
        _Todo(
          icon: Icons.warning_amber_rounded,
          title: '${openAlerts.length} cảnh báo cần phản hồi',
          sub: openAlerts.first.message,
          route: Routes.operatorAlerts,
          color: AppColors.danger,
        ),
      for (final r in waiting.take(_maxCaptureRows))
        _Todo(
          icon: Icons.photo_camera_outlined,
          title: 'Chụp ảnh hộp ${r.slotCode}',
          sub: '${r.batchCode} · ${formatDueIn(r.dueAt, now: now)}',
          route: Routes.captureRequest(id: r.id, slotCode: r.slotCode, batchCode: r.batchCode, dueAt: r.dueAt),
        ),
      for (final b in logsDue)
        _Todo(icon: Icons.edit_note_rounded, title: 'Ghi nhật ký hôm nay', sub: '${b.code} · ${b.title}', route: Routes.dailyLogFor(b.code)),
      if (toExplain.isNotEmpty)
        _Todo(
          icon: Icons.flag_outlined,
          title: '${toExplain.length} ảnh cần giải trình',
          sub: toExplain.length == 1 ? 'Hộp ${toExplain.first.slotCode ?? '—'} · ${toExplain.first.batchCode}' : 'Ảnh chụp tại hộp bị gắn cờ',
          route: toExplain.length == 1 ? Routes.evidenceExplanation(toExplain.first.id) : Routes.flaggedEvidence,
          color: AppColors.warning,
        ),
    ];
    final moreCaptures = waiting.length - _maxCaptureRows;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AppRefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              GreetingHeader(
                name: user?.fullName ?? '',
                subtitle: dash.value?.farmName ?? '',
                notificationCount: openAlerts.length,
                onBell: () => context.push(Routes.operatorAlerts),
              ),
              const SizedBox(height: 18),
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: _Number(label: 'Lô đang chạy', value: batches.hasValue ? '${batches.value!.where((b) => b.onFarm).length}' : '—'),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _Number(
                        label: 'Cảnh báo mở',
                        value: alerts.hasValue ? '${openAlerts.length}' : '—',
                        color: openAlerts.isEmpty ? null : AppColors.danger,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _Number(
                        label: 'Chưa ghi nhật ký',
                        value: dash.hasValue ? '${logsDue.length}' : '—',
                        color: logsDue.isEmpty ? null : AppColors.warning,
                      ),
                    ),
                  ],
                ),
              ),
              const SectionHeader(title: 'Việc hôm nay'),
              for (final todo in todos) ...[_TodoCard(todo: todo), const SizedBox(height: 10)],
              if (moreCaptures > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text('Còn $moreCaptures hộp khác cần chụp.', style: Theme.of(context).textTheme.bodySmall),
                ),
              if (loading)
                const LoadingSkeleton(rows: 2)
              else if (failed != null)
                ErrorView(message: apiErrorMessage(failed.error!), onRetry: _invalidate)
              else if (todos.isEmpty)
                const EmptyState(icon: Icons.check_circle_outline_rounded, title: 'Hôm nay không còn việc đang chờ'),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _QuickAction(icon: Icons.edit_note_rounded, label: 'Ghi nhật ký', onTap: () => context.push(Routes.dailyLogNew)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _QuickAction(icon: Icons.notifications_none_rounded, label: 'Cảnh báo', onTap: () => context.push(Routes.operatorAlerts)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Ô số liệu nhỏ; ba ô đứng một hàng (FactGrid của bộ khối chỉ có hai cột).
class _Number extends StatelessWidget {
  const _Number({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: AppFonts.figure(28, color: color ?? AppColors.ink),
        ),
        const SizedBox(height: 2),
        Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
      ],
    ),
  );
}

class _TodoCard extends StatelessWidget {
  const _TodoCard({required this.todo});
  final _Todo todo;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(12),
    onTap: () => context.push(todo.route),
    child: Row(
      children: [
        IconTile(icon: todo.icon, foreground: todo.color, background: todo.color.withValues(alpha: 0.12)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(todo.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
              Text(todo.sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        const Icon(Icons.chevron_right_rounded, color: AppColors.inkMuted),
      ],
    ),
  );
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppCard(
    color: AppColors.surfaceMuted,
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
    onTap: onTap,
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 22),
        const SizedBox(width: 8),
        Flexible(
          child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
        ),
      ],
    ),
  );
}

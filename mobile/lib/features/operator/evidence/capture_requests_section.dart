import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import 'capture_requests_repository.dart';

class CaptureRequestsSection extends ConsumerStatefulWidget {
  const CaptureRequestsSection({super.key});
  @override
  ConsumerState<CaptureRequestsSection> createState() =>
      _CaptureRequestsSectionState();
}

class _CaptureRequestsSectionState extends ConsumerState<CaptureRequestsSection>
    with WidgetsBindingObserver {
  Timer? _timer;
  bool _active = true;
  DateTime _now = DateTime.now();
  DateTime _nextRefresh = DateTime.now().add(const Duration(minutes: 1));
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || !_active || !TickerMode.valuesOf(context).enabled) return;
      setState(() => _now = DateTime.now());
      if (!_now.isBefore(_nextRefresh)) {
        _nextRefresh = _now.add(const Duration(minutes: 1));
        ref.invalidate(captureRequestsProvider);
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _active = state == AppLifecycleState.resumed;
    if (_active && mounted) {
      setState(() => _now = DateTime.now());
      _nextRefresh = _now.add(const Duration(minutes: 1));
      ref.invalidate(captureRequestsProvider);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final requests = ref.watch(captureRequestsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: 'Yêu cầu chụp'),
        ...requests.when(
          skipLoadingOnRefresh: false,
          loading: () => [const LoadingSkeleton(rows: 2)],
          error: (error, _) => [
            ErrorView(
              message: apiErrorMessage(error),
              onRetry: () => ref.invalidate(captureRequestsProvider),
            ),
          ],
          data: (list) => list.isEmpty
              ? [
                  const Text(
                    'Không có yêu cầu chụp đang chờ.',
                    style: TextStyle(color: AppColors.inkMuted),
                  ),
                ]
              : [
                  for (final request in list) ...[
                    AppCard(
                      onTap:
                          request.status != 'Open' ||
                              _now.isAfter(request.dueAt)
                          ? null
                          : () => context.push(
                              Routes.captureRequest(
                                id: request.id,
                                slotCode: request.slotCode,
                                batchCode: request.batchCode,
                                dueAt: request.dueAt,
                              ),
                            ),
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const IconTile(icon: Icons.photo_camera_outlined),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Hộp ${request.slotCode}',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium,
                                ),
                                Text(
                                  '${request.batchCode} · hạn ${formatTime(request.dueAt)}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              _now.isAfter(request.dueAt)
                                  ? 'Đã quá hạn'
                                  : formatDueIn(request.dueAt, now: _now),
                              textAlign: TextAlign.end,
                              style: TextStyle(
                                color: _now.isAfter(request.dueAt)
                                    ? AppColors.danger
                                    : AppColors.accentText,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
        ),
      ],
    );
  }
}

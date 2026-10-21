import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/timeline_repository.dart';
import 'timeline_entry.dart';

class BatchTimeline extends ConsumerWidget {
  const BatchTimeline({super.key, required this.code});
  final String code;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final revision = ref.watch(timelineRefreshProvider);
    return _TimelineBody(
      key: ValueKey('$code:${session.user?.userId}:${session.token}:$revision'),
      code: code,
    );
  }
}

class _TimelineBody extends ConsumerStatefulWidget {
  const _TimelineBody({super.key, required this.code});
  final String code;
  @override
  ConsumerState<_TimelineBody> createState() => _TimelineBodyState();
}

class _TimelineBodyState extends ConsumerState<_TimelineBody> {
  List<TimelineDay> _days = [];
  String? _next;
  bool _hasMore = false, _busy = true;
  Object? _error;
  CancelToken? _cancel;
  int _generation = 0;
  @override
  void initState() { super.initState(); Future.microtask(() => _load(reset: true)); }
  @override
  void dispose() { _cancel?.cancel(); super.dispose(); }
  Future<void> _load({bool reset = false}) async {
    if (!mounted || (!reset && _busy)) return;
    _cancel?.cancel();
    final cancel = CancelToken(); _cancel = cancel;
    setState(() {
      _busy = true; _error = null;
      if (reset) { _days = []; _next = null; _hasMore = false; _generation++; }
    });
    try {
      final page = await ref.read(timelineRepositoryProvider).timeline(widget.code, before: _next, cancelToken: cancel);
      if (!mounted || cancel.isCancelled || !identical(cancel, _cancel)) return;
      setState(() { _days = mergeTimelineDays(_days, page.groups); _next = page.nextBefore; _hasMore = page.hasMore && _next != null; _busy = false; });
    } catch (error) {
      if (!mounted || cancel.isCancelled || !identical(cancel, _cancel)) return;
      setState(() { _days = []; _next = null; _hasMore = false; _busy = false; _error = error; _generation++; });
    }
  }
  void _deny() {
    if (!mounted) return;
    _cancel?.cancel();
    setState(() {
      _days = []; _hasMore = false; _busy = false;
      _error = DioException(requestOptions: RequestOptions(),
        response: Response(requestOptions: RequestOptions(), statusCode: 403));
    });
  }
  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final forbidden = _error is DioException && (_error as DioException).response?.statusCode == 403;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('Nhật trình sản xuất', style: text.titleLarge)),
          IconButton(tooltip: 'Làm mới nhật trình', onPressed: _busy ? null : () => _load(reset: true), icon: const Icon(Icons.refresh_rounded)),
        ]),
        Text('Từng ghi nhận từ hộ nuôi · Giờ Việt Nam UTC+7', style: text.bodySmall),
        const SizedBox(height: 16),
        if (forbidden) const AppCard(child: Column(children: [
          Icon(Icons.lock_outline_rounded, size: 32),
          SizedBox(height: 12),
          Text('Bạn chưa có quyền xem nhật trình của lô này.'),
          SizedBox(height: 8),
          Text('Cần khoản góp đã xác nhận hoặc quyền vận hành lô.'),
        ]))
        else if (_error != null) ErrorView(message: apiErrorMessage(_error!), onRetry: () => _load(reset: true))
        else if (_busy && _days.isEmpty) const LoadingSkeleton(rows: 2)
        else if (_days.isEmpty) const AppCard(child: Column(children: [
          Icon(Icons.menu_book_rounded, size: 32), SizedBox(height: 12),
          Text('Nhật trình đang chờ những ghi nhận đầu tiên', textAlign: TextAlign.center),
          SizedBox(height: 8), Text('Nhật ký, sự kiện hộp, bằng chứng được chấp nhận và cảnh báo sẽ xuất hiện tại đây.', textAlign: TextAlign.center),
        ]))
        else ...[
          for (final day in _days) ...[
            Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Row(children: [
              Container(padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.surfaceMuted, borderRadius: BorderRadius.circular(12)),
                child: Text(day.date.substring(8), style: text.titleLarge)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(timelineDate(day.date), style: text.titleMedium),
                Text('${day.items.length} ghi nhận', style: text.bodySmall),
              ])),
            ])),
            for (final item in day.items) TimelineEntry(
              key: ValueKey('$_generation:${item.id}'), code: widget.code,
              item: item, onDenied: _deny,
            ),
          ],
          const SizedBox(height: 12),
          if (_hasMore) OutlinedButton.icon(
            onPressed: _busy ? null : () => _load(),
            icon: const Icon(Icons.arrow_downward_rounded),
            label: Text(_busy ? 'Đang tải…' : 'Xem những ngày trước'),
          ) else Text('Đã hiển thị toàn bộ nhật trình hiện có.', style: text.bodySmall),
        ],
      ]),
    );
  }
}

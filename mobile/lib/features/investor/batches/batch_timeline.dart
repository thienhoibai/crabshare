import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/auth/session.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/timeline_repository.dart';
import '../widgets/investor_ui.dart';
import 'timeline_entry.dart';

/// Nhật trình của một Lô theo ngày (giờ Việt Nam), tải thêm bảy ngày cũ hơn mỗi lần bấm.
/// Đổi tài khoản hoặc kéo để tải lại ở màn cha thì tải lại từ đầu.
class BatchTimeline extends ConsumerWidget {
  const BatchTimeline({super.key, required this.code});
  final String code;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userId = ref.watch(sessionProvider.select((s) => s.user?.userId));
    final revision = ref.watch(timelineRefreshProvider);
    return _TimelineBody(key: ValueKey('$code:$userId:$revision'), code: code);
  }
}

class _TimelineBody extends ConsumerStatefulWidget {
  const _TimelineBody({super.key, required this.code});
  final String code;

  @override
  ConsumerState<_TimelineBody> createState() => _TimelineBodyState();
}

class _TimelineBodyState extends ConsumerState<_TimelineBody> {
  static const _firstRows = 3;
  static const _moreRows = 20;

  /// Số dòng đang hiện của từng loại ghi nhận trong từng ngày (khoá: ngày|loại).
  final _shown = <String, int>{};
  List<TimelineDay> _days = [];
  String? _next;
  bool _hasMore = false;
  bool _busy = true;
  Object? _error;
  CancelToken? _cancel;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => _load(reset: true));
  }

  @override
  void dispose() {
    _cancel?.cancel();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (!mounted || (!reset && _busy)) return;
    _cancel?.cancel();
    final cancel = CancelToken();
    _cancel = cancel;
    setState(() {
      _busy = true;
      _error = null;
      if (reset) {
        _days = [];
        _next = null;
        _hasMore = false;
        _shown.clear();
      }
    });
    try {
      final page = await ref.read(timelineRepositoryProvider).timeline(widget.code, before: _next, cancelToken: cancel);
      if (!mounted || !identical(cancel, _cancel)) return;
      setState(() {
        _days = mergeTimelineDays(_days, page.groups);
        _next = page.nextBefore;
        _hasMore = page.hasMore && _next != null;
        _busy = false;
      });
    } catch (error) {
      if (!mounted || !identical(cancel, _cancel)) return;
      setState(() {
        _days = [];
        _next = null;
        _hasMore = false;
        _busy = false;
        _error = error;
      });
    }
  }

  /// Các dòng của một ngày. Ghi nhận cùng loại được gom lại: mỗi loại hiện ba dòng mới nhất,
  /// phần còn lại mở dần bằng nút, để một ngày có hàng trăm ghi nhận giống nhau vẫn đọc được.
  List<Widget> _dayRows(TimelineDay day) {
    final groups = <String, List<TimelineItem>>{};
    for (final item in day.items) {
      (groups[item.groupKey] ??= []).add(item);
    }
    final rows = <Widget>[];
    for (final MapEntry(key: kind, value: items) in groups.entries) {
      final stateKey = '${day.date}|$kind';
      final shown = (_shown[stateKey] ?? _firstRows).clamp(0, items.length);
      for (final item in items.take(shown)) {
        if (rows.isNotEmpty) rows.add(const Divider(height: 1, indent: 64, color: AppColors.surfaceMuted));
        rows.add(TimelineEntry(key: ValueKey(item.id), code: widget.code, item: item));
      }
      final hidden = items.length - shown;
      if (hidden > 0) {
        rows.add(
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.only(left: 54),
              child: TextButton(
                onPressed: () => setState(() => _shown[stateKey] = shown + _moreRows),
                child: Text('Còn $hidden ghi nhận cùng loại'),
              ),
            ),
          ),
        );
      }
    }
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final error = _error;
    if (error is DioException && error.response?.statusCode == 403) {
      return const EmptyState(icon: Icons.lock_outline_rounded, title: 'Bạn chưa có quyền xem nhật trình của Lô này');
    }
    if (error != null) return SectionError(error: error, onRetry: () => _load(reset: true));
    if (_busy && _days.isEmpty) return const SectionLoading();
    if (_days.isEmpty) return const EmptyState(icon: Icons.menu_book_rounded, title: 'Chưa có ghi nhận nào');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final day in _days) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
            child: Text(timelineDate(day.date), style: Theme.of(context).textTheme.titleMedium),
          ),
          AppCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _dayRows(day)),
          ),
          const SizedBox(height: 10),
        ],
        if (_hasMore)
          OutlinedButton.icon(
            style: outlinedPillStyle(),
            onPressed: _busy ? null : () => _load(),
            icon: const Icon(Icons.arrow_downward_rounded, size: 18),
            label: Text(_busy ? 'Đang tải…' : 'Xem những ngày trước'),
          ),
      ],
    );
  }
}

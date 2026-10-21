import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../data/timeline_repository.dart';

class TimelineMedia extends ConsumerStatefulWidget {
  const TimelineMedia({super.key, required this.code, required this.item, required this.onDenied});
  final String code;
  final TimelineItem item;
  final VoidCallback onDenied;
  @override
  ConsumerState<TimelineMedia> createState() => _TimelineMediaState();
}

class _TimelineMediaState extends ConsumerState<TimelineMedia> {
  Uint8List? _bytes;
  bool _loading = false;
  String? _error;
  CancelToken? _cancel;
  final _active = ValueNotifier(true);
  bool _dialogOpen = false;
  @override
  void dispose() {
    _cancel?.cancel();
    if (_dialogOpen) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_dialogOpen) _active.value = false;
      });
    } else {
      _active.dispose();
    }
    super.dispose();
  }
  Future<void> _load() async {
    if (_loading) return;
    final cancel = CancelToken(); _cancel = cancel;
    setState(() { _loading = true; _bytes = null; _error = null; });
    try {
      final bytes = await ref.read(timelineRepositoryProvider).file(widget.code, widget.item.sourceId, cancelToken: cancel);
      if (!mounted || cancel.isCancelled) return;
      setState(() { _bytes = bytes; _loading = false; });
    } catch (error) {
      if (!mounted || cancel.isCancelled) return;
      if (error is DioException && error.response?.statusCode == 403) { widget.onDenied(); return; }
      setState(() { _loading = false; _error = 'Bằng chứng tạm thời không xem được hoặc không còn được công bố.'; });
    }
  }
  Future<void> _openWeb() async {
    try {
      final opened = await launchUrl(Uri.parse('$webUrl/nha-dau-tu/lo/${Uri.encodeComponent(widget.code)}#nhat-trinh'), mode: LaunchMode.externalApplication);
      if (!opened && mounted) setState(() => _error = 'Không mở được trang bằng chứng. Vui lòng thử lại.');
    } catch (_) {
      if (mounted) setState(() => _error = 'Không mở được trình duyệt.');
    }
  }
  void _expand() {
    if (_dialogOpen) return;
    final bytes = _bytes!;
    final token = ref.read(sessionProvider).token;
    final userId = ref.read(sessionProvider).user?.userId;
    final revision = ref.read(timelineRefreshProvider);
    _dialogOpen = true;
    showDialog<void>(context: context, builder: (_) => ValueListenableBuilder<bool>(
      valueListenable: _active,
      builder: (_, active, child) => Consumer(builder: (context, dialogRef, child) {
      final session = dialogRef.watch(sessionProvider);
      final valid = active && session.token == token && session.user?.userId == userId && dialogRef.watch(timelineRefreshProvider) == revision;
      return Dialog(child: Padding(padding: const EdgeInsets.all(12), child: Column(mainAxisSize: MainAxisSize.min, children: [
        Align(alignment: Alignment.centerRight, child: IconButton(tooltip: 'Đóng ảnh', onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded))),
        if (valid) Flexible(child: InteractiveViewer(child: Image.memory(bytes, fit: BoxFit.contain, errorBuilder: (_, error, stack) => const Text('Không đọc được ảnh.'))))
        else const Text('Phiên xem đã thay đổi. Vui lòng mở lại bằng chứng.'),
      ])));
    }))).whenComplete(() {
      _dialogOpen = false;
      if (!mounted) _active.dispose();
    });
  }
  @override
  Widget build(BuildContext context) {
    if (widget.item.evidence!.mediaType != 'Photo') {
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Xem video/chứng từ qua trang CrabShare có bảo vệ. Đăng nhập bằng cùng tài khoản.'),
        TextButton.icon(onPressed: _openWeb, icon: const Icon(Icons.open_in_new_rounded), label: const Text('Xem file trên web')),
        if (_error != null) Text(_error!),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (_bytes != null) Semantics(
        label: 'Xem ảnh bằng chứng ${widget.item.sourceId}', button: true,
        child: InkWell(onTap: _expand, child: ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.memory(
          _bytes!, fit: BoxFit.contain, width: double.infinity, height: 180,
          errorBuilder: (_, error, stack) => const Text('Không đọc được ảnh bằng chứng.'),
        ))),
      ) else OutlinedButton.icon(
        onPressed: _loading ? null : _load,
        icon: const Icon(Icons.photo_outlined),
        label: Text(_loading ? 'Đang tải ảnh…' : 'Xem ảnh bằng chứng'),
      ),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!)),
    ]);
  }
}

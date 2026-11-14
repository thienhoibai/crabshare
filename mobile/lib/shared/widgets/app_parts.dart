import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../core/capture/captured_photo.dart';
import '../../core/capture/photo_camera.dart';
import '../status_labels.dart';
import 'app_ui.dart';

/// Khối giao diện bổ sung cho BR v1.5, cùng phong cách với app_ui.dart (thẻ trắng bo lớn, nhấn cam).
/// Quy tắc gọn: mỗi màn một việc, tối đa bốn con số, một nút chính; chi tiết phụ cho vào [MoreSection].

/// Chip trạng thái có nhãn tiếng Việt lấy từ status_labels.dart: `StatusPill(kind: 'batch', value: b.status)`.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.kind, required this.value});
  final String kind;
  final String? value;

  @override
  Widget build(BuildContext context) {
    if (value == null || value!.isEmpty) return const SizedBox.shrink();
    final color = toneColor(statusTone(kind, value));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              statusLabel(kind, value),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class Fact {
  const Fact(this.label, this.value, {this.color});
  final String label;
  final String value;
  final Color? color;
}

/// Lưới ô số liệu nhỏ, hai cột. Dùng tối đa bốn ô ở đầu một màn.
class FactGrid extends StatelessWidget {
  const FactGrid({super.key, required this.facts});
  final List<Fact> facts;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final width = (box.maxWidth - 10) / 2;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final f in facts)
              SizedBox(
                width: width,
                child: AppCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        f.label,
                        style: Theme.of(context).textTheme.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        f.value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          color: f.color ?? AppColors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Danh sách nhãn bên trái, giá trị bên phải. Dòng có value rỗng tự ẩn.
class KeyValueList extends StatelessWidget {
  const KeyValueList({super.key, required this.rows});
  final List<(String, String?)> rows;

  @override
  Widget build(BuildContext context) {
    final shown = [
      for (final r in rows)
        if (r.$2 != null && r.$2!.isNotEmpty) r,
    ];
    return Column(
      children: [
        for (final r in shown)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 4,
                  child: Text(
                    r.$1,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 6,
                  child: Text(
                    r.$2!,
                    textAlign: TextAlign.end,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Phần gấp lại "Xem thêm" cho chi tiết phụ, lịch sử, ô tuỳ chọn. Mặc định đóng.
class MoreSection extends StatelessWidget {
  const MoreSection({
    super.key,
    this.label = 'Xem thêm',
    required this.children,
    this.initiallyOpen = false,
  });
  final String label;
  final List<Widget> children;
  final bool initiallyOpen;

  @override
  Widget build(BuildContext context) {
    // Bọc Material trong suốt để dùng được cả bên trong Container có màu (ExpansionTile cần một Material cha).
    return Material(
      type: MaterialType.transparency,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: initiallyOpen,
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: 8),
          expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
          iconColor: AppColors.inkMuted,
          collapsedIconColor: AppColors.inkMuted,
          title: Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.inkMuted,
            ),
          ),
          children: children,
        ),
      ),
    );
  }
}

/// Thông báo ngắn ở đáy màn hình sau một thao tác.
void showAppToast(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: error ? AppColors.danger : AppColors.ink,
      ),
    );
}

/// Hộp xác nhận từ đáy màn hình cho thao tác có hậu quả (duyệt, từ chối, huỷ, nghiệm thu, biểu quyết).
/// Trả null khi người dùng đóng; trả chuỗi (có thể rỗng) khi xác nhận. [reasonLabel] khác null thì hiện ô lý do;
/// [reasonRequired] bắt buộc nhập lý do mới bấm được.
Future<String?> showConfirmSheet(
  BuildContext context, {
  required String title,
  String? message,
  String confirmLabel = 'Xác nhận',
  bool danger = false,
  String? reasonLabel,
  bool reasonRequired = false,
}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (context) => _ConfirmSheet(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      danger: danger,
      reasonLabel: reasonLabel,
      reasonRequired: reasonRequired,
    ),
  );
}

class _ConfirmSheet extends StatefulWidget {
  const _ConfirmSheet({
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.danger,
    required this.reasonLabel,
    required this.reasonRequired,
  });
  final String title;
  final String? message;
  final String confirmLabel;
  final bool danger;
  final String? reasonLabel;
  final bool reasonRequired;

  @override
  State<_ConfirmSheet> createState() => _ConfirmSheetState();
}

class _ConfirmSheetState extends State<_ConfirmSheet> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final blocked =
        widget.reasonLabel != null &&
        widget.reasonRequired &&
        _reason.text.trim().isEmpty;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
            if (widget.message != null) ...[
              const SizedBox(height: 8),
              Text(
                widget.message!,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
            if (widget.reasonLabel != null) ...[
              const SizedBox(height: 14),
              TextField(
                controller: _reason,
                minLines: 2,
                maxLines: 4,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: widget.reasonLabel,
                  fillColor: AppColors.background,
                ),
              ),
            ],
            const SizedBox(height: 18),
            FilledButton(
              style: widget.danger
                  ? FilledButton.styleFrom(backgroundColor: AppColors.danger)
                  : null,
              onPressed: blocked
                  ? null
                  : () => Navigator.of(context).pop(_reason.text.trim()),
              child: Text(widget.confirmLabel),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Đóng'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ô chụp ảnh bằng camera trong ứng dụng (không chọn từ thư viện). Ảnh kèm giờ chụp và vị trí.
/// Dùng cho ảnh hộp khi thả cua, ảnh cua chết, ảnh kiểm phẩm, ảnh khiếu nại, ảnh thăm trại.
class PhotoField extends ConsumerStatefulWidget {
  const PhotoField({
    super.key,
    required this.photo,
    required this.onChanged,
    this.label = 'Chụp ảnh',
  });
  final CapturedPhoto? photo;
  final ValueChanged<CapturedPhoto?> onChanged;
  final String label;

  @override
  ConsumerState<PhotoField> createState() => _PhotoFieldState();
}

class _PhotoFieldState extends ConsumerState<PhotoField> {
  bool _busy = false;
  String? _error;
  bool _needsSettings = false;

  Future<void> _capture() async {
    setState(() {
      _busy = true;
      _error = null;
      _needsSettings = false;
    });
    try {
      final photo = await ref.read(photoCameraProvider).capture();
      if (mounted && photo != null) widget.onChanged(photo);
    } on PhotoCaptureException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _needsSettings = true;
        });
      }
    } on FormatException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Không chụp được ảnh. Hãy thử lại.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final photo = widget.photo;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: AppColors.surfaceMuted,
          borderRadius: BorderRadius.circular(AppRadius.chip),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: _busy ? null : _capture,
            child: SizedBox(
              height: photo == null ? 120 : 200,
              child: photo == null
                  ? Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _busy
                            ? const SizedBox(
                                width: 26,
                                height: 26,
                                child: CircularProgressIndicator(
                                  strokeWidth: 3,
                                ),
                              )
                            : const Icon(
                                Icons.photo_camera_rounded,
                                size: 30,
                                color: AppColors.inkMuted,
                              ),
                        const SizedBox(height: 8),
                        Text(
                          widget.label,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ],
                    )
                  : Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.memory(photo.bytes, fit: BoxFit.cover),
                        Positioned(
                          left: 8,
                          right: 8,
                          bottom: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.6),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text(
                              'Bấm để chụp lại',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 6),
          Text(
            _error!,
            style: const TextStyle(color: AppColors.danger, fontSize: 13),
          ),
          if (_needsSettings)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => ref.read(photoCameraProvider).openSettings(),
                child: const Text('Mở cài đặt'),
              ),
            ),
        ],
      ],
    );
  }
}

/// Ảnh lấy từ endpoint cần đăng nhập (ảnh hộp, ảnh lượt đo, ảnh khiếu nại). [path] là đường dẫn API.
final authImageProvider = FutureProvider.autoDispose.family<Uint8List, String>((
  ref,
  path,
) async {
  final response = await ref
      .watch(dioProvider)
      .get<List<int>>(path, options: Options(responseType: ResponseType.bytes));
  return Uint8List.fromList(response.data ?? const []);
});

class AuthImage extends ConsumerWidget {
  const AuthImage(this.path, {super.key, this.height = 160, this.radius = 16});
  final String path;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final image = ref.watch(authImageProvider(path));
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Container(
        height: height,
        color: AppColors.surfaceMuted,
        alignment: Alignment.center,
        child: image.when(
          data: (bytes) => bytes.isEmpty
              ? const Icon(
                  Icons.image_not_supported_outlined,
                  color: AppColors.inkMuted,
                )
              : Image.memory(
                  bytes,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: height,
                ),
          loading: () => const SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
          error: (_, _) => const Icon(
            Icons.image_not_supported_outlined,
            color: AppColors.inkMuted,
          ),
        ),
      ),
    );
  }
}

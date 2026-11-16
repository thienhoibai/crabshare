import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_ui.dart';

/// Khối giao diện riêng của khu kiểm phẩm, cùng phong cách với app_ui.dart: ô chọn lớn, ô số, khung hộp thao tác.

/// Giữ dữ liệu đang hiện khi một lần tự tải lại bị lỗi mạng, để thẻ đang làm không biến mất.
AsyncValue<T> keepData<T>(AsyncValue<T> value) => value.hasValue ? AsyncData<T>(value.requireValue) : value;

/// Dãy ô chọn một giá trị, mỗi ô cao 48 px. [expand]: các ô chia đều chiều ngang.
class QcChoice<T> extends StatelessWidget {
  const QcChoice({super.key, required this.options, required this.value, required this.onChanged, this.expand = false});
  final List<(T, String)> options;
  final T? value;
  final ValueChanged<T> onChanged;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    Widget chip((T, String) o) {
      final selected = o.$1 == value;
      return Semantics(
        button: true,
        selected: selected,
        child: Material(
          color: selected ? AppColors.ink : AppColors.surfaceMuted,
          borderRadius: BorderRadius.circular(AppRadius.chip),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => onChanged(o.$1),
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Center(
                widthFactor: 1,
                child: Text(
                  o.$2,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.w600, color: selected ? Colors.white : AppColors.ink),
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (expand) {
      return Row(
        children: [
          for (var i = 0; i < options.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(child: chip(options[i])),
          ],
        ],
      );
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [for (final o in options) chip(o)],
    );
  }
}

/// Ô điều kiện kiểm: mặc định đạt (xanh), bấm một lần thành không đạt (đỏ).
class CheckToggle extends StatelessWidget {
  const CheckToggle({super.key, required this.ok, required this.okLabel, required this.badLabel, required this.onTap});
  final bool ok;
  final String okLabel;
  final String badLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = ok ? AppColors.success : AppColors.danger;
    return Semantics(
      button: true,
      checked: ok,
      child: Material(
        color: color.withValues(alpha: ok ? 0.10 : 0.16),
        borderRadius: BorderRadius.circular(AppRadius.chip),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: 54,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded, color: color, size: 22),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    ok ? okLabel : badLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w700, color: ok ? AppColors.ink : AppColors.danger),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Ô nhập số với bàn phím số; nhận dấu phẩy hoặc dấu chấm thập phân.
class QcNumberField extends StatelessWidget {
  const QcNumberField({
    super.key,
    required this.controller,
    required this.label,
    this.unit,
    this.decimal = true,
    this.autofocus = false,
    this.large = false,
    this.focusNode,
    this.onChanged,
    this.onSubmitted,
    this.helper,
    this.fillColor = AppColors.background,
  });
  final TextEditingController controller;
  final String label;
  final String? unit;

  /// Dòng nhỏ dưới ô nhập, ví dụ số để đối chiếu.
  final String? helper;
  final bool decimal;
  final bool autofocus;
  final bool large;
  final FocusNode? focusNode;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onSubmitted;
  final Color fillColor;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    focusNode: focusNode,
    autofocus: autofocus,
    keyboardType: TextInputType.numberWithOptions(decimal: decimal),
    textInputAction: TextInputAction.done,
    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(decimal ? r'[0-9.,]' : r'[0-9]')), LengthLimitingTextInputFormatter(8)],
    onChanged: onChanged,
    onSubmitted: onSubmitted == null ? null : (_) => onSubmitted!(),
    style: large ? const TextStyle(fontSize: 28, fontWeight: FontWeight.w700) : null,
    decoration: InputDecoration(labelText: label, suffixText: unit, helperText: helper, fillColor: fillColor),
  );
}

/// Dòng ghi chú ngắn trong thẻ (ai được làm, lý do giữ lại).
class QcNote extends StatelessWidget {
  const QcNote(this.text, {super.key, this.color = AppColors.info});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(color: color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)),
    child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13.5)),
  );
}

/// Nhãn nhỏ phía trên một nhóm ô chọn.
class QcLabel extends StatelessWidget {
  const QcLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 14, bottom: 6),
    child: Text(text, style: Theme.of(context).textTheme.bodySmall),
  );
}

/// Một hàng việc: ô icon, tên, dòng phụ, phần dưới (tiến độ) và phần cuối (chip).
class QcRowCard extends StatelessWidget {
  const QcRowCard({super.key, required this.icon, required this.title, this.subtitle, this.bottom, this.trailing, this.onTap});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? bottom;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          IconTile(icon: icon),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                if (subtitle != null && subtitle!.isNotEmpty)
                  Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
                if (bottom != null) ...[const SizedBox(height: 8), bottom!],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
          const Icon(Icons.chevron_right_rounded, color: AppColors.inkMuted),
        ],
      ),
    ),
  );
}

/// Mở một hộp thao tác từ đáy màn hình. Hộp chỉ đóng bằng nút, để không mất ảnh và chữ đang nhập.
Future<T?> showQcSheet<T>(BuildContext context, Widget sheet) => showModalBottomSheet<T>(
  context: context,
  isScrollControlled: true,
  enableDrag: false,
  backgroundColor: AppColors.surface,
  shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
  builder: (_) => sheet,
);

/// Khung của hộp thao tác: tiêu đề, nội dung, lỗi của máy chủ, một nút chính và nút đóng.
/// [onConfirm] null thì nút chính bị khoá (còn thiếu ô bắt buộc).
class QcSheet extends StatelessWidget {
  const QcSheet({
    super.key,
    required this.title,
    required this.children,
    required this.confirmLabel,
    required this.onConfirm,
    this.message,
    this.busy = false,
    this.error,
    this.danger = false,
  });
  final String title;
  final String? message;
  final List<Widget> children;
  final String confirmLabel;
  final VoidCallback? onConfirm;
  final bool busy;
  final String? error;
  final bool danger;

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.88),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleLarge),
                if (message != null) ...[const SizedBox(height: 6), Text(message!, style: Theme.of(context).textTheme.bodyMedium)],
                ...children,
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  style: danger ? FilledButton.styleFrom(backgroundColor: AppColors.danger) : null,
                  onPressed: busy ? null : onConfirm,
                  child: Text(busy ? 'Đang gửi…' : confirmLabel),
                ),
                const SizedBox(height: 8),
                TextButton(onPressed: busy ? null : () => Navigator.of(context).pop(), child: const Text('Đóng')),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

/// Ô nhập chữ trong hộp thao tác (nền be để nổi trên nền trắng).
class QcTextField extends StatelessWidget {
  const QcTextField({super.key, required this.controller, required this.label, this.maxLength = 300, this.lines = 2, this.onChanged});
  final TextEditingController controller;
  final String label;
  final int maxLength;
  final int lines;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    minLines: lines,
    maxLines: lines + 2,
    inputFormatters: [LengthLimitingTextInputFormatter(maxLength)],
    textCapitalization: TextCapitalization.sentences,
    onChanged: onChanged,
    decoration: InputDecoration(labelText: label, fillColor: AppColors.background, alignLabelWithHint: true),
  );
}

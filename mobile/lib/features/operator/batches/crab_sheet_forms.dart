import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/capture/captured_photo.dart';
import '../../../shared/widgets/app_parts.dart';
import '../data/holding_models.dart';
import '../data/holding_repository.dart';

/// Bước báo cua chết trong phiếu con cua: bắt buộc có ảnh hộp chụp bằng camera trong ứng dụng.
class CrabDeadForm extends StatefulWidget {
  const CrabDeadForm({super.key, required this.slotCode, required this.busy, required this.error, required this.onBack, required this.onSubmit});
  final String slotCode;
  final bool busy;
  final String? error;
  final VoidCallback onBack;
  final void Function(CapturedPhoto photo, String note) onSubmit;

  @override
  State<CrabDeadForm> createState() => _CrabDeadFormState();
}

class _CrabDeadFormState extends State<CrabDeadForm> {
  final _note = TextEditingController();
  CapturedPhoto? _photo;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final photo = _photo;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Báo cua chết · hộp ${widget.slotCode}', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text('Ghi xong không sửa lại được.', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 14),
        IgnorePointer(
          ignoring: widget.busy,
          child: PhotoField(photo: photo, label: 'Chụp hộp ${widget.slotCode}', onChanged: (value) => setState(() => _photo = value)),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _note,
          enabled: !widget.busy,
          maxLength: 300,
          decoration: const InputDecoration(labelText: 'Ghi chú (không bắt buộc)', fillColor: AppColors.background, counterText: ''),
        ),
        if (widget.error != null) ...[const SizedBox(height: 10), Text(widget.error!, style: const TextStyle(color: AppColors.danger))],
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
          onPressed: widget.busy || photo == null ? null : () => widget.onSubmit(photo, _note.text.trim()),
          child: Text(widget.busy ? 'Đang gửi…' : 'Ghi cua chết'),
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: widget.busy ? null : widget.onBack, child: const Text('Quay lại')),
      ],
    );
  }
}

/// Bước chuyển hộp trong phiếu con cua: chọn một hộp trống của Lô hoặc của trại. Con cua giữ nguyên, chỉ đổi hộp.
class CrabMoveForm extends ConsumerStatefulWidget {
  const CrabMoveForm({
    super.key,
    required this.slotCode,
    required this.emptyBoxes,
    required this.busy,
    required this.error,
    required this.onBack,
    required this.onSubmit,
  });
  final String slotCode;

  /// Hộp trống của Lô, đứng trước hộp trống của trại trong danh sách chọn.
  final List<BoxState> emptyBoxes;
  final bool busy;
  final String? error;
  final VoidCallback onBack;
  final void Function(String slotCode, String reason) onSubmit;

  @override
  ConsumerState<CrabMoveForm> createState() => _CrabMoveFormState();
}

class _CrabMoveFormState extends ConsumerState<CrabMoveForm> {
  static const _maxChoices = 15;
  final _search = TextEditingController();
  final _reason = TextEditingController();
  Timer? _debounce;
  String _query = '';
  String? _target;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _reason.dispose();
    super.dispose();
  }

  // Gõ xong mới hỏi máy chủ, tránh gọi theo từng phím.
  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = text.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final farm = ref.watch(freeBoxesProvider(_query));
    final ofBatch = [
      for (final b in widget.emptyBoxes)
        if (b.slotCode != widget.slotCode && !b.inMaintenance && b.slotCode.contains(_query)) b.slotCode,
    ];
    final choices = <String>{
      ...ofBatch,
      for (final b in [...?farm.value]) b.slotCode,
    }.take(_maxChoices).toList();
    final target = _target;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Chuyển hộp · từ hộp ${widget.slotCode}', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 14),
        TextField(
          controller: _search,
          enabled: !widget.busy,
          keyboardType: TextInputType.number,
          onChanged: _onSearch,
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Tìm số hộp trống', fillColor: AppColors.background),
        ),
        const SizedBox(height: 12),
        if (choices.isEmpty)
          Text(farm.isLoading ? 'Đang tìm hộp trống…' : 'Không có hộp trống khớp.', style: Theme.of(context).textTheme.bodySmall)
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final code in choices)
                ChoiceChip(
                  label: Text(code),
                  selected: target == code,
                  showCheckmark: false,
                  onSelected: widget.busy ? null : (_) => setState(() => _target = code),
                ),
            ],
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _reason,
          enabled: !widget.busy,
          maxLength: 300,
          decoration: const InputDecoration(labelText: 'Lý do (không bắt buộc)', fillColor: AppColors.background, counterText: ''),
        ),
        if (widget.error != null) ...[const SizedBox(height: 10), Text(widget.error!, style: const TextStyle(color: AppColors.danger))],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: widget.busy || target == null ? null : () => widget.onSubmit(target, _reason.text.trim()),
          child: Text(
            widget.busy
                ? 'Đang gửi…'
                : target == null
                ? 'Chọn hộp mới'
                : 'Chuyển sang hộp $target',
          ),
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: widget.busy ? null : widget.onBack, child: const Text('Quay lại')),
      ],
    );
  }
}

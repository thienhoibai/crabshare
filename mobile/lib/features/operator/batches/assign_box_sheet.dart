import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/capture/captured_photo.dart';
import '../../../shared/widgets/app_parts.dart';
import '../data/holding_models.dart';
import '../data/holding_repository.dart';
import '../logs/log_numbers.dart';

/// Xếp một con cua vừa nhận vào hộp trống kèm ảnh hộp; [replacesCrabCode] khác null là thả bù thay con đã chết ở hộp này.
/// Trả về câu báo thành công, hoặc null khi người dùng đóng.
Future<String?> showAssignBoxSheet(
  BuildContext context, {
  required String batchCode,
  required String slotCode,
  required List<CrabUnit> waiting,
  String? replacesCrabCode,
}) => showModalBottomSheet<String>(
  context: context,
  isScrollControlled: true,
  backgroundColor: AppColors.surface,
  shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
  builder: (context) => _AssignBoxSheet(batchCode: batchCode, slotCode: slotCode, waiting: waiting, replacesCrabCode: replacesCrabCode),
);

class _AssignBoxSheet extends ConsumerStatefulWidget {
  const _AssignBoxSheet({required this.batchCode, required this.slotCode, required this.waiting, this.replacesCrabCode});
  final String batchCode;
  final String slotCode;
  final List<CrabUnit> waiting;
  final String? replacesCrabCode;

  @override
  ConsumerState<_AssignBoxSheet> createState() => _AssignBoxSheetState();
}

class _AssignBoxSheetState extends ConsumerState<_AssignBoxSheet> {
  late String _crabCode = widget.waiting.first.crabCode;
  CapturedPhoto? _photo;
  bool _busy = false;
  String? _error;

  bool get _restock => widget.replacesCrabCode != null;

  Future<void> _submit() async {
    final photo = _photo;
    if (_busy || photo == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(boxActionsProvider)
          .assign(
            batchCode: widget.batchCode,
            crabCode: _crabCode,
            slotCode: widget.slotCode,
            photo: photo,
            replacesCrabCode: widget.replacesCrabCode,
          );
      if (mounted) Navigator.of(context).pop(_restock ? 'Đã thả bù vào hộp ${widget.slotCode}.' : 'Đã xếp cua vào hộp ${widget.slotCode}.');
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = apiErrorMessage(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_busy,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(_restock ? 'Thả bù hộp ${widget.slotCode}' : 'Xếp cua vào hộp ${widget.slotCode}', style: Theme.of(context).textTheme.titleLarge),
              if (_restock) ...[
                const SizedBox(height: 4),
                Text('Thay con ${widget.replacesCrabCode} đã chết.', style: Theme.of(context).textTheme.bodySmall),
              ],
              // Nhãn của ô chọn nổi lên mép trên của ô nên cần chừa chỗ phía trên.
              const SizedBox(height: 22),
              DropdownButtonFormField<String>(
                key: const ValueKey('assign-crab'),
                initialValue: _crabCode,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Con cua', fillColor: AppColors.background),
                items: [
                  for (final c in widget.waiting)
                    DropdownMenuItem(value: c.crabCode, child: Text('${c.crabCode} · ${formatLogNumber(c.receivedWeightG, digits: 0)} g')),
                ],
                onChanged: _busy ? null : (value) => setState(() => _crabCode = value ?? _crabCode),
              ),
              const SizedBox(height: 12),
              IgnorePointer(
                ignoring: _busy,
                child: PhotoField(photo: _photo, label: 'Chụp hộp đã có cua', onChanged: (photo) => setState(() => _photo = photo)),
              ),
              if (_error != null) ...[const SizedBox(height: 10), Text(_error!, style: const TextStyle(color: AppColors.danger))],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy || _photo == null ? null : _submit,
                child: Text(
                  _busy
                      ? 'Đang gửi…'
                      : _restock
                      ? 'Thả bù'
                      : 'Xếp vào hộp',
                ),
              ),
              const SizedBox(height: 8),
              TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Đóng')),
            ],
          ),
        ),
      ),
    );
  }
}

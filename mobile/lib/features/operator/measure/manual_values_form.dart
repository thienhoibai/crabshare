import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import 'measure_models.dart';
import 'measure_repository.dart';
import 'work_common.dart';

/// Nhập số đo tay: lượt đo tay cần khối lượng cân tay trước; lượt đo bằng trạm chỉ bổ sung số thước kẹp.
class ManualValuesForm extends ConsumerStatefulWidget {
  const ManualValuesForm({super.key, required this.session, required this.roe, required this.primary, required this.onSaved});

  final MeasureSession session;

  /// Cua gạch cần thêm dải mép khi soi đỏ.
  final bool roe;

  /// Nút chính của màn (lượt đo tay đang chờ số đo) hay nút phụ trong phần gấp lại.
  final bool primary;
  final ValueChanged<SessionDetail> onSaved;

  @override
  ConsumerState<ManualValuesForm> createState() => _ManualValuesFormState();
}

class _ManualValuesFormState extends ConsumerState<ManualValuesForm> {
  final _weight = TextEditingController();
  final _length = TextEditingController();
  final _band = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _weight.dispose();
    _length.dispose();
    _band.dispose();
    super.dispose();
  }

  bool get _manual => widget.session.isManual;
  bool get _needWeight => _manual && widget.session.status == 'Open';

  ManualValues get _values => ManualValues(
    weightG: _manual ? parseDecimal(_weight.text) : null,
    carapaceLengthCm: parseDecimal(_length.text),
    edgeBandMm: widget.roe ? parseDecimal(_band.text) : null,
  );

  bool get _valid => !_values.isEmpty && (!_needWeight || _values.weightG != null);

  Future<void> _save() async {
    if (_busy || !_valid) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final detail = await ref.read(measureRepositoryProvider).recordValues(widget.session.sessionNo, _values);
      if (!mounted) return;
      _weight.clear();
      _length.clear();
      _band.clear();
      setState(() => _busy = false);
      widget.onSaved(detail);
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = workError(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    void changed(String _) => setState(() {});
    final label = Text(_busy ? 'Đang ghi…' : 'Ghi số đo');
    final onPressed = _busy || !_valid ? null : _save;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_manual) ...[
          WorkNumberField(controller: _weight, label: 'Khối lượng cân tay', unit: 'g', enabled: !_busy, onChanged: changed),
          const SizedBox(height: 10),
        ],
        WorkNumberField(controller: _length, label: 'Chiều dài mai', unit: 'cm', enabled: !_busy, onChanged: changed),
        if (widget.roe) ...[
          const SizedBox(height: 10),
          WorkNumberField(controller: _band, label: 'Dải mép khi soi đỏ', unit: 'mm', enabled: !_busy, onChanged: changed),
        ],
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: AppColors.danger)),
        ],
        const SizedBox(height: 12),
        widget.primary
            ? FilledButton(onPressed: onPressed, child: label)
            : OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                onPressed: onPressed,
                child: label,
              ),
      ],
    );
  }
}

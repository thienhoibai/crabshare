import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/incoming_repository.dart';
import '../data/qc_models.dart';
import '../widgets/qc_parts.dart';

/// Năm điều kiện kiểm của một con cua, mặc định đạt. ok: chữ khi đạt, bad: chữ khi không đạt.
const _checkDefs = [
  (key: 'speciesOk', ok: 'Đúng loài', bad: 'Sai loài'),
  (key: 'alive', ok: 'Còn sống', bad: 'Đã chết'),
  (key: 'healthy', ok: 'Khoẻ', bad: 'Yếu'),
  (key: 'twoClaws', ok: 'Đủ hai càng', bad: 'Thiếu càng'),
  (key: 'foodSafe', ok: 'An toàn thực phẩm', bad: 'Mất an toàn thực phẩm'),
];

Map<String, bool> _allPass() => {for (final c in _checkDefs) c.key: true};

/// Ô kiểm nhanh từng con: nhập khối lượng rồi bấm Ghi. Giới tính và độ trưởng thành lấy mặc định theo loại cua của Lô
/// và giữ cho con sau; bấm vào điều kiện nào thì điều kiện đó thành không đạt. Con bị loại hỏi lại một lần.
class CrabForm extends ConsumerStatefulWidget {
  const CrabForm({
    super.key,
    required this.receiptNo,
    required this.index,
    required this.left,
    required this.crabType,
    this.batchCode,
    this.lotCode,
  });
  final String receiptNo;

  /// Số thứ tự của con sắp kiểm.
  final int index;

  /// Số con còn phải kiểm; bằng 0 thì chỉ còn dòng kết quả của con vừa ghi.
  final int left;

  /// Loại cua của Lô, quyết định giới tính và độ trưởng thành mặc định.
  final String crabType;
  final String? batchCode;
  final String? lotCode;

  @override
  ConsumerState<CrabForm> createState() => _CrabFormState();
}

class _CrabFormState extends ConsumerState<CrabForm> {
  final _weight = TextEditingController();
  final _species = TextEditingController(text: 'Scylla paramamosain');
  final _note = TextEditingController();
  final _focus = FocusNode();
  var _checks = _allPass();
  String? _sex;
  String? _maturity;
  bool _busy = false;
  String? _error;
  InspectionResult? _last;

  @override
  void dispose() {
    _weight.dispose();
    _species.dispose();
    _note.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final usual = expectedFor(widget.crabType);
    final sex = _sex ?? usual.sex;
    final maturity = _maturity ?? usual.maturity;
    final weight = parseDecimal(_weight.text);
    if (_busy || weight == null || weight < 1 || weight > 5000 || _species.text.trim().isEmpty) return;
    final fails = [
      for (final c in _checkDefs)
        if (!_checks[c.key]!) c.bad.toLowerCase(),
      if (usual.strict && (sex != usual.sex || maturity != usual.maturity)) 'không đúng loại cua của Lô',
    ];
    // Con đạt ghi ngay để kiểm nhanh; con bị loại hỏi lại một lần vì ghi rồi không sửa được.
    if (fails.isNotEmpty) {
      final ok = await showConfirmSheet(
        context,
        title: 'Loại con cua này?',
        message: 'Không đạt: ${fails.join(', ')}. Ghi rồi không sửa được.',
        confirmLabel: 'Ghi: loại',
        danger: true,
      );
      if (ok == null || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(receiptProvider(widget.receiptNo).notifier)
          .inspect(
            InspectionInput(
              species: _species.text.trim(),
              sex: sex,
              maturity: maturity,
              speciesOk: _checks['speciesOk']!,
              alive: _checks['alive']!,
              healthy: _checks['healthy']!,
              twoClaws: _checks['twoClaws']!,
              foodSafe: _checks['foodSafe']!,
              weightG: weight,
              note: _note.text.trim().isEmpty ? null : _note.text.trim(),
            ),
          );
      if (!mounted) return;
      if (result.accepted && widget.batchCode != null && widget.lotCode != null) {
        ref.invalidate(acceptedCrabsProvider((widget.batchCode!, widget.lotCode!)));
      }
      // Giữ loài, giới tính, độ trưởng thành cho con kế tiếp; xoá khối lượng và ghi chú, trả các ô về "đạt".
      setState(() {
        _last = result;
        _weight.clear();
        _note.clear();
        _checks = _allPass();
        _busy = false;
      });
      _focus.requestFocus();
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = qcErrorMessage(error);
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final usual = expectedFor(widget.crabType);
    final sex = _sex ?? usual.sex;
    final maturity = _maturity ?? usual.maturity;
    final weight = parseDecimal(_weight.text);
    final ready = weight != null && weight >= 1 && weight <= 5000 && _species.text.trim().isNotEmpty;
    final rejects = _checks.containsValue(false) || (usual.strict && (sex != usual.sex || maturity != usual.maturity));
    final last = _last;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (last != null) ...[
          QcNote(
            last.accepted
                ? 'Đạt · ${formatNum(last.weightG, 1)} g · ${last.crabCode ?? ''}'
                : 'Loại · ${formatNum(last.weightG, 1)} g · ${last.rejectReason ?? ''}',
            color: last.accepted ? AppColors.success : AppColors.danger,
          ),
          const SizedBox(height: 10),
        ],
        if (widget.left > 0)
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Con thứ ${widget.index}', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 10),
                // Nút Ghi nằm ngay cạnh ô khối lượng để luôn ở phía trên bàn phím số.
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: QcNumberField(
                          controller: _weight,
                          focusNode: _focus,
                          label: 'Khối lượng',
                          unit: 'g',
                          large: true,
                          autofocus: true,
                          onChanged: (_) => setState(() => _error = null),
                          onSubmitted: _save,
                        ),
                      ),
                      const SizedBox(width: 10),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(124, 56),
                          backgroundColor: rejects ? AppColors.danger : null,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.chip)),
                        ),
                        onPressed: ready && !_busy ? _save : null,
                        child: Text(_busy ? 'Đang ghi…' : (rejects ? 'Ghi · loại' : 'Ghi · đạt')),
                      ),
                    ],
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                  ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, box) {
                    final half = (box.maxWidth - 8) / 2;
                    return Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final (i, c) in _checkDefs.indexed)
                          SizedBox(
                            // Ô lẻ cuối cùng chiếm cả hàng.
                            width: i == _checkDefs.length - 1 && _checkDefs.length.isOdd ? box.maxWidth : half,
                            child: CheckToggle(
                              ok: _checks[c.key]!,
                              okLabel: c.ok,
                              badLabel: c.bad,
                              onTap: () => setState(() => _checks = {..._checks, c.key: !_checks[c.key]!}),
                            ),
                          ),
                      ],
                    );
                  },
                ),
                const QcLabel('Giới tính'),
                QcChoice<String>(options: statusOptions('sex'), value: sex, expand: true, onChanged: (v) => setState(() => _sex = v)),
                MoreSection(
                  label: 'Tuỳ chọn thêm',
                  children: [
                    Text('Độ trưởng thành', style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 6),
                    QcChoice<String>(options: statusOptions('maturity'), value: maturity, onChanged: (v) => setState(() => _maturity = v)),
                    const SizedBox(height: 12),
                    QcTextField(controller: _species, label: 'Loài', maxLength: 60, lines: 1, onChanged: (_) => setState(() {})),
                    const SizedBox(height: 10),
                    QcTextField(controller: _note, label: 'Ghi chú', lines: 1),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/capture/captured_photo.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../data/grading_models.dart';
import '../data/grading_repository.dart';
import '../data/qc_models.dart';
import '../widgets/qc_parts.dart';

/// Hộp thao tác trên một quyết định phân hạng: duyệt, giữ lại, nhập thước kẹp, loại bỏ (kèm ảnh), đổi size hoặc hạng (kèm ảnh).
/// Mỗi hộp chỉ hiện ô bắt buộc; lỗi quy tắc của máy chủ hiện ngay trong hộp. Xong thì hộp đóng và trả quyết định mới.

/// Phần gửi dùng chung: khoá nút khi đang gửi, ghép kết quả vào hàng chờ, báo ngắn rồi đóng hộp.
mixin _DecisionSend<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  bool busy = false;
  String? error;

  Future<void> send(GradeDecision d, Future<GradeDecision?> Function(GradingRepository repo) action, String Function(GradeDecision? updated) done) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final updated = await action(ref.read(gradingRepositoryProvider));
      if (!mounted) return;
      if (updated != null) {
        applyDecision(ref, d.batchCode, updated);
      } else {
        ref.invalidate(gradeDecisionsProvider(d.batchCode));
      }
      // Phiên bản đề xuất mới (sau khi nhập thước kẹp) có số đo mới.
      if (updated?.decisionNo != d.decisionNo) ref.invalidate(sessionMeasurementsProvider(d.sessionNo));
      showAppToast(context, done(updated));
      Navigator.of(context).pop(updated);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = qcErrorMessage(e);
          busy = false;
        });
      }
    }
  }
}

String? _clean(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

/// Duyệt: hạng cuối chỉ bằng hoặc thấp hơn đề xuất; hạ hạng phải có lý do. Size theo cân, không đổi ở bước này.
class ApproveSheet extends ConsumerStatefulWidget {
  const ApproveSheet({super.key, required this.decision});
  final GradeDecision decision;
  @override
  ConsumerState<ApproveSheet> createState() => _ApproveSheetState();
}

class _ApproveSheetState extends ConsumerState<ApproveSheet> with _DecisionSend {
  late String? _grade = widget.decision.proposedGrade;
  final _sensory = TextEditingController();
  final _reason = TextEditingController();

  @override
  void dispose() {
    _sensory.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.decision;
    final lowered = d.proposedGrade != null && _grade != null && _grade != d.proposedGrade;
    final ready = _grade != null && (!lowered || _reason.text.trim().isNotEmpty);
    return QcSheet(
      title: 'Duyệt ${d.crabCode}',
      message: d.proposedSize == null ? null : statusLabel('sizeCode', d.proposedSize),
      confirmLabel: 'Duyệt hạng',
      busy: busy,
      error: error,
      onConfirm: !ready
          ? null
          : () => send(
              d,
              (repo) => repo.approve(d.decisionNo, finalGrade: _grade, sensoryNote: _clean(_sensory), reason: _clean(_reason)),
              (res) => 'Đã duyệt ${d.crabCode}: ${specName(null, res?.finalSize, res?.finalGrade)}.',
            ),
      children: [
        const QcLabel('Hạng cuối'),
        QcChoice<String>(
          options: [for (final g in gradesUpTo(d.proposedGrade)) (g, '${statusLabel('gradeCode', g)}${g == d.proposedGrade ? ' · đề xuất' : ''}')],
          value: _grade,
          onChanged: (g) => setState(() => _grade = g),
        ),
        if (lowered) ...[
          const SizedBox(height: 12),
          QcTextField(controller: _reason, label: 'Lý do hạ hạng', onChanged: (_) => setState(() {})),
        ],
        if (isSubstandardSpec(d.proposedSize, _grade)) ...[
          const SizedBox(height: 12),
          const QcNote('Cua dưới chuẩn, không vào quy cách đặt trước.', color: AppColors.accentText),
        ],
        const SizedBox(height: 12),
        QcTextField(controller: _sensory, label: 'Ghi chú cảm quan (nếu có)'),
      ],
    );
  }
}

/// Giữ lại để kiểm thêm: ghi lý do; hệ thống phân một người kiểm thứ hai quyết định con này.
class HoldSheet extends ConsumerStatefulWidget {
  const HoldSheet({super.key, required this.decision});
  final GradeDecision decision;
  @override
  ConsumerState<HoldSheet> createState() => _HoldSheetState();
}

class _HoldSheetState extends ConsumerState<HoldSheet> with _DecisionSend {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.decision;
    return QcSheet(
      title: 'Giữ lại ${d.crabCode}',
      message: 'Người kiểm thứ hai sẽ quyết định con này.',
      confirmLabel: 'Giữ lại',
      busy: busy,
      error: error,
      onConfirm: _reason.text.trim().length < 3
          ? null
          : () => send(d, (repo) => repo.hold(d.decisionNo, _reason.text.trim()), (_) => 'Đã giữ lại, chờ người kiểm thứ hai.'),
      children: [
        const SizedBox(height: 14),
        QcTextField(controller: _reason, label: 'Lý do', onChanged: (_) => setState(() {})),
      ],
    );
  }
}

/// Nhập số thước kẹp khi ảnh lỗi hoặc AI chưa chắc; máy chủ tính lại đề xuất và trả phiên bản mới.
class CaliperSheet extends ConsumerStatefulWidget {
  const CaliperSheet({super.key, required this.decision});
  final GradeDecision decision;
  @override
  ConsumerState<CaliperSheet> createState() => _CaliperSheetState();
}

class _CaliperSheetState extends ConsumerState<CaliperSheet> with _DecisionSend {
  final _length = TextEditingController();
  final _width = TextEditingController();
  final _band = TextEditingController();

  @override
  void dispose() {
    _length.dispose();
    _width.dispose();
    _band.dispose();
    super.dispose();
  }

  static bool _ok(String text, double? value, double min, double max) =>
      text.trim().isEmpty || (value != null && value >= min && value <= max);

  @override
  Widget build(BuildContext context) {
    final d = widget.decision;
    final length = parseDecimal(_length.text);
    final width = parseDecimal(_width.text);
    final band = parseDecimal(_band.text);
    final ready =
        (length != null || width != null || band != null) &&
        _ok(_length.text, length, 1, 30) &&
        _ok(_width.text, width, 1, 40) &&
        _ok(_band.text, band, 0, 50);
    return QcSheet(
      title: 'Thước kẹp ${d.crabCode}',
      confirmLabel: 'Ghi số đo',
      busy: busy,
      error: error,
      onConfirm: !ready
          ? null
          : () => send(
              d,
              (repo) async => (await repo.caliper(d.sessionNo, lengthCm: length, widthCm: width, edgeBandMm: band)).decision,
              (_) => 'Đã ghi số đo. Đề xuất được tính lại.',
            ),
      children: [
        const SizedBox(height: 14),
        QcNumberField(controller: _length, label: 'Dài mai, 1 đến 30', unit: 'cm', autofocus: true, large: true, onChanged: (_) => setState(() {})),
        MoreSection(
          label: 'Số đo khác',
          children: [
            QcNumberField(controller: _width, label: 'Rộng mai, 1 đến 40', unit: 'cm', onChanged: (_) => setState(() {})),
            const SizedBox(height: 10),
            QcNumberField(controller: _band, label: 'Dải mép soi đỏ, 0 đến 50', unit: 'mm', onChanged: (_) => setState(() {})),
          ],
        ),
      ],
    );
  }
}

/// Loại bỏ cua chết, yếu nặng hoặc không an toàn: cần tình trạng, lý do và ảnh chụp trong ứng dụng.
class RejectSheet extends ConsumerStatefulWidget {
  const RejectSheet({super.key, required this.decision});
  final GradeDecision decision;
  @override
  ConsumerState<RejectSheet> createState() => _RejectSheetState();
}

class _RejectSheetState extends ConsumerState<RejectSheet> with _DecisionSend {
  String? _live;
  String? _safety;
  final _reason = TextEditingController();
  CapturedPhoto? _photo;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.decision;
    final healthy = _live == 'Alive' && _safety == 'Pass';
    final photo = _photo;
    final ready = _live != null && _safety != null && !healthy && _reason.text.trim().length >= 3 && photo != null;
    return QcSheet(
      title: 'Loại bỏ ${d.crabCode}',
      message: 'Cua bị loại sẽ tiêu huỷ, không hoàn lại được.',
      confirmLabel: 'Loại bỏ',
      danger: true,
      busy: busy,
      error: error,
      onConfirm: !ready
          ? null
          : () => send(
              d,
              (repo) => repo.reject(d.decisionNo, liveStatus: _live!, foodSafety: _safety!, reason: _reason.text.trim(), photo: photo),
              (_) => 'Đã loại bỏ ${d.crabCode}.',
            ),
      children: [
        const QcLabel('Tình trạng'),
        QcChoice<String>(
          options: [for (final v in const ['Dead', 'Weak', 'Alive']) (v, liveStatusLabels[v]!)],
          value: _live,
          onChanged: (v) => setState(() => _live = v),
        ),
        const QcLabel('An toàn thực phẩm'),
        QcChoice<String>(
          options: [for (final v in const ['Fail', 'Pass']) (v, foodSafetyLabels[v]!)],
          value: _safety,
          expand: true,
          onChanged: (v) => setState(() => _safety = v),
        ),
        if (healthy) ...[const SizedBox(height: 12), const QcNote('Cua khoẻ và an toàn thì không loại.', color: AppColors.accentText)],
        const SizedBox(height: 12),
        QcTextField(controller: _reason, label: 'Lý do', onChanged: (_) => setState(() {})),
        const SizedBox(height: 12),
        PhotoField(photo: _photo, label: 'Chụp ảnh con cua', onChanged: (p) => setState(() => _photo = p)),
      ],
    );
  }
}

/// Đổi size hoặc hạng của con đã duyệt: tạo phiên bản mới kèm ảnh và lý do; các ô chọn chỉ có giá trị được phép.
class ReviseSheet extends ConsumerStatefulWidget {
  const ReviseSheet({super.key, required this.decision});
  final GradeDecision decision;
  @override
  ConsumerState<ReviseSheet> createState() => _ReviseSheetState();
}

class _ReviseSheetState extends ConsumerState<ReviseSheet> with _DecisionSend {
  late String? _size = widget.decision.finalSize ?? widget.decision.proposedSize;
  late String? _grade = widget.decision.finalGrade;
  final _reason = TextEditingController();
  CapturedPhoto? _photo;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.decision;
    final same = _size == d.finalSize && _grade == d.finalGrade;
    final photo = _photo;
    final ready = _size != null && _grade != null && !same && _reason.text.trim().length >= 3 && photo != null;
    return QcSheet(
      title: 'Đổi size, hạng ${d.crabCode}',
      message: 'Hiện tại: ${specName(null, d.finalSize, d.finalGrade)}',
      confirmLabel: 'Lưu',
      busy: busy,
      error: error,
      onConfirm: !ready
          ? null
          : () => send(
              d,
              (repo) => repo.revise(d.decisionNo, finalSize: _size!, finalGrade: _grade!, reason: _reason.text.trim(), photo: photo),
              (res) => 'Đã đổi ${d.crabCode} thành ${specName(null, res?.finalSize, res?.finalGrade)}.',
            ),
      children: [
        const QcLabel('Size'),
        QcChoice<String>(
          options: [for (final s in sizesUpTo(d.proposedSize)) (s, statusLabel('sizeCode', s))],
          value: _size,
          onChanged: (v) => setState(() => _size = v),
        ),
        const QcLabel('Hạng'),
        QcChoice<String>(
          options: [for (final g in gradesUpTo(d.proposedGrade)) (g, statusLabel('gradeCode', g))],
          value: _grade,
          onChanged: (v) => setState(() => _grade = v),
        ),
        if (!same && isSubstandardSpec(_size, _grade)) ...[
          const SizedBox(height: 12),
          const QcNote('Cua dưới chuẩn, rời quy cách đặt trước.', color: AppColors.accentText),
        ],
        const SizedBox(height: 12),
        QcTextField(controller: _reason, label: 'Lý do', onChanged: (_) => setState(() {})),
        const SizedBox(height: 12),
        PhotoField(photo: _photo, label: 'Chụp ảnh căn cứ', onChanged: (p) => setState(() => _photo = p)),
      ],
    );
  }
}

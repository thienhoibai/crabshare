import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import 'manual_values_form.dart';
import 'measure_models.dart';
import 'measure_repository.dart';
import 'work_common.dart';

/// Thẻ lượt đo đang mở: chờ đặt cua lên trạm, rồi hiện khối lượng, size và hạng đề xuất, hai ảnh của trạm.
/// Tự hỏi lại máy chủ vài giây một lần khi còn chờ trạm.
class SessionCard extends ConsumerStatefulWidget {
  const SessionCard({
    super.key,
    required this.sessionNo,
    required this.roe,
    required this.closeLabel,
    required this.onClose,
    required this.onChanged,
    this.slotCode,
  });

  final String sessionNo;
  final bool roe;

  /// Hộp của con cua, nếu lượt đo vừa mở từ danh sách chọn cua.
  final String? slotCode;
  final String closeLabel;
  final VoidCallback onClose;

  /// Lượt đo vừa có kết quả, đổi số đo hoặc bị huỷ: màn cha tải lại số liệu của Lô.
  final VoidCallback onChanged;

  @override
  ConsumerState<SessionCard> createState() => _SessionCardState();
}

class _SessionCardState extends ConsumerState<SessionCard> {
  static const _pollEvery = Duration(seconds: 3);

  SessionDetail? _detail;
  String? _error;
  Timer? _timer;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    _timer?.cancel();
    try {
      final detail = await ref.read(measureRepositoryProvider).session(widget.sessionNo);
      if (mounted) _apply(detail);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = workError(error));
      // Mất mạng giữa chừng thì vẫn hỏi lại, không bắt người nuôi bấm thử lại.
      if (_detail?.session.isWaitingStation ?? false) _timer = Timer(_pollEvery, _load);
    }
  }

  void _apply(SessionDetail detail, {bool notify = false}) {
    _timer?.cancel();
    final before = _detail?.session.status;
    setState(() {
      _detail = detail;
      _error = null;
      _busy = false;
    });
    if (detail.session.isWaitingStation) _timer = Timer(_pollEvery, _load);
    if (notify || (before != null && before != detail.session.status)) widget.onChanged();
  }

  Future<void> _cancel(MeasureSession s) async {
    final ok = await showConfirmSheet(
      context,
      title: 'Huỷ lượt đo',
      message: 'Cua ${s.crabCode} chưa có số đo.',
      confirmLabel: 'Huỷ lượt đo',
      danger: true,
    );
    if (ok == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(measureRepositoryProvider).cancelSession(s.sessionNo);
      if (!mounted) return;
      _timer?.cancel();
      showAppToast(context, 'Đã huỷ lượt đo.');
      widget.onChanged();
      widget.onClose();
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppToast(context, workError(error), error: true);
    }
  }

  Future<void> _reprocess() async {
    setState(() => _busy = true);
    try {
      final detail = await ref.read(measureRepositoryProvider).reprocess(widget.sessionNo);
      if (mounted) _apply(detail, notify: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppToast(context, workError(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    if (detail == null) {
      return AppCard(
        child: _error == null
            ? const SizedBox(height: 96, child: Center(child: CircularProgressIndicator(strokeWidth: 3)))
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(_error!, style: const TextStyle(color: AppColors.danger)),
                  const SizedBox(height: 10),
                  OutlinedButton(
                    onPressed: () {
                      setState(() => _error = null);
                      _load();
                    },
                    child: const Text('Thử lại'),
                  ),
                  TextButton(onPressed: widget.onClose, child: const Text('Đóng')),
                ],
              ),
      );
    }

    final s = detail.session;
    final d = detail.decision;
    final text = Theme.of(context).textTheme;
    final manualOpen = s.isManual && s.status == 'Open';
    final canAddValues = s.status == 'Measured' && (d == null || d.status == 'Draft' || d.status == 'Hold');
    final form = ManualValuesForm(
      key: ValueKey('${s.sessionNo}-${detail.values.length}'),
      session: s,
      roe: widget.roe,
      primary: manualOpen,
      onSaved: (saved) => _apply(saved, notify: true),
    );

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const IconTile(icon: Icons.scale_rounded),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.slotCode == null ? 'Cua ${s.crabCode}' : 'Hộp ${widget.slotCode}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.titleLarge,
                    ),
                    if (widget.slotCode != null) Text(s.crabCode, style: text.bodySmall),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (d != null) _Result(session: s, decision: d) else _Waiting(session: s),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
          ],
          if (s.hasWhiteImage || s.hasRedImage) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                if (s.hasWhiteImage) Expanded(child: _Photo(path: '${s.apiPath}/images/white', caption: 'Đèn trắng')),
                if (s.hasWhiteImage && s.hasRedImage) const SizedBox(width: 10),
                if (s.hasRedImage) Expanded(child: _Photo(path: '${s.apiPath}/images/red', caption: 'Soi đỏ')),
              ],
            ),
          ],
          if (manualOpen) ...[const SizedBox(height: 14), form],
          if (canAddValues)
            MoreSection(
              label: s.isManual ? 'Sửa số đo tay' : 'Bổ sung số đo thước kẹp',
              initiallyOpen: d?.needsCaliper ?? false,
              children: [form],
            ),
          if (detail.values.isNotEmpty || detail.readings.isNotEmpty)
            MoreSection(label: 'Số đo chi tiết', children: [_Details(detail: detail)]),
          const SizedBox(height: 8),
          if (s.status == 'Open')
            TextButton(
              onPressed: _busy ? null : () => _cancel(s),
              style: TextButton.styleFrom(foregroundColor: AppColors.danger, minimumSize: const Size.fromHeight(48)),
              child: const Text('Huỷ lượt đo'),
            )
          else if (s.status == 'Received')
            TextButton(
              onPressed: _busy ? null : _reprocess,
              style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: Text(_busy ? 'Đang xử lý…' : 'Xử lý lại'),
            )
          else
            FilledButton(onPressed: widget.onClose, child: Text(widget.closeLabel)),
        ],
      ),
    );
  }
}

/// Lượt đo chưa có kết quả: nói rõ việc cần làm tiếp.
class _Waiting extends StatelessWidget {
  const _Waiting({required this.session});
  final MeasureSession session;

  @override
  Widget build(BuildContext context) {
    final s = session;
    final title = Theme.of(context).textTheme.titleMedium;
    if (s.status == 'Failed') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Lượt đo lỗi, hãy đo lại', style: title?.copyWith(color: AppColors.danger)),
          if (s.failReason != null) Text(s.failReason!, style: Theme.of(context).textTheme.bodySmall),
        ],
      );
    }
    if (s.status == 'Cancelled') return Text('Lượt đo đã huỷ', style: title);
    if (s.status == 'Measured') return Text('Chưa đủ số đo để đề xuất hạng', style: title);
    if (s.isManual) return Text('Cân tay, đo mai rồi nhập số đo', style: title);
    final received = s.status == 'Received';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(received ? 'Trạm đã gửi số đo, đang xử lý' : 'Đặt cua lên trạm ${s.stationCode ?? ''}'.trim(), style: title),
        const SizedBox(height: 10),
        SoftProgressBar(value: received ? 0.67 : 0.34),
      ],
    );
  }
}

/// Kết quả đo: khối lượng, size và hạng đề xuất, lý do giữ lại nếu có.
class _Result extends StatelessWidget {
  const _Result({required this.session, required this.decision});
  final MeasureSession session;
  final GradeDecision decision;

  @override
  Widget build(BuildContext context) {
    final d = decision;
    final weight = d.weightG ?? session.weightG;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (weight != null)
          Text(formatNumber(weight, 'g'), style: AppFonts.figure(38)),
        const SizedBox(height: 8),
        if (d.size == null && d.grade == null) ...[
          Text('Chưa đủ số đo để đề xuất hạng', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 8),
        ],
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (d.size != null) StatusPill(kind: 'sizeCode', value: d.size),
            if (d.grade != null) StatusPill(kind: 'gradeCode', value: d.grade),
            StatusPill(kind: 'grade', value: d.status),
          ],
        ),
        // Lý do giữ lại chỉ còn ý nghĩa khi Nhân viên kiểm phẩm chưa chốt hạng.
        if (d.holdReasons.isNotEmpty && (d.status == 'Draft' || d.status == 'Hold')) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [for (final r in d.holdReasons) StatusPill(kind: 'holdReason', value: r)],
          ),
        ],
        if (d.reason != null && d.reason!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(d.reason!, style: Theme.of(context).textTheme.bodySmall),
        ],
      ],
    );
  }
}

class _Photo extends StatelessWidget {
  const _Photo({required this.path, required this.caption});
  final String path;
  final String caption;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      AuthImage(path, height: 120),
      const SizedBox(height: 4),
      Text(caption, style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

/// Số đo thô, kết quả AI và mã lượt đo; nằm trong phần gấp lại.
class _Details extends StatelessWidget {
  const _Details({required this.detail});
  final SessionDetail detail;

  static String _unit(String unit) => unit == 'cm2' ? 'cm²' : unit;

  @override
  Widget build(BuildContext context) {
    final s = detail.session;
    final c = detail.decision?.cIndex;
    return KeyValueList(
      rows: [
        for (final v in detail.values)
          (statusLabel('metric', v.metric), '${formatNumber(v.value, _unit(v.unit))} · ${statusLabel('measureMethod', v.method)}'),
        ('Chỉ số C', c == null ? null : formatNumber(c)),
        for (final a in detail.readings)
          (
            a.imageKind == 'Red' ? 'Ảnh soi đỏ' : 'Ảnh đèn trắng',
            '${statusLabel('ai', a.status)}${a.isSimulated ? ' · số giả lập' : ''}',
          ),
        ('Trạm đo', s.stationCode ?? 'Đo tay'),
        ('Mở lúc', s.openedAt == null ? null : '${formatTime(s.openedAt!)} ${formatDate(s.openedAt!)}'),
        ('Lượt đo', s.sessionNo),
      ],
    );
  }
}

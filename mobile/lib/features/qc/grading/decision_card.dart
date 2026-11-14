import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/grading_models.dart';
import '../data/grading_repository.dart';
import '../data/qc_models.dart';
import '../widgets/qc_parts.dart';

/// Thẻ lớn của một con cua đang chờ duyệt: mã cua và hộp, lý do giữ lại, hai ảnh của trạm, size và hạng đề xuất,
/// ba số chính (ô vàng khi sát ngưỡng), rồi tới nút thao tác ([actions]). Số đo thô, kết quả AI và thông tin lượt đo
/// nằm trong phần gấp lại; [extra] là phần thêm ở cuối phần gấp đó.
class DecisionCard extends ConsumerWidget {
  const DecisionCard({super.key, required this.decision, required this.ruleSet, required this.actions, this.extra});
  final GradeDecision decision;

  /// Bộ quy tắc mà quyết định đã dùng; có thì chỉ ra số đo nào sát ngưỡng nào.
  final GradeRuleSet? ruleSet;
  final Widget actions;
  final Widget? extra;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = decision;
    final measured = ref.watch(sessionMeasurementsProvider(d.sessionNo));
    final crab = ref.watch(crabUnitProvider(d.crabCode)).value;
    final near = nearHits(d, ruleSet);
    String? nearOf(String metric) {
      for (final h in near) {
        if (h.metric == metric) return 'sát ${formatNum(h.bound, 4)}';
      }
      return null;
    }

    // Số nào quyết định hạng tuỳ bộ quy tắc của loại cua: chỉ số C (cua thịt, cua cái non) hoặc dải mép khi soi đỏ (cua gạch).
    final usesC = ruleSet?.rules.any((r) => r.metric == 'CIndex') ?? (d.cIndex != null || d.needsCaliper);
    final usesBand = ruleSet?.rules.any((r) => r.metric == 'EdgeBandMm') ?? (d.edgeBandMm != null);
    final numbers = [
      _NumberCell(label: 'Khối lượng', value: d.weightG == null ? null : '${formatNum(d.weightG, 1)} g', near: nearOf('WeightG')),
      if (usesC) _NumberCell(label: 'Chỉ số C', value: d.cIndex == null ? null : formatNum(d.cIndex, 4), near: nearOf('CIndex')),
      if (usesBand)
        _NumberCell(label: 'Dải mép soi đỏ', value: d.edgeBandMm == null ? null : '${formatNum(d.edgeBandMm, 2)} mm', near: nearOf('EdgeBandMm')),
      if (!(usesC && usesBand))
        _NumberCell(label: 'Dài mai', value: d.carapaceLengthCm == null ? null : '${formatNum(d.carapaceLengthCm, 2)} cm', needed: usesC),
    ];

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(d.crabCode, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
          if (crab?.currentSlotCode != null)
            Text('Hộp ${crab!.currentSlotCode}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.accentText)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: d.holdReasons.isEmpty
                ? [StatusPill(kind: 'grade', value: d.status)]
                : [for (final code in d.holdReasons) StatusPill(kind: 'holdReason', value: code)],
          ),
          const SizedBox(height: 12),
          _Shots(sessionNo: d.sessionNo, measured: measured),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('Đề xuất', style: Theme.of(context).textTheme.bodySmall),
              ProposalPill(kind: 'sizeCode', value: d.proposedSize, missing: 'Chưa có size'),
              ProposalPill(kind: 'gradeCode', value: d.proposedGrade, missing: 'Chưa có hạng'),
            ],
          ),
          const SizedBox(height: 12),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (i, cell) in numbers.indexed) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: cell),
                ],
              ],
            ),
          ),
          if (d.qcHeld && d.reason != null) ...[
            const SizedBox(height: 10),
            QcNote('Lý do giữ lại: ${d.reason}', color: AppColors.accentText),
          ],
          const SizedBox(height: 14),
          actions,
          MoreSection(
            label: 'Số đo, AI và lượt đo',
            children: [
              _Detail(decision: d, measured: measured.value, crab: crab),
              ?extra,
            ],
          ),
        ],
      ),
    );
  }
}

/// Chip size hoặc hạng cỡ lớn; chưa có giá trị thì hiện [missing] màu cảnh báo.
class ProposalPill extends StatelessWidget {
  const ProposalPill({super.key, required this.kind, required this.value, this.missing = ''});
  final String kind;
  final String? value;
  final String missing;

  @override
  Widget build(BuildContext context) {
    final color = value == null ? AppColors.warning : toneColor(statusTone(kind, value));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(
        value == null ? missing : statusLabel(kind, value),
        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: color == AppColors.inkMuted ? AppColors.ink : color),
      ),
    );
  }
}

/// Một ô số: ô vàng khi sát ngưỡng, ô đỏ khi thiếu một số cần cho việc phân hạng ([needed]).
class _NumberCell extends StatelessWidget {
  const _NumberCell({required this.label, required this.value, this.near, this.needed = true});
  final String label;
  final String? value;
  final String? near;
  final bool needed;

  @override
  Widget build(BuildContext context) {
    final missing = value == null && needed;
    final color = missing ? AppColors.danger : (near != null ? AppColors.warning : null);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color?.withValues(alpha: 0.14) ?? AppColors.background,
        borderRadius: BorderRadius.circular(14),
        border: near != null && !missing ? Border.all(color: AppColors.warning, width: 1.5) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value ?? (needed ? 'Chưa có' : '—'),
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: missing ? AppColors.danger : AppColors.ink),
            ),
          ),
          if (near != null && !missing)
            Text(near!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.accentText)),
        ],
      ),
    );
  }
}

/// Hai ảnh của trạm đặt cạnh nhau: đèn trắng và soi đỏ. Bấm vào ảnh để phóng to.
class _Shots extends StatelessWidget {
  const _Shots({required this.sessionNo, required this.measured});
  final String sessionNo;
  final AsyncValue<SessionMeasurements> measured;

  @override
  Widget build(BuildContext context) {
    final session = measured.value?.session;
    if (session == null && measured.hasError) return const SizedBox.shrink();
    if (session != null && !session.hasImages) {
      return const Align(
        alignment: Alignment.centerLeft,
        child: InfoChip(label: 'Đo tay, không có ảnh', icon: Icons.back_hand_outlined, background: AppColors.background),
      );
    }
    final base = '/api/measurement-sessions/${Uri.encodeComponent(sessionNo)}/images';
    return Row(
      children: [
        Expanded(child: _Shot(path: session?.hasWhiteImage == true ? '$base/white' : null, caption: 'Đèn trắng', loading: session == null)),
        const SizedBox(width: 10),
        Expanded(child: _Shot(path: session?.hasRedImage == true ? '$base/red' : null, caption: 'Soi đỏ', loading: session == null)),
      ],
    );
  }
}

class _Shot extends StatelessWidget {
  const _Shot({required this.path, required this.caption, required this.loading});
  final String? path;
  final String caption;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (path == null)
          Container(
            height: 150,
            decoration: BoxDecoration(color: AppColors.surfaceMuted, borderRadius: BorderRadius.circular(16)),
            alignment: Alignment.center,
            child: loading ? null : const Icon(Icons.image_not_supported_outlined, color: AppColors.inkMuted),
          )
        else
          Semantics(
            button: true,
            label: 'Ảnh $caption, bấm để phóng to',
            child: GestureDetector(
              onTap: () => showDialog<void>(context: context, builder: (_) => _PhotoViewer(path: path!, title: caption)),
              child: AuthImage(path!, height: 150),
            ),
          ),
        const SizedBox(height: 4),
        Text(caption, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

/// Ảnh toàn màn hình, kéo hai ngón để phóng to xem viền mai.
class _PhotoViewer extends ConsumerWidget {
  const _PhotoViewer({required this.path, required this.title});
  final String path;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const broken = Center(child: Icon(Icons.image_not_supported_outlined, color: Colors.white70, size: 40));
    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: ref.watch(authImageProvider(path)).when(
                data: (bytes) => bytes.isEmpty ? broken : InteractiveViewer(maxScale: 6, child: Center(child: Image.memory(bytes, fit: BoxFit.contain))),
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) => broken,
              ),
            ),
            Positioned(left: 16, bottom: 16, child: Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
            Positioned(top: 8, right: 12, child: CircleIconButton(icon: Icons.close_rounded, onTap: () => Navigator.of(context).pop())),
          ],
        ),
      ),
    );
  }
}

const _units = {'cm2': 'cm²', 'g/cm3': 'g/cm³'};
String _pct(double? confidence) => confidence == null ? '' : ' · ${formatNum(confidence * 100, 0)}%';

/// Số đo thô, kết quả AI và thông tin lượt đo.
class _Detail extends StatelessWidget {
  const _Detail({required this.decision, this.measured, this.crab});
  final GradeDecision decision;
  final SessionMeasurements? measured;
  final CrabUnit? crab;

  Widget _line(BuildContext context, String title, String sub, Widget end) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(sub, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        const SizedBox(width: 10),
        end,
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final d = decision;
    final s = measured?.session;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final v in measured?.values ?? const <MeasuredValue>[])
          _line(
            context,
            statusLabel('metric', v.metric),
            '${statusLabel('measureMethod', v.method)}${_pct(v.confidence)}${v.method == 'Scale' && !v.verified ? ' · cân chưa hiệu chuẩn' : ''}',
            Text('${formatNum(v.value)} ${_units[v.unit] ?? v.unit}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        for (final inf in measured?.inferences ?? const <AiInference>[])
          _line(
            context,
            'AI · ${inf.imageKind == 'White' ? 'đèn trắng' : 'soi đỏ'}',
            '${inf.modelName} ${inf.modelVersion}${_pct(inf.confidence)}${inf.isSimulated ? ' · giả lập' : ''}'
                '${inf.errorReason == null ? '' : ' · ${inf.errorReason}'}',
            StatusPill(kind: 'ai', value: inf.status),
          ),
        KeyValueList(
          rows: [
            ('Theo chỉ số C', d.proposedCLevel == null ? null : statusLabel('gradeCode', d.proposedCLevel)),
            ('Theo soi đỏ', d.proposedSensory == null ? null : statusLabel('gradeCode', d.proposedSensory)),
            ('Cách đo', s == null ? null : (s.procedure == 'Manual' ? 'Đo tay' : 'Trạm ${s.stationCode ?? ''}'.trim())),
            ('Đo lúc', s?.measuredAt == null ? null : '${formatTime(s!.measuredAt!)} ${formatDate(s.measuredAt!)}'),
            ('Lúc nhận', crab == null ? null : '${formatNum(crab!.receivedWeightG, 1)} g · ${statusLabel('sex', crab!.sex)}'),
            ('Lô nguồn', crab?.originRegion),
            ('Lượt đo', d.sessionNo),
            ('Bộ quy tắc', 'Phiên bản ${d.ruleSetVersion} · đề xuất ${d.versionNo}'),
          ],
        ),
      ],
    );
  }
}

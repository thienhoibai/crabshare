import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/capture/captured_photo.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/qc_models.dart';
import '../data/qc_repository.dart';
import '../data/site_visit_repository.dart';
import '../widgets/qc_parts.dart';
import 'box_picker.dart';

/// Biên bản thăm trại giữa vụ, lập ngay tại trại: chụp một ảnh (ảnh mang theo vị trí), bấm các hộp đã xem, ghi số cua
/// và nhận xét rồi gửi. Nút gửi nêu rõ còn thiếu gì. Biên bản trước của Lô nằm trong phần gấp lại.
class SiteVisitReportPage extends ConsumerStatefulWidget {
  const SiteVisitReportPage({super.key, required this.assignmentId});

  /// Mã việc thăm trại được phân; Lô lấy từ chính việc đó.
  final int assignmentId;

  @override
  ConsumerState<SiteVisitReportPage> createState() => _SiteVisitReportPageState();
}

class _SiteVisitReportPageState extends ConsumerState<SiteVisitReportPage> {
  CapturedPhoto? _photo;
  final _picked = <String>{};
  final _typed = TextEditingController();
  final _crabs = TextEditingController();
  final _findings = TextEditingController();
  bool _busy = false;
  String? _error;
  SiteVisitReport? _done;

  @override
  void dispose() {
    _typed.dispose();
    _crabs.dispose();
    _findings.dispose();
    super.dispose();
  }

  Future<void> _submit(String batchCode, List<String> codes, int crabs) async {
    final photo = _photo;
    if (photo == null || _busy) return;
    final ok = await showConfirmSheet(
      context,
      title: 'Gửi biên bản thăm trại',
      message: '${codes.length} hộp · $crabs con. Gửi rồi không sửa được.',
      confirmLabel: 'Gửi biên bản',
    );
    if (ok == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final report = await ref
          .read(siteVisitRepositoryProvider)
          .submit(widget.assignmentId, SiteVisitInput(photo: photo, boxCodes: codes, crabsSeen: crabs, findings: _findings.text.trim()));
      if (!mounted) return;
      setState(() {
        _done = report;
        _busy = false;
      });
      ref.invalidate(pastVisitsProvider(batchCode));
      ref.invalidate(qcTasksProvider);
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
    final done = _done;
    final tasks = ref.watch(qcTasksProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: SubPageHeader(title: done == null ? 'Thăm trại' : 'Đã lập biên bản'),
            ),
            Expanded(
              child: done != null
                  ? _DoneView(report: done)
                  : AsyncContent<List<QcTask>>(
                      value: keepData(tasks),
                      onRefresh: () => ref.refresh(qcTasksProvider.future),
                      data: (list) {
                        final task = list.where((t) => t.kind == QcKinds.visit && t.assignmentId == widget.assignmentId).firstOrNull;
                        return SingleChildScrollView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                          child: task == null
                              ? const EmptyState(icon: Icons.place_outlined, title: 'Việc này đã xong hoặc không phân cho bạn')
                              : _form(context, task.batchCode),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _form(BuildContext context, String batchCode) {
    final head = ref.watch(batchHeadProvider(batchCode)).value;
    final progress = ref.watch(batchProgressProvider(batchCode)).value;
    final boxes = ref.watch(visitBoxesProvider(batchCode));
    final past = ref.watch(pastVisitsProvider(batchCode)).value ?? const <SiteVisitReport>[];
    final hasGrid = (boxes.value ?? const <VisitBox>[]).isNotEmpty;
    final codes = hasGrid
        ? [for (final b in boxes.value!) if (_picked.contains(b.slotCode)) b.slotCode]
        : {for (final c in _typed.text.split(',')) if (c.trim().isNotEmpty) c.trim().toUpperCase()}.toList();
    final boxText = codes.join(',');
    final crabs = int.tryParse(_crabs.text.trim());
    final missing = [
      if (_photo == null) 'ảnh',
      if (boxText.length > 400) 'bớt hộp' else if (boxText.length < 4) 'hộp đã xem',
      if (crabs == null || crabs > 100000) 'số cua',
      if (_findings.text.trim().length < 3) 'nhận xét',
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(['Lô $batchCode', ?head?.title].join(' · '), style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 12),
        PhotoField(photo: _photo, label: 'Chụp ảnh tại trại', onChanged: (p) => setState(() => _photo = p)),
        if (_photo != null) ...[
          const SizedBox(height: 8),
          const Align(
            alignment: Alignment.centerLeft,
            child: InfoChip(icon: Icons.location_on_outlined, label: 'Đã ghi vị trí lúc chụp'),
          ),
        ],
        const SizedBox(height: 12),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(hasGrid ? 'Hộp đã xem · ${codes.length}' : 'Hộp đã xem', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 10),
              if (boxes.isLoading && !boxes.hasValue)
                const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator(strokeWidth: 3)))
              else if (hasGrid)
                BoxPicker(
                  boxes: boxes.value!,
                  picked: _picked,
                  onToggle: (code) => setState(() {
                    if (!_picked.remove(code)) _picked.add(code);
                  }),
                )
              else
                TextField(
                  controller: _typed,
                  textCapitalization: TextCapitalization.characters,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(labelText: 'Mã hộp, cách nhau bằng dấu phẩy', fillColor: AppColors.background),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        QcNumberField(
          controller: _crabs,
          label: 'Số cua đã thấy',
          unit: 'con',
          decimal: false,
          // Số cua đang nuôi theo sổ, để đối chiếu với số đếm tại trại.
          helper: progress == null ? null : 'Theo sổ: ${progress.crabsAlive} con',
          fillColor: AppColors.surface,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _findings,
          minLines: 3,
          maxLines: 6,
          maxLength: 1000,
          textCapitalization: TextCapitalization.sentences,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Nhận xét', alignLabelWithHint: true, counterText: ''),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
          ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: missing.isNotEmpty || _busy ? null : () => _submit(batchCode, codes, crabs!),
          child: Text(_busy ? 'Đang gửi…' : (missing.isEmpty ? 'Gửi biên bản' : 'Còn thiếu: ${missing.join(', ')}')),
        ),
        if (past.isNotEmpty)
          MoreSection(
            label: 'Biên bản trước · ${past.length}',
            children: [
              for (final r in past)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${formatDate(r.visitedAt)} · ${r.boxCodes.length} hộp · ${r.crabsSeen} con',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(r.findings, style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

/// Kết quả sau khi gửi: số biên bản, khoảng cách tới trại do máy chủ tính, rồi về danh sách việc.
class _DoneView extends StatelessWidget {
  const _DoneView({required this.report});
  final SiteVisitReport report;

  @override
  Widget build(BuildContext context) {
    final r = report;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
      children: [
        AppCard(
          child: Row(
            children: [
              const IconTile(icon: Icons.check_rounded, background: AppColors.success, foreground: Colors.white),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.reportNo, style: Theme.of(context).textTheme.titleMedium),
                    Text('Lô ${r.batchCode}', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        FactGrid(
          facts: [
            Fact('Cách trại', r.distanceToFarmM == null ? '—' : '${formatNum(r.distanceToFarmM, 0)} m', color: AppColors.success),
            Fact('Hộp đã xem', '${r.boxCodes.length}'),
            Fact('Cua đã thấy', '${r.crabsSeen} con'),
          ],
        ),
        const SizedBox(height: 18),
        FilledButton(onPressed: () => context.go(Routes.qcTasks), child: const Text('Về danh sách việc')),
      ],
    );
  }
}

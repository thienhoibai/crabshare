import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import 'crab_picker.dart';
import 'measure_models.dart';
import 'measure_repository.dart';
import 'measure_results.dart';
import 'session_card.dart';
import 'work_common.dart';

/// Đo cua của một Lô, dùng khi đứng ở trạm: bắt đầu thu hoạch, chọn cua theo số hộp, mở lượt đo, xem kết quả.
/// Người nuôi chỉ đo và xem; Nhân viên kiểm phẩm duyệt hạng cuối.
class MeasurePage extends ConsumerStatefulWidget {
  const MeasurePage({super.key, required this.batchCode});
  final String batchCode;

  @override
  ConsumerState<MeasurePage> createState() => _MeasurePageState();
}

class _MeasurePageState extends ConsumerState<MeasurePage> {
  final _scroll = ScrollController();
  bool _starting = false;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Mở thẻ của một lượt đo ở đầu màn, hoặc đóng thẻ khi [sessionNo] null.
  void _show(String? sessionNo, {String? slotCode}) {
    final sessions = ref.read(activeSessionsProvider.notifier);
    if (sessionNo == null) {
      sessions.close(widget.batchCode);
    } else {
      sessions.show(widget.batchCode, sessionNo, slotCode: slotCode);
    }
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  Future<void> _startHarvest(WorkBatch batch) async {
    final ok = await showConfirmSheet(
      context,
      title: 'Bắt đầu thu hoạch',
      message: 'Lô ${batch.code} chuyển sang đang thu hoạch và không quay lại được.',
      confirmLabel: 'Bắt đầu thu hoạch',
    );
    if (ok == null || !mounted) return;
    setState(() => _starting = true);
    final provider = measureBoardProvider(widget.batchCode);
    try {
      await ref.read(measureRepositoryProvider).startHarvest(batch.code);
      ref.invalidate(provider);
      await ref.read(provider.future);
      if (mounted) showAppToast(context, 'Đã bắt đầu thu hoạch.');
    } catch (error) {
      if (mounted) showAppToast(context, workError(error), error: true);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = measureBoardProvider(widget.batchCode);
    final board = ref.watch(provider);
    final active = ref.watch(activeSessionsProvider.select((sessions) => sessions[widget.batchCode]));
    return Scaffold(
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(provider.future),
          child: ListView(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              SubPageHeader(
                title: 'Đo cua',
                trailing: InfoChip(label: 'Lô ${widget.batchCode}', icon: Icons.grid_view_rounded),
              ),
              const SizedBox(height: 16),
              ...board.when(
                loading: () => [const LoadingSkeleton(rows: 2)],
                error: (error, _) => [ErrorView(message: workError(error), onRetry: () => ref.invalidate(provider))],
                data: (b) => _content(b, active),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _content(MeasureBoard board, ActiveSession? active) {
    final batch = board.batch;
    final g = board.summary;
    return [
      if (active != null)
        SessionCard(
          key: ValueKey(active.sessionNo),
          sessionNo: active.sessionNo,
          slotCode: active.slotCode,
          roe: batch.isRoe,
          closeLabel: batch.canMeasure ? 'Đo con tiếp theo' : 'Đóng',
          onClose: () => _show(null),
          onChanged: () => ref.invalidate(measureBoardProvider(widget.batchCode)),
        )
      else if (batch.canStartHarvest)
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: Text('Lô chưa thu hoạch', style: Theme.of(context).textTheme.titleMedium)),
                  StatusPill(kind: 'batch', value: batch.status),
                ],
              ),
              const SizedBox(height: 14),
              FilledButton(
                onPressed: _starting ? null : () => _startHarvest(batch),
                child: Text(_starting ? 'Đang chuyển…' : 'Bắt đầu thu hoạch'),
              ),
            ],
          ),
        )
      else if (batch.canMeasure && board.crabs.isNotEmpty)
        CrabPicker(board: board, onOpened: (session, crab) => _show(session.sessionNo, slotCode: crab.slotCode))
      else if (batch.canMeasure)
        const EmptyState(icon: Icons.check_circle_outline_rounded, title: 'Không còn cua chờ đo')
      else if (board.decisions.isEmpty)
        const EmptyState(icon: Icons.scale_outlined, title: 'Lô chưa tới lúc đo cua'),
      if (g.received > 0) ...[
        const SizedBox(height: 16),
        FactGrid(
          facts: [
            Fact('Chờ đo', '${g.notMeasured}', color: g.notMeasured > 0 ? AppColors.warning : null),
            Fact('Chờ duyệt', '${g.waitingQc}', color: g.waitingQc > 0 ? AppColors.info : null),
            Fact('Đã duyệt', '${g.approved}', color: AppColors.success),
            Fact('Loại bỏ', '${g.rejected}', color: g.rejected > 0 ? AppColors.danger : null),
          ],
        ),
      ],
      MeasureResults(decisions: board.decisions, onOpen: (d) => _show(d.sessionNo)),
    ];
  }
}

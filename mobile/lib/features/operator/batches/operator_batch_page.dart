import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/holding_models.dart';
import '../data/holding_repository.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import 'assign_box_sheet.dart';
import 'box_tile.dart';
import 'crab_sheet.dart';

/// Màn một Lô của người nuôi: sơ đồ hộp là chính. Bấm hộp có cua để mở phiếu con cua; bấm hộp trống để xếp cua hoặc thả bù.
/// Số liệu của đợt lưu nuôi (đã chết, đã thả bù, ngày thả) nằm trong khối gấp dưới sơ đồ.
class OperatorBatchPage extends ConsumerWidget {
  const OperatorBatchPage({super.key, required this.code});
  final String code;

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(batchBoxesProvider(code));
    ref.invalidate(batchCrabsProvider(code));
    ref.invalidate(batchHoldingProvider(code));
    ref.invalidate(freeBoxesProvider);
    final batch = await ref.refresh(operatorBatchProvider(code).future);
    if (batch.hasHolding) await ref.read(batchBoxesProvider(code).future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final batch = ref.watch(operatorBatchProvider(code));
    final loaded = batch.value;
    return Scaffold(
      bottomNavigationBar: loaded == null || !(loaded.canLog || loaded.isHarvesting) ? null : _ActionBar(batch: loaded),
      body: SafeArea(
        bottom: false,
        child: AsyncContent<FarmBatch>(
          value: batch,
          onRefresh: () => _refresh(ref),
          header: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: SubPageHeader(title: code),
          ),
          data: (b) => _BoxBoard(batch: b),
        ),
      ),
    );
  }
}

/// Nút việc chính ở đáy màn: ghi nhật ký; khi Lô đang thu hoạch thì đo cua là việc chính.
class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.batch});
  final FarmBatch batch;

  @override
  Widget build(BuildContext context) {
    final b = batch;
    void log() => context.push(Routes.dailyLogFor(b.code));
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(20, 8, 20, 12),
      child: Row(
        children: [
          if (b.canLog)
            Expanded(
              child: b.isHarvesting
                  ? OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(56),
                        foregroundColor: AppColors.ink,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
                      ),
                      onPressed: log,
                      child: const Text('Ghi nhật ký'),
                    )
                  : FilledButton.icon(onPressed: log, icon: const Icon(Icons.edit_note_rounded), label: const Text('Ghi nhật ký')),
            ),
          if (b.canLog && b.isHarvesting) const SizedBox(width: 10),
          if (b.isHarvesting)
            Expanded(
              child: FilledButton.icon(
                onPressed: () => context.push(Routes.operatorMeasure(b.code)),
                icon: const Icon(Icons.scale_outlined),
                label: const Text('Đo cua'),
              ),
            ),
        ],
      ),
    );
  }
}

class _BoxBoard extends ConsumerStatefulWidget {
  const _BoxBoard({required this.batch});
  final FarmBatch batch;

  @override
  ConsumerState<_BoxBoard> createState() => _BoxBoardState();
}

class _BoxBoardState extends ConsumerState<_BoxBoard> {
  static const _side = EdgeInsets.symmetric(horizontal: 20);
  Timer? _debounce;
  String _query = '';

  /// Số hộp gửi lên máy chủ để lọc hộp trống của trại; chậm hơn [_query] một nhịp để không gọi theo từng phím.
  String _farmQuery = '';

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearch(String text) {
    setState(() => _query = text.trim());
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _farmQuery = text.trim());
    });
  }

  Future<void> _open(BoxState box, {required List<BoxState> boxes, required List<CrabUnit>? crabs, required Map<String, String> restock}) async {
    final deadCrabCode = restock[box.slotCode];
    final b = widget.batch;
    String? done;
    if (box.inMaintenance) {
      showAppToast(context, 'Hộp ${box.slotCode} đang bảo trì.');
    } else if (box.hasCrab) {
      done = await showCrabSheet(
        context,
        batchCode: b.code,
        box: box,
        // Hộp có cua chết chưa thả bù để dành cho con thả bù, không chuyển cua khác vào.
        emptyBoxes: [
          for (final x in boxes)
            if (!x.hasCrab && !restock.containsKey(x.slotCode)) x,
        ],
      );
    } else if (!b.canBox) {
      showAppToast(context, 'Hộp ${box.slotCode} đang trống.');
    } else if (crabs == null) {
      showAppToast(context, 'Đang tải danh sách cua, thử lại sau giây lát.');
    } else {
      final waiting = [
        for (final c in crabs)
          if (c.isWaiting) c,
      ];
      if (waiting.isEmpty) {
        showAppToast(context, 'Chưa có cua chờ xếp hộp.');
      } else {
        done = await showAssignBoxSheet(context, batchCode: b.code, slotCode: box.slotCode, waiting: waiting, replacesCrabCode: deadCrabCode);
      }
    }
    if (done != null && mounted) showAppToast(context, done);
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.batch;
    if (!b.hasHolding) return _plain(const EmptyState(icon: Icons.grid_view_rounded, title: 'Lô này không lưu nuôi trong hộp'));

    final boxesState = ref.watch(batchBoxesProvider(b.code));
    final crabs = ref.watch(batchCrabsProvider(b.code)).value;
    final holding = ref.watch(batchHoldingProvider(b.code)).value;
    final boxes = boxesState.value ?? const <BoxState>[];
    final restock = crabs == null ? const <String, String>{} : restockSlots(crabs);
    final waiting = [...?crabs].where((c) => c.isWaiting).length;

    // Còn cua chờ xếp hộp thì đưa thêm hộp trống của trại để chọn (Lô mới chưa có hộp nào).
    final offerFarm = b.canBox && waiting > 0;
    final ofBatch = {for (final x in boxes) x.slotCode};
    final farmBoxes = offerFarm
        ? [
            for (final f in [...?ref.watch(freeBoxesProvider(_farmQuery)).value])
              if (!ofBatch.contains(f.slotCode)) f,
          ]
        : const <BoxState>[];
    final shown = _query.isEmpty
        ? boxes
        : [
            for (final x in boxes)
              if (x.slotCode.contains(_query)) x,
          ];

    final looks = [for (final x in boxes) BoxLook.of(x, deadCrabCode: restock[x.slotCode])];
    int count(BoxLook look) => looks.where((l) => l == look).length;

    Widget tile(BoxState box) => BoxTile(
      box: box,
      look: BoxLook.of(box, deadCrabCode: restock[box.slotCode]),
      onTap: () => _open(box, boxes: boxes, crabs: crabs, restock: restock),
    );

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          sliver: SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _header(context),
                if (offerFarm) ...[
                  const SizedBox(height: 12),
                  AppCard(
                    color: AppColors.accentSoft,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Text('$waiting con chờ xếp hộp. Bấm một hộp trống để xếp.', style: const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ],
                if (boxes.length > 30 || offerFarm) ...[
                  const SizedBox(height: 12),
                  TextField(
                    keyboardType: TextInputType.number,
                    onChanged: _onSearch,
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Tìm số hộp'),
                  ),
                ],
                // Bốn con số của màn cũng là chú giải màu của sơ đồ hộp ngay bên dưới.
                if (boxes.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  MetricRow(
                    metrics: [
                      Metric('khoẻ', '${count(BoxLook.healthy)}', color: AppColors.success),
                      if (count(BoxLook.attention) > 0) Metric('cần xem', '${count(BoxLook.attention)}', color: AppColors.warning),
                      if (count(BoxLook.dead) > 0) Metric('chết chưa thả bù', '${count(BoxLook.dead)}', color: AppColors.danger),
                      Metric('trống', '${count(BoxLook.empty)}', color: AppColors.inkMuted),
                    ],
                  ),
                ],
                if (boxesState.isLoading && !boxesState.hasValue) const LoadingSkeleton(rows: 1),
                if (boxesState.hasError && !boxesState.isLoading)
                  ErrorView(message: apiErrorMessage(boxesState.error!), onRetry: () => ref.invalidate(batchBoxesProvider(b.code))),
                if (boxesState.hasValue && boxes.isEmpty && !offerFarm)
                  const EmptyState(icon: Icons.grid_view_rounded, title: 'Lô chưa có cua trong hộp'),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: _side,
          sliver: SliverGrid(
            gridDelegate: boxGridDelegate,
            delegate: SliverChildBuilderDelegate((context, i) => tile(shown[i]), childCount: shown.length),
          ),
        ),
        if (farmBoxes.isNotEmpty) ...[
          const SliverPadding(
            padding: _side,
            sliver: SliverToBoxAdapter(child: SectionHeader(title: 'Hộp trống của trại')),
          ),
          SliverPadding(
            padding: _side,
            sliver: SliverGrid(
              gridDelegate: boxGridDelegate,
              delegate: SliverChildBuilderDelegate((context, i) => tile(farmBoxes[i]), childCount: farmBoxes.length),
            ),
          ),
        ],
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          sliver: SliverToBoxAdapter(child: holding == null ? const SizedBox.shrink() : _holdingMore(holding)),
        ),
      ],
    );
  }

  Widget _header(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SubPageHeader(
        title: widget.batch.code,
        trailing: StatusPill(kind: 'batch', value: widget.batch.status),
      ),
      const SizedBox(height: 8),
      Text(widget.batch.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall),
    ],
  );

  Widget _plain(Widget child) => ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
    children: [_header(context), child],
  );

  Widget _holdingMore(Holding h) => MoreSection(
    label: 'Đợt lưu nuôi',
    children: [
      KeyValueList(
        rows: [
          ('Tình trạng', holdingStatusLabel(h.status)),
          ('Đang ở hộp', '${formatCount(h.boxed)} con'),
          ('Đã chết', '${formatCount(h.dead)} con'),
          ('Đã thả bù', '${h.restocked}/${h.maxRestock} con'),
          ('Ngày thả đầu tiên', formatDate(h.stockedAt)),
          ('Dự kiến kết thúc', h.expectedEndDate == null ? null : formatDate(h.expectedEndDate!)),
          ('Hạn thả bù', '${widget.batch.restockCutoffDays} ngày đầu'),
          ('Đã nhận vào tồn', '${formatCount(h.received)} con'),
          ('Cách nuôi', h.method),
          ('Mã đợt', h.holdingCode),
        ],
      ),
    ],
  );
}

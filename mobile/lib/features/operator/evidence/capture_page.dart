import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/capture/captured_photo.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import 'capture_requests_repository.dart';
import 'evidence_explanation_repository.dart';
import 'evidence_repository.dart';

/// Chụp ảnh tại một hộp đang có cua: chọn hộp, chụp bằng camera trong ứng dụng, gửi.
/// Mở từ một yêu cầu chụp ([captureRequestId]) thì hộp đã chọn sẵn và chỉ gửi được trước hạn.
class CapturePage extends ConsumerStatefulWidget {
  const CapturePage({super.key, this.initialSlot, this.captureRequestId, this.requestBatchCode, this.requestDueAt});
  final String? initialSlot;
  final int? captureRequestId;
  final String? requestBatchCode;
  final DateTime? requestDueAt;

  @override
  ConsumerState<CapturePage> createState() => _CapturePageState();
}

class _CapturePageState extends ConsumerState<CapturePage> {
  late final _search = TextEditingController(text: widget.initialSlot ?? '');
  late String _query = widget.initialSlot ?? '';
  Timer? _debounce;
  Timer? _clock;

  /// Hộp người dùng tự chọn. Chưa chọn thì lấy hộp mở sẵn theo [CapturePage.initialSlot], trừ khi đã bấm đổi hộp.
  BoxSlot? _picked;
  bool _preselect = true;
  CapturedPhoto? _photo;
  EvidenceResult? _result;
  String? _error;
  bool _sending = false;

  bool get _forRequest => widget.captureRequestId != null;
  bool get _expired => widget.requestDueAt != null && DateTime.now().isAfter(widget.requestDueAt!);
  bool get _fulfilled => _forRequest && _result?.captureRequestStatus == 'Fulfilled';

  @override
  void initState() {
    super.initState();
    // Yêu cầu chụp có hạn: đếm lùi và khoá nút khi quá hạn.
    if (_forRequest) {
      _clock = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _clock?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = text.trim());
    });
  }

  void _reset() => setState(() {
    _picked = null;
    _preselect = false;
    _photo = null;
    _result = null;
    _error = null;
    _sending = false;
  });

  Future<void> _send(BoxSlot box) async {
    final photo = _photo;
    if (_sending || photo == null || _expired || _fulfilled) return;
    final account = ref.read(farmAccountProvider);
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(evidenceRepositoryProvider)
          .upload(batchCode: box.batchCode ?? '', slotCode: box.slotCode, photo: photo, captureRequestId: widget.captureRequestId);
      if (!mounted || ref.read(farmAccountProvider) != account) return;
      setState(() {
        _result = result;
        _photo = null;
      });
      if (_fulfilled) _clock?.cancel();
      ref.invalidate(captureBoxesProvider);
      ref.invalidate(captureRequestsProvider);
      ref.invalidate(operatorDashboardProvider);
      if (result.reviewStatus == 'Flagged') ref.invalidate(flaggedEvidenceProvider);
    } catch (error) {
      if (mounted && ref.read(farmAccountProvider) == account) setState(() => _error = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Đổi tài khoản giữa chừng thì bỏ ảnh và hộp đang chọn.
    ref.listen(farmAccountProvider, (previous, next) {
      if (previous != next) _reset();
    });
    final boxes = ref.watch(captureBoxesProvider(_query));
    final page = boxes.value;
    final list = [
      for (final b in page?.items ?? const <BoxSlot>[])
        if (!_forRequest || (b.slotCode == widget.initialSlot && b.batchCode == widget.requestBatchCode)) b,
    ];
    final selected = _picked ?? (_preselect && widget.initialSlot != null ? list.where((b) => b.slotCode == widget.initialSlot).firstOrNull : null);
    final closed = _expired || _fulfilled;

    return Scaffold(
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(captureBoxesProvider(_query).future),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                sliver: SliverToBoxAdapter(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SubPageHeader(title: 'Chụp ảnh tại hộp'),
                      const SizedBox(height: 14),
                      if (_forRequest) ...[_requestBanner(), const SizedBox(height: 12)],
                      if (_result != null) ...[
                        _ResultCard(result: _result!),
                        // Ảnh trả lời yêu cầu chụp mà bị gắn cờ thì yêu cầu vẫn mở: cho chụp lại đúng hộp đó.
                        if (!_forRequest || !closed) ...[
                          const SizedBox(height: 12),
                          OutlinedButton(
                            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                            onPressed: _forRequest ? () => setState(() => _result = null) : _reset,
                            child: Text(_forRequest ? 'Chụp lại' : 'Chụp hộp khác'),
                          ),
                        ],
                      ] else if (selected != null && !closed)
                        ..._shoot(selected)
                      else if (selected == null) ...[
                        if (!_forRequest)
                          TextField(
                            controller: _search,
                            keyboardType: TextInputType.number,
                            onChanged: _onSearch,
                            decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Tìm số hộp'),
                          ),
                        if (boxes.isLoading && !boxes.hasValue) const LoadingSkeleton(rows: 1),
                        if (boxes.hasError && !boxes.isLoading)
                          ErrorView(message: apiErrorMessage(boxes.error!), onRetry: () => ref.invalidate(captureBoxesProvider(_query))),
                        if (boxes.hasValue && list.isEmpty)
                          EmptyState(
                            icon: Icons.inventory_2_outlined,
                            title: _forRequest ? 'Hộp ${widget.initialSlot} không còn cua của Lô này' : 'Không có hộp đang có cua khớp số này',
                          ),
                        if (!_forRequest && page != null && page.hasMore)
                          Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Text('Gõ số hộp để tìm trong ${formatCount(page.total)} hộp.', style: Theme.of(context).textTheme.bodySmall),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
              if (selected == null && _result == null && !_forRequest)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      childAspectRatio: 1.25,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, i) => _BoxChoice(box: list[i], onTap: () => setState(() => _picked = list[i])),
                      childCount: list.length,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _requestBanner() {
    final (text, color) = _fulfilled
        ? ('Yêu cầu chụp đã hoàn thành', AppColors.success)
        : _expired
        ? ('Yêu cầu chụp đã quá hạn', AppColors.danger)
        : ('Chụp hộp ${widget.initialSlot} · ${widget.requestDueAt == null ? '' : formatDueIn(widget.requestDueAt!)}', AppColors.accentText);
    return Text(
      text,
      style: TextStyle(color: color, fontWeight: FontWeight.w700),
    );
  }

  List<Widget> _shoot(BoxSlot box) => [
    Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Hộp ${box.slotCode}', style: Theme.of(context).textTheme.titleLarge),
              Text(box.batchCode ?? '', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        if (!_forRequest) TextButton(onPressed: _sending ? null : _reset, child: const Text('Đổi hộp')),
      ],
    ),
    const SizedBox(height: 12),
    IgnorePointer(
      ignoring: _sending,
      child: PhotoField(
        photo: _photo,
        label: 'Chụp rõ số hộp',
        onChanged: (photo) => setState(() {
          _photo = photo;
          _error = null;
        }),
      ),
    ),
    if (_error != null) ...[const SizedBox(height: 10), Text(_error!, style: const TextStyle(color: AppColors.danger))],
    const SizedBox(height: 16),
    FilledButton(onPressed: _sending || _photo == null ? null : () => _send(box), child: Text(_sending ? 'Đang gửi…' : 'Gửi ảnh')),
  ];
}

/// Một hộp trong lưới chọn hộp cần chụp. Ảnh gần nhất bị gắn cờ hoặc bị loại thì nhắc chụp lại.
class _BoxChoice extends StatelessWidget {
  const _BoxChoice({required this.box, required this.onTap});
  final BoxSlot box;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = box.latestEvidence?.reviewStatus;
    final retake = status == 'Flagged' || status == 'Rejected';
    return Material(
      color: retake ? AppColors.danger.withValues(alpha: 0.14) : AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(box.slotCode, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            if (retake)
              const Text(
                'Chụp lại',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.danger),
              ),
          ],
        ),
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});
  final EvidenceResult result;

  @override
  Widget build(BuildContext context) {
    final flagged = result.reviewStatus == 'Flagged';
    final title = flagged
        ? 'Ảnh cần thẩm định'
        : result.reviewStatus == 'Watch'
        ? 'Đã lưu ảnh, cần theo dõi'
        : 'Đã lưu ảnh';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(flagged ? Icons.flag_outlined : Icons.check_circle_outline_rounded, color: flagged ? AppColors.danger : AppColors.success),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
            ],
          ),
          if (result.duplicateMatch != 'None') ...[
            const SizedBox(height: 6),
            Text(
              result.duplicateMatch == 'Exact' ? 'Ảnh trùng với ảnh đã gửi trước đó.' : 'Ảnh giống một ảnh đã gửi, sẽ được kiểm tra lại.',
              style: const TextStyle(color: AppColors.danger),
            ),
          ],
        ],
      ),
    );
  }
}

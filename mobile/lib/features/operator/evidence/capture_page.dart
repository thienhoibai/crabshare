import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/dates.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_models.dart';
import 'evidence_camera.dart';
import 'evidence_repository.dart';
import 'capture_requests_repository.dart';

class CapturePage extends ConsumerStatefulWidget {
  const CapturePage({
    super.key,
    this.initialSlot,
    this.captureRequestId,
    this.requestBatchCode,
    this.requestDueAt,
  });
  final String? initialSlot;
  final int? captureRequestId;
  final String? requestBatchCode;
  final DateTime? requestDueAt;
  @override
  ConsumerState<CapturePage> createState() => _CapturePageState();
}

class _CapturePageState extends ConsumerState<CapturePage> {
  final _search = TextEditingController();
  String? _slot;
  EvidencePhoto? _photo;
  EvidenceResult? _result;
  String? _error;
  bool _capturing = false;
  bool _sending = false;
  bool get _busy => _capturing || _sending;
  Timer? _requestTimer;
  bool get _requestExpired =>
      widget.requestDueAt != null &&
      DateTime.now().isAfter(widget.requestDueAt!);
  bool get _requestFinished =>
      widget.captureRequestId != null &&
      _result?.captureRequestStatus == 'Fulfilled';
  @override
  void initState() {
    super.initState();
    _slot = widget.initialSlot;
    if (widget.captureRequestId != null) {
      _requestTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _search.dispose();
    _requestTimer?.cancel();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    if (_busy) return;
    if (_requestExpired || _requestFinished) return;
    final userId = ref.read(sessionProvider).user?.userId;
    setState(() {
      _capturing = true;
      _error = null;
    });
    try {
      final photo = await ref.read(evidenceCameraProvider).capture();
      if (!mounted || ref.read(sessionProvider).user?.userId != userId) return;
      if (photo != null) {
        setState(() {
          _photo = photo;
          _result = null;
        });
      }
    } catch (error) {
      if (!mounted || ref.read(sessionProvider).user?.userId != userId) return;
      setState(() {
        _error = error is EvidenceCaptureException
            ? error.message
            : error is FormatException
            ? error.message
            : error is PlatformException
            ? 'Không mở được camera hoặc vị trí. Hãy kiểm tra quyền ứng dụng.'
            : 'Chưa lấy được ảnh và vị trí. Hãy bật GPS và thử lại.';
      });
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _send(BoxSlot box) async {
    if (_busy || _photo == null) return;
    if (_requestExpired || _requestFinished) return;
    final userId = ref.read(sessionProvider).user?.userId;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(evidenceRepositoryProvider)
          .upload(
            box: box,
            photo: _photo!,
            captureRequestId: widget.captureRequestId,
          );
      if (!mounted || ref.read(sessionProvider).user?.userId != userId) return;
      setState(() {
        _result = result;
        _photo = null;
        _slot = null;
      });
      ref.invalidate(captureBoxesProvider);
      ref.invalidate(captureRequestsProvider);
      if (_requestFinished) _requestTimer?.cancel();
    } catch (error) {
      if (mounted && ref.read(sessionProvider).user?.userId == userId) {
        setState(() => _error = apiErrorMessage(error));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionProvider.select((session) => session.user?.userId), (
      previous,
      next,
    ) {
      if (previous != next) {
        setState(() {
          _photo = null;
          _result = null;
          _slot = null;
          _error = null;
        });
      }
    });
    final boxes = ref.watch(captureBoxesProvider);
    final list = boxes.isLoading || boxes.hasError
        ? const <BoxSlot>[]
        : boxes.value ?? const <BoxSlot>[];
    final allowed = widget.captureRequestId == null
        ? list
        : list
              .where(
                (box) =>
                    box.slotCode == widget.initialSlot &&
                    box.batchCode == widget.requestBatchCode,
              )
              .map(
                (box) => box.latestEvidence?.id != _result?.id
                    ? BoxSlot(
                        slotCode: box.slotCode,
                        status: box.status,
                        batchCode: box.batchCode,
                      )
                    : box,
              )
              .toList();
    final selected = allowed.where((box) => box.slotCode == _slot).firstOrNull;
    final visible = allowed
        .where((box) => box.slotCode.contains(_search.text.trim()))
        .toList();
    return Scaffold(
      bottomNavigationBar: selected == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
                child: _CaptureSheet(
                  box: selected,
                  photo: _photo,
                  busy: _busy,
                  disabled: _requestExpired || _requestFinished,
                  capturing: _capturing,
                  onShoot: _takePhoto,
                  onSend: () => _send(selected),
                ),
              ),
            ),
      body: SafeArea(
        child: AppRefreshIndicator(
          onRefresh: () => ref.refresh(captureBoxesProvider.future),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                sliver: SliverToBoxAdapter(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SubPageHeader(title: 'Chụp bằng chứng'),
                      const SizedBox(height: 14),
                      if (widget.captureRequestId != null) ...[
                        Text(
                          _requestFinished
                              ? 'Yêu cầu chụp đã hoàn thành'
                              : _requestExpired
                              ? 'Yêu cầu chụp đã quá hạn. Vui lòng quay lại Hôm nay để cập nhật.'
                              : 'Chụp hộp ${widget.initialSlot} · ${widget.requestDueAt == null ? '' : formatDueIn(widget.requestDueAt!)}',
                          style: TextStyle(
                            color: _requestFinished
                                ? AppColors.success
                                : _requestExpired
                                ? AppColors.danger
                                : AppColors.accentText,
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      AppCard(
                        color: AppColors.ink,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Số hộp phải rõ trong ảnh',
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(color: Colors.white),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Chụp trực tiếp bằng camera. Vị trí và giờ chụp được gửi cùng ảnh để kiểm tra bằng chứng.',
                              style: TextStyle(
                                color: Color(0xFFD7D2CD),
                                height: 1.45,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _search,
                        enabled: !_busy,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search_rounded),
                          hintText: 'Tìm số hộp (0014, 0143…)',
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                      const SizedBox(height: 12),
                      if (_error != null) ...[
                        Text(
                          _error!,
                          style: const TextStyle(color: AppColors.danger),
                        ),
                        if (!_sending && _photo == null)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton(
                              onPressed: () => ref
                                  .read(evidenceCameraProvider)
                                  .openSettings(),
                              child: const Text('Mở cài đặt'),
                            ),
                          ),
                        const SizedBox(height: 12),
                      ],
                      if (_result != null) ...[
                        _ResultCard(result: _result!),
                        const SizedBox(height: 14),
                      ],
                      if (boxes.isLoading) const LoadingSkeleton(rows: 1),
                      if (boxes.hasError)
                        ErrorView(
                          message: apiErrorMessage(boxes.error!),
                          onRetry: () => ref.invalidate(captureBoxesProvider),
                        ),
                      if (boxes.hasValue && visible.isEmpty)
                        const EmptyState(
                          icon: Icons.inventory_2_outlined,
                          title: 'Chưa có hộp phù hợp',
                          message:
                              'Chỉ hiện hộp đang được gán cho lô đang nuôi.',
                        ),
                      if (boxes.hasValue && visible.isNotEmpty)
                        SectionHeader(
                          title: 'Chọn hộp đang nuôi',
                          actionLabel: '${visible.length}',
                        ),
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                sliver: SliverGrid(
                  delegate: SliverChildBuilderDelegate((context, index) {
                    final box = visible[index];
                    final selected = box.slotCode == _slot;
                    return _BoxTile(
                      box: box,
                      selected: selected,
                      onTap: _busy || _requestExpired || _requestFinished
                          ? null
                          : () => setState(() {
                              _slot = box.slotCode;
                              _photo = null;
                              _error = null;
                            }),
                    );
                  }, childCount: visible.length),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 4,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.9,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _evidenceLabel(String status) => switch (status) {
  'Flagged' => 'Cần kiểm tra',
  'Rejected' => 'Chụp lại',
  'Watch' => 'Theo dõi',
  _ => 'Đã gửi',
};

class _BoxTile extends StatelessWidget {
  const _BoxTile({
    required this.box,
    required this.selected,
    required this.onTap,
  });
  final BoxSlot box;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final evidence = box.latestEvidence;
    final needsAttention =
        evidence?.reviewStatus == 'Flagged' ||
        evidence?.reviewStatus == 'Rejected';
    final color = needsAttention
        ? AppColors.danger
        : evidence?.reviewStatus == 'Watch'
        ? AppColors.accentText
        : AppColors.success;
    return Material(
      color: selected ? AppColors.ink : AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: evidence == null || selected
            ? BorderSide.none
            : BorderSide(color: color),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                box.slotCode,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: selected ? Colors.white : AppColors.ink,
                ),
              ),
              if (evidence != null) ...[
                const SizedBox(height: 4),
                Icon(
                  needsAttention
                      ? Icons.flag_outlined
                      : evidence.reviewStatus == 'Watch'
                      ? Icons.visibility_outlined
                      : Icons.check_circle_outline_rounded,
                  size: 16,
                  color: color,
                ),
                const SizedBox(height: 2),
                Text(
                  _evidenceLabel(evidence.reviewStatus),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  style: TextStyle(
                    fontSize: 10,
                    color: selected ? Colors.white : color,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CaptureSheet extends StatelessWidget {
  const _CaptureSheet({
    required this.box,
    required this.photo,
    required this.busy,
    this.disabled = false,
    required this.capturing,
    required this.onShoot,
    required this.onSend,
  });
  final BoxSlot box;
  final EvidencePhoto? photo;
  final bool busy;
  final bool disabled;
  final bool capturing;
  final VoidCallback onShoot;
  final VoidCallback onSend;
  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: photo == null
                  ? Container(
                      width: 56,
                      height: 56,
                      color: AppColors.surfaceMuted,
                      child: const Icon(Icons.photo_camera_outlined),
                    )
                  : Image.memory(
                      photo!.bytes,
                      width: 56,
                      height: 56,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) =>
                          const SizedBox(
                            width: 56,
                            height: 56,
                            child: Icon(Icons.broken_image_outlined),
                          ),
                    ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Hộp ${box.slotCode}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    box.batchCode ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            SizedBox(
              width: 130,
              child: FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(90, 46)),
                onPressed: busy || disabled
                    ? null
                    : (photo == null ? onShoot : onSend),
                child: Text(
                  busy
                      ? capturing
                            ? 'Đang chụp…'
                            : 'Đang gửi…'
                      : photo == null
                      ? 'Chụp'
                      : 'Gửi ảnh',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
        ),
        if (photo != null)
          Row(
            children: [
              Expanded(
                child: Text(
                  'Đã lấy vị trí lúc chụp',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              TextButton(
                onPressed: busy || disabled ? null : onShoot,
                child: const Text('Chụp lại'),
              ),
            ],
          ),
        if (photo == null && box.latestEvidence != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              '${_evidenceLabel(box.latestEvidence!.reviewStatus)} · ${formatTime(box.latestEvidence!.receivedAt)} ${formatDayMonth(box.latestEvidence!.receivedAt)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
      ],
    ),
  );
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
        ? 'Đã lưu ảnh — cần theo dõi'
        : 'Đã lưu bằng chứng';
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                flagged
                    ? Icons.flag_outlined
                    : Icons.check_circle_outline_rounded,
                color: flagged ? AppColors.danger : AppColors.success,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text('Bằng chứng #${result.id}'),
          if (result.duplicateMatch != 'None')
            Text(
              result.duplicateMatch == 'Exact'
                  ? 'Ảnh trùng với ảnh đã gửi trước đó.'
                  : 'Ảnh tương tự bằng chứng đã có. Người thẩm định sẽ kiểm tra.',
              style: const TextStyle(color: AppColors.danger),
            ),
          if (result.crabDetected == null)
            Text(
              'Chưa có kết luận nhận diện cua.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
    );
  }
}

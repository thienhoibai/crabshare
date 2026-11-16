import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/incoming_repository.dart';
import '../data/qc_models.dart';
import '../data/qc_repository.dart';
import '../widgets/qc_parts.dart';
import 'crab_form.dart';

/// Kiểm đầu vào một phiếu nhận hàng, làm tại trại: một dòng tiến độ, ô kiểm nhanh từng con, rồi hoàn tất phiếu.
/// Con đạt được máy chủ cấp mã cua nội bộ; danh sách cua đã đạt và thông tin lô nguồn nằm trong phần gấp lại.
class IncomingReceiptPage extends ConsumerWidget {
  const IncomingReceiptPage({super.key, required this.receiptNo, this.batchCode});
  final String receiptNo;

  /// Mã Lô của phiếu; không có thì tra qua việc đang chờ của tôi.
  final String? batchCode;

  Future<void> _complete(BuildContext context, WidgetRef ref, GoodsReceipt r) async {
    final ok = await showConfirmSheet(
      context,
      title: 'Hoàn tất phiếu',
      message:
          'Đạt ${r.acceptedCount} · Loại ${r.rejectedCount} · Chưa kiểm ${r.left}.'
          '${r.left > 0 ? ' Hoàn tất rồi không kiểm thêm được.' : ''}',
      confirmLabel: 'Hoàn tất',
      danger: r.left > 0,
    );
    if (ok == null || !context.mounted) return;
    try {
      await ref.read(receiptProvider(receiptNo).notifier).complete();
      if (!context.mounted) return;
      ref.invalidate(batchReceiptsProvider);
      ref.invalidate(qcTasksProvider);
      showAppToast(context, 'Đã hoàn tất phiếu nhận hàng.');
    } catch (error) {
      if (context.mounted) showAppToast(context, qcErrorMessage(error), error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final receipt = ref.watch(receiptProvider(receiptNo));
    final lookup = batchCode == null ? ref.watch(receiptBatchCodeProvider(receiptNo)) : null;
    final code = batchCode ?? lookup?.value;
    final headValue = code == null ? null : ref.watch(batchHeadProvider(code));
    final head = headValue?.value;
    // Giới tính và độ trưởng thành mặc định lấy theo loại cua của Lô, nên chưa biết loại cua thì chưa cho ghi.
    final findingBatch = (lookup?.isLoading ?? false) || (headValue?.isLoading ?? false);
    final me = ref.watch(myUserIdProvider);

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: SubPageHeader(title: receiptNo),
            ),
            Expanded(
              child: AsyncContent<GoodsReceipt>(
                value: keepData(receipt),
                onRefresh: () {
                  ref.invalidate(receiptBatchCodeProvider(receiptNo));
                  if (code != null) ref.invalidate(batchHeadProvider(code));
                  return ref.refresh(receiptProvider(receiptNo).future);
                },
                data: (r) {
                  final mine = r.qcUserId == me;
                  return SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _Progress(receipt: r, caption: [if (code != null) 'Lô $code', if (head != null) statusLabel('crabType', head.crabType)].join(' · ')),
                        const SizedBox(height: 12),
                        if (r.isOpen && !mine)
                          const QcNote('Phiếu này phân cho người kiểm khác.')
                        else if (r.isOpen) ...[
                          if (head != null)
                            CrabForm(
                              key: const ValueKey('crab-form'),
                              receiptNo: receiptNo,
                              index: r.inspected + 1,
                              left: r.left,
                              crabType: head.crabType,
                              batchCode: code,
                              lotCode: r.lotCode,
                            )
                          else if (findingBatch)
                            const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator(strokeWidth: 3)))
                          else
                            const QcNote('Chưa tải được loại cua của Lô. Kéo xuống để tải lại.', color: AppColors.danger),
                          const SizedBox(height: 12),
                          if (r.left == 0)
                            FilledButton.icon(
                              onPressed: () => _complete(context, ref, r),
                              icon: const Icon(Icons.check_circle_outline_rounded),
                              label: const Text('Hoàn tất phiếu'),
                            )
                          else
                            OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size.fromHeight(52),
                                foregroundColor: AppColors.ink,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
                              ),
                              onPressed: r.inspected == 0 ? null : () => _complete(context, ref, r),
                              icon: const Icon(Icons.check_circle_outline_rounded),
                              label: const Text('Hoàn tất phiếu'),
                            ),
                        ],
                        if (r.acceptedCount > 0 && code != null)
                          MoreSection(
                            label: 'Cua đã đạt · ${r.acceptedCount}',
                            initiallyOpen: !r.isOpen,
                            children: [_AcceptedCrabs(batchCode: code, lotCode: r.lotCode)],
                          ),
                        MoreSection(
                          label: 'Lô nguồn',
                          children: [
                            KeyValueList(
                              rows: [
                                ('Vùng xuất xứ', r.originRegion),
                                ('Ngày thu', r.harvestedOn == null ? null : formatDate(r.harvestedOn!)),
                                ('Khai báo', '${r.declaredCount} con · ${formatNum(r.declaredWeightKg, 3)} kg'),
                                ('Nhận lúc', '${formatTime(r.receivedAt)} ${formatDate(r.receivedAt)}'),
                                ('Mã lô nguồn', r.lotCode),
                                ('Đơn mua nguồn', r.poNo),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Một dòng tiến độ: đã kiểm / khai báo, đạt / loại.
class _Progress extends StatelessWidget {
  const _Progress({required this.receipt, required this.caption});
  final GoodsReceipt receipt;
  final String caption;

  @override
  Widget build(BuildContext context) {
    final r = receipt;
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (caption.isNotEmpty || !r.isOpen) ...[
            Row(
              children: [
                Expanded(child: Text(caption, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall)),
                // Phiếu đang kiểm thì ô nhập đã nói lên trạng thái; chỉ gắn chip khi phiếu đã đóng.
                if (!r.isOpen) StatusPill(kind: 'receipt', value: r.status),
              ],
            ),
            const SizedBox(height: 4),
          ],
          Row(
            children: [
              Expanded(
                child: Text('Đã kiểm ${r.inspected} / ${r.declaredCount} con', style: Theme.of(context).textTheme.titleMedium),
              ),
              Text.rich(
                TextSpan(
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
                  children: [
                    TextSpan(text: 'Đạt ${r.acceptedCount}', style: const TextStyle(color: AppColors.success)),
                    const TextSpan(text: ' · ', style: TextStyle(color: AppColors.inkMuted)),
                    TextSpan(
                      text: 'Loại ${r.rejectedCount}',
                      style: TextStyle(color: r.rejectedCount > 0 ? AppColors.danger : AppColors.inkMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SoftProgressBar(value: r.declaredCount == 0 ? 0 : r.inspected / r.declaredCount),
        ],
      ),
    );
  }
}

/// Cua đã đạt của lô nguồn này kèm mã cua nội bộ, mới nhất trước. Chỉ tải khi mở phần gấp.
class _AcceptedCrabs extends ConsumerWidget {
  const _AcceptedCrabs({required this.batchCode, required this.lotCode});
  final String batchCode;
  final String lotCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final crabs = ref.watch(acceptedCrabsProvider((batchCode, lotCode)));
    return crabs.when(
      skipLoadingOnReload: true,
      loading: () => const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator(strokeWidth: 3))),
      error: (error, _) => Text(qcErrorMessage(error), style: const TextStyle(color: AppColors.danger)),
      data: (list) => Column(
        children: [
          for (final c in list)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.crabCode, style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                        Text('${statusLabel('sex', c.sex)} · ${statusLabel('maturity', c.maturity)}', style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  Text('${formatNum(c.receivedWeightG, 1)} g', style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

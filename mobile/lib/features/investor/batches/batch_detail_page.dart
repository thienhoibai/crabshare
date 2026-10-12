import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_images.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/models/batch_enums.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/investor_models.dart';
import '../data/investor_repository.dart';

/// Chi tiết lô: ảnh lớn, điều khoản đã công bố, tiến độ gọi vốn / chu kỳ nuôi, dòng thời gian.
/// Không hiển thị lợi suất kỳ vọng (TL-05 §8, BR-49).
class BatchDetailPage extends ConsumerWidget {
  const BatchDetailPage({super.key, required this.code});

  final String code;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final batch = ref.watch(batchDetailProvider(code));
    return Scaffold(
      body: batch.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => SafeArea(child: ErrorView(message: apiErrorMessage(e), onRetry: () => ref.invalidate(batchDetailProvider(code)))),
        data: (b) => _Body(batch: b),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.batch});

  final BatchSummary batch;

  @override
  Widget build(BuildContext context) {
    final b = batch;
    final text = Theme.of(context).textTheme;
    final isFunding = b.status == BatchStatus.funding;

    return Stack(
      children: [
        ListView(
          padding: EdgeInsets.zero,
          children: [
            Stack(
              children: [
                Image.asset(b.crabType.image, height: 330, width: double.infinity, fit: BoxFit.cover),
                Positioned(
                  left: 16,
                  top: MediaQuery.paddingOf(context).top + 8,
                  child: CircleIconButton(icon: Icons.arrow_back_rounded, onTap: () => Navigator.of(context).maybePop()),
                ),
                Positioned(left: 16, bottom: 36, child: InfoChip(icon: Icons.circle, label: b.status.label)),
              ],
            ),
            Transform.translate(
              offset: const Offset(0, -24),
              child: Container(
                decoration: const BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 120),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.code, style: text.bodySmall),
                    const SizedBox(height: 4),
                    Text(b.title, style: text.headlineMedium),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const CircleAvatar(radius: 18, backgroundImage: AssetImage(AppImages.farmer)),
                        const SizedBox(width: 10),
                        Expanded(child: Text(b.operatorName, style: text.titleMedium)),
                        const InfoChip(icon: Icons.verified_rounded, label: 'Hộ nuôi đã duyệt', background: AppColors.accentSoft, foreground: AppColors.accentText),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(child: _Fact(icon: Icons.set_meal_outlined, label: 'Loại cua', value: b.crabType.label)),
                        const SizedBox(width: 10),
                        Expanded(child: _Fact(icon: Icons.timelapse_rounded, label: 'Chu kỳ', value: '${b.cycleDays} ngày')),
                        const SizedBox(width: 10),
                        Expanded(child: _Fact(icon: Icons.grid_view_rounded, label: 'Con giống', value: formatCount(b.seedQuantity))),
                      ],
                    ),
                    const SizedBox(height: 14),
                    if (isFunding) _FundingCard(batch: b) else _ProductionCard(batch: b),
                    const SectionHeader(title: 'Tiến trình lô'),
                    _Timeline(current: b.status),
                    const SizedBox(height: 16),
                    AppCard(
                      color: AppColors.surfaceMuted,
                      child: Text(
                        'CrabShare không cam kết lợi nhuận. Khoản chia khi quyết toán = doanh thu thực thu từ đơn hàng '
                        'trừ chi phí chuẩn đã khoá trước khi gọi vốn, chia theo tỷ lệ vốn; lỗ tối đa bằng số vốn đã góp.',
                        style: text.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        if (isFunding)
          Positioned(
            left: 20,
            right: 20,
            bottom: MediaQuery.paddingOf(context).bottom + 16,
            child: FilledButton(
              onPressed: () => _showContributeFlow(context, b),
              child: Text('Góp vốn · tối thiểu ${formatVnd(b.minContribution)}'),
            ),
          ),
      ],
    );
  }

  /// Luồng góp vốn ≤ 5 màn hình (Phiếu, yêu cầu Usability). Mỗi bước là một task riêng.
  void _showContributeFlow(BuildContext context, BatchSummary b) {
    const steps = [
      ('Xác nhận công bố rủi ro', 'Đọc và xác nhận bản RD hiện hành'),
      ('Chọn số tiền & giữ chỗ', 'Giữ suất trong thời hạn thanh toán'),
      ('Ký hợp đồng điện tử', 'Ký số theo thứ tự qua dịch vụ ký Viettel (sandbox)'),
      ('Thanh toán VietQR', 'Chuyển vào tài khoản chuyên dùng của lô'),
      ('Hoàn tất', 'Tiền được xác nhận khi có thông báo giao dịch'),
    ];
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.background,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Góp vốn lô ${b.code}', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              for (final (i, step) in steps.indexed)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(
                    backgroundColor: i == 0 ? AppColors.accent : AppColors.surfaceMuted,
                    foregroundColor: AppColors.ink,
                    child: Text('${i + 1}'),
                  ),
                  title: Text(step.$1, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(step.$2),
                ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Bắt đầu (đang xây dựng)'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
      child: Column(
        children: [
          Icon(icon, color: AppColors.accentText),
          const SizedBox(height: 6),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _FundingCard extends StatelessWidget {
  const _FundingCard({required this.batch});

  final BatchSummary batch;

  @override
  Widget build(BuildContext context) {
    final b = batch;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: Text(formatVnd(b.raisedCapital), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
              Text('${(b.fundingProgress * 100).round()}% mục tiêu', style: const TextStyle(color: AppColors.accentText, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          SoftProgressBar(value: b.fundingProgress, height: 10),
          const SizedBox(height: 10),
          MetricRow(metrics: [
            Metric('mục tiêu', formatMillions(b.targetCapital)),
            Metric('tối thiểu', formatMillions(b.minContribution), color: AppColors.ink),
            if (b.fundingDeadline != null) Metric('hạn', formatDate(b.fundingDeadline!), color: AppColors.success),
          ]),
        ],
      ),
    );
  }
}

class _ProductionCard extends StatelessWidget {
  const _ProductionCard({required this.batch});

  final BatchSummary batch;

  @override
  Widget build(BuildContext context) {
    final b = batch;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  b.aliveCount == null ? '—' : '${formatCount(b.aliveCount!)} con',
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                ),
              ),
              Text('Ngày ${b.dayOfCycle ?? '—'}/${b.cycleDays}', style: const TextStyle(color: AppColors.accentText, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          SoftProgressBar(value: b.cycleProgress, height: 10),
          const SizedBox(height: 10),
          MetricRow(metrics: [
            Metric('vốn đã khoá', formatMillions(b.raisedCapital)),
            Metric('cảnh báo mở', '${b.openAlerts}', color: b.openAlerts > 0 ? AppColors.danger : AppColors.success),
            if (b.expectedHarvestDate != null) Metric('dự kiến thu', formatDayMonth(b.expectedHarvestDate!), color: AppColors.ink),
          ]),
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.current});

  final BatchStatus current;

  @override
  Widget build(BuildContext context) {
    final steps = BatchStatus.timeline;
    final currentIndex = steps.indexOf(current);
    return AppCard(
      child: Column(
        children: [
          for (final (i, s) in steps.indexed)
            Row(
              children: [
                Column(
                  children: [
                    Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i < currentIndex
                            ? AppColors.ink
                            : i == currentIndex
                                ? AppColors.accent
                                : AppColors.surfaceMuted,
                      ),
                      child: i < currentIndex ? const Icon(Icons.check_rounded, size: 14, color: Colors.white) : null,
                    ),
                    if (i < steps.length - 1) Container(width: 2, height: 22, color: AppColors.surfaceMuted),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 22),
                    child: Text(
                      s.label,
                      style: TextStyle(fontWeight: i == currentIndex ? FontWeight.w700 : FontWeight.w500, color: i > currentIndex ? AppColors.inkMuted : AppColors.ink),
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

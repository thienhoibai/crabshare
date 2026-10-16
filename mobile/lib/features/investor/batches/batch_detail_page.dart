import 'package:dio/dio.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/theme/app_images.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/models/batch_enums.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/investor_models.dart';
import '../data/investor_repository.dart';

/// Chi tiết lô: điều khoản công bố, chi phí đã khóa và tiến độ gọi vốn từ API.
/// Không hiển thị lợi suất kỳ vọng (TL-05 §8, BR-49).
class BatchDetailPage extends ConsumerWidget {
  const BatchDetailPage({super.key, required this.code});

  final String code;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final batch = ref.watch(batchDetailProvider(code));
    return Scaffold(
      body: AppRefreshIndicator(
        onRefresh: () => ref.refresh(batchDetailProvider(code).future),
        child: batch.when(
          loading: () => SafeArea(
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const [
                Padding(
                  padding: EdgeInsets.all(20),
                  child: SubPageHeader(title: 'Chi tiết lô'),
                ),
                LoadingSkeleton(),
              ],
            ),
          ),
          error: (e, _) => SafeArea(
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const Padding(
                  padding: EdgeInsets.all(20),
                  child: SubPageHeader(title: 'Chi tiết lô'),
                ),
                ErrorView(
                  message:
                      e is DioException &&
                          [403, 404].contains(e.response?.statusCode)
                      ? 'Lô không tồn tại hoặc không còn được phép xem.'
                      : apiErrorMessage(e),
                  onRetry: () => ref.invalidate(batchDetailProvider(code)),
                ),
              ],
            ),
          ),
          data: (b) => _Body(batch: b),
        ),
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
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          children: [
            Stack(
              children: [
                Image.asset(
                  b.crabType.image,
                  height: 330,
                  width: double.infinity,
                  fit: BoxFit.cover,
                ),
                Positioned(
                  left: 16,
                  top: MediaQuery.paddingOf(context).top + 8,
                  child: CircleIconButton(
                    icon: Icons.arrow_back_rounded,
                    onTap: () => Navigator.of(context).maybePop(),
                  ),
                ),
                Positioned(
                  left: 16,
                  bottom: 36,
                  child: InfoChip(icon: Icons.circle, label: b.status.label),
                ),
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
                        const CircleAvatar(
                          radius: 18,
                          backgroundImage: AssetImage(AppImages.farmer),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(b.operatorName, style: text.titleMedium),
                              const SizedBox(height: 6),
                              const InfoChip(
                                icon: Icons.verified_rounded,
                                label: 'Hộ nuôi đã duyệt',
                                background: AppColors.accentSoft,
                                foreground: AppColors.accentText,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: _Fact(
                            icon: Icons.set_meal_outlined,
                            label: 'Loại cua',
                            value: b.crabType.label,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _Fact(
                            icon: Icons.timelapse_rounded,
                            label: 'Chu kỳ',
                            value: '${b.cycleDays} ngày',
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _Fact(
                            icon: Icons.grid_view_rounded,
                            label: 'Con giống',
                            value: formatCount(b.seedQuantity),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _FundingCard(batch: b),
                    _PublishedTerms(batch: b),
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
              child: Text(
                'Góp vốn · tối thiểu ${formatVnd(b.minContribution)}',
              ),
            ),
          ),
      ],
    );
  }

  /// Luồng góp vốn ≤ 5 màn hình (Phiếu, yêu cầu Usability) chạy trên web (TH-04): app chỉ giới thiệu các bước
  /// rồi mở trang /nha-dau-tu/gop-von/{mã lô} bằng trình duyệt của máy.
  void _showContributeFlow(BuildContext context, BatchSummary b) {
    const steps = [
      ('Xác nhận công bố rủi ro', 'Đọc và xác nhận bản RD hiện hành'),
      ('Chọn số tiền & giữ chỗ', 'Giữ suất trong thời hạn thanh toán'),
      (
        'Ký hợp đồng điện tử',
        'Ký số theo thứ tự qua dịch vụ ký Viettel (sandbox)',
      ),
      ('Thanh toán VietQR', 'Chuyển vào tài khoản chuyên dùng của lô'),
      ('Hoàn tất', 'Tiền được xác nhận khi có thông báo giao dịch'),
    ];
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.background,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Góp vốn lô ${b.code}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              for (final (i, step) in steps.indexed)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(
                    backgroundColor: i == 0
                        ? AppColors.accent
                        : AppColors.surfaceMuted,
                    foregroundColor: AppColors.ink,
                    child: Text('${i + 1}'),
                  ),
                  title: Text(
                    step.$1,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(step.$2),
                ),
              const SizedBox(height: 8),
              Text(
                'Các bước làm trên web CrabShare, đăng nhập bằng cùng tài khoản.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () => _openWebFlow(context, b.code),
                icon: const Icon(Icons.open_in_new_rounded),
                label: const Text('Mở trang góp vốn'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openWebFlow(BuildContext context, String code) async {
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).pop();
    try {
      final opened = await launchUrl(
        Uri.parse('$webUrl/nha-dau-tu/gop-von/${Uri.encodeComponent(code)}'),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && messenger.mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text(
              'Không mở được trình duyệt. Thử lại hoặc mở web CrabShare.',
            ),
          ),
        );
      }
    } catch (_) {
      if (messenger.mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text(
              'Không mở được trình duyệt. Thử lại hoặc mở web CrabShare.',
            ),
          ),
        );
      }
    }
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
              Expanded(
                child: Text(
                  formatVnd(b.raisedCapital),
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Flexible(
                child: Text(
                  '${b.discoveryProgress?.percentLabel ?? '—'} mục tiêu',
                  textAlign: TextAlign.end,
                  style: const TextStyle(
                    color: AppColors.accentText,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SoftProgressBar(
            value: b.discoveryProgress?.barValue ?? 0,
            height: 10,
          ),
          const SizedBox(height: 10),
          MetricRow(
            metrics: [
              Metric('mục tiêu', formatMillions(b.targetCapital)),
              Metric(
                'tối thiểu',
                formatMillions(b.minContribution),
                color: AppColors.ink,
              ),
              if (b.fundingDeadline != null)
                Metric(
                  'hạn',
                  formatDate(b.fundingDeadline!),
                  color: AppColors.success,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PublishedTerms extends StatelessWidget {
  const _PublishedTerms({required this.batch});
  final BatchSummary batch;
  @override
  Widget build(BuildContext context) {
    final b = batch;
    final cost = b.standardCost;
    Widget term(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label)),
          const SizedBox(width: 12),
          Flexible(child: Text(value, textAlign: TextAlign.end)),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Điều khoản đã công bố'),
        AppCard(
          child: Column(
            children: [
              term(
                'Vốn khả thi tối thiểu',
                b.minViableCapital == null
                    ? '—'
                    : formatVnd(b.minViableCapital!),
              ),
              term(
                'Vốn tối đa',
                b.maxCapital == null ? '—' : formatVnd(b.maxCapital!),
              ),
              term('Góp tối thiểu', formatVnd(b.minContribution)),
              term('Sản lượng dự kiến', '${b.expectedOutputKg ?? '—'} kg'),
              term('Hạn bổ sung giống', '${b.restockCutoffDays ?? '—'} ngày'),
              term('Tỷ lệ hộ nuôi', '${b.operatorSharePct ?? '—'}%'),
              if (b.fundingOpenAt != null)
                term('Mở gọi vốn', formatDate(b.fundingOpenAt!)),
              if (b.fundingDeadline != null)
                term('Hạn gọi vốn', formatDate(b.fundingDeadline!)),
              term(
                'Vốn giữ chỗ',
                formatVnd(b.discoveryProgress?.reservedCapital ?? 0),
              ),
              term('Nhà đầu tư', '${b.discoveryProgress?.investorCount ?? 0}'),
            ],
          ),
        ),
        const SectionHeader(title: 'Chi phí chuẩn đã khóa'),
        AppCard(
          child: cost == null
              ? const Text('Chưa có bản chi phí đã khóa được công bố.')
              : Column(
                  children: [
                    term('Phiên bản', '${cost.versionNo} · ${cost.status}'),
                    if (cost.lockedAt != null)
                      term('Ngày khóa', formatDate(cost.lockedAt!)),
                    for (final item in cost.items)
                      term(item.category, formatVnd(item.amount)),
                    term('Tổng chi phí', formatVnd(cost.total)),
                  ],
                ),
        ),
      ],
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.current});

  final BatchStatus current;

  @override
  Widget build(BuildContext context) {
    if (current == BatchStatus.cancelled) {
      return const AppCard(child: Text('Đã huỷ'));
    }
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
                      child: i < currentIndex
                          ? const Icon(
                              Icons.check_rounded,
                              size: 14,
                              color: Colors.white,
                            )
                          : null,
                    ),
                    if (i < steps.length - 1)
                      Container(
                        width: 2,
                        height: 22,
                        color: AppColors.surfaceMuted,
                      ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 22),
                    child: Text(
                      s.label,
                      style: TextStyle(
                        fontWeight: i == currentIndex
                            ? FontWeight.w700
                            : FontWeight.w500,
                        color: i > currentIndex
                            ? AppColors.inkMuted
                            : AppColors.ink,
                      ),
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

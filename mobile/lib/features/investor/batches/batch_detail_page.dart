import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/batch_repository.dart';
import '../widgets/investor_ui.dart';

/// Trang công khai của một Lô: ảnh bìa, bốn thông tin, khối gọi vốn hoặc bảng giá theo quy cách, tiến độ.
/// Nhà đầu tư góp vốn và khách hàng đặt trước trên web; ở đây chỉ có nút mở đúng trang đó.
/// Chỉ hiện số đã phát sinh, giá và điều khoản.
class BatchDetailPage extends ConsumerWidget {
  const BatchDetailPage({super.key, required this.code});
  final String code;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = batchViewProvider(code);
    final view = ref.watch(provider);
    final user = ref.watch(sessionProvider).user;
    final loaded = view.value;
    final canFund = loaded != null && loaded.batch.isFunding && (user?.isInvestor ?? false);
    final canPreorder = loaded != null && loaded.preorderOpen && (user?.isCustomer ?? false);

    Widget framed(Widget child) => SafeArea(
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [const SubPageHeader(title: 'Lô'), const SizedBox(height: 16), child],
      ),
    );

    return Scaffold(
      body: AppRefreshIndicator(
        onRefresh: () => ref.refresh(provider.future),
        child: view.when(
          skipLoadingOnReload: true,
          loading: () => framed(const LoadingSkeleton(rows: 2)),
          error: (error, _) => framed(ErrorView(message: apiErrorMessage(error), onRetry: () => ref.invalidate(provider))),
          data: (v) => v == null
              ? framed(const EmptyState(icon: Icons.inventory_2_outlined, title: 'Lô này chưa được công bố'))
              : _Body(view: v),
        ),
      ),
      bottomNavigationBar: canFund || canPreorder
          ? _Actions(code: code, canFund: canFund, canPreorder: canPreorder)
          : null,
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.view});
  final BatchPublicView view;

  List<Fact> get _facts {
    final b = view.batch;
    return [
      Fact('Số cua', '${formatCount(b.plannedQuantity)} con'),
      Fact('Lưu nuôi', b.hasHolding && b.holdingDays != null ? '${b.holdingDays} ngày' : 'Không'),
      if (b.mode == 'P')
        Fact('Nhà đầu tư', '${b.investorCount}')
      else if (b.expectedAvgWeightG != null)
        Fact('Mỗi con khoảng', '${b.expectedAvgWeightG} g'),
      if (b.mode == 'P')
        Fact('Chi phí chuẩn', formatMillions(b.standardCostTotal))
      else if (b.deliveryRadiusKm != null)
        Fact('Bán kính giao', '${formatCount(b.deliveryRadiusKm!.round())} km'),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final b = view.batch;
    final text = Theme.of(context).textTheme;
    final progress = view.progress;
    final terms = <(String, String?)>[
      ('Hạng dự kiến', b.expectedGrade),
      ('Nhận cua dự kiến', b.expectedReceiptDate == null ? null : formatDate(b.expectedReceiptDate!)),
      ('Số ngày bán', b.saleDays == null ? null : '${b.saleDays} ngày'),
      ('Bên cam kết thu mua', b.offtakeBuyerName),
      ('Giá sàn đơn hàng cuối', b.floorPricePerKg == null ? null : '${formatVnd(b.floorPricePerKg!)} / kg'),
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        Stack(
          children: [
            Image.asset(crabImage(b.crabType), height: 250, width: double.infinity, fit: BoxFit.cover),
            Positioned(
              left: 16,
              top: MediaQuery.paddingOf(context).top + 8,
              child: CircleIconButton(icon: Icons.arrow_back_rounded, onTap: () => Navigator.of(context).maybePop()),
            ),
          ],
        ),
        Transform.translate(
          offset: const Offset(0, -24),
          // Material (không phải Container có màu) để các mục gấp bên trong vẽ được hiệu ứng chạm.
          child: Material(
            color: AppColors.background,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    [b.code, statusLabel('crabType', b.crabType), if (b.executorName.isNotEmpty) b.executorName].join(' · '),
                    style: text.bodySmall,
                  ),
                  const SizedBox(height: 4),
                  Text(b.title, style: text.headlineSmall),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      StatusPill(kind: 'batchMode', value: b.mode),
                      StatusPill(kind: 'batch', value: b.status),
                    ],
                  ),
                  const SizedBox(height: 16),
                  FactGrid(facts: _facts),
                  if (b.isFunding) ...[const SizedBox(height: 12), _FundingBlock(batch: b)],
                  if (b.offers.isNotEmpty) ...[
                    const SectionHeader(title: 'Bảng giá theo quy cách'),
                    _PriceTable(view: view),
                  ],
                  if (progress != null && progress.hasData) ...[
                    const SectionHeader(title: 'Tiến độ'),
                    FactGrid(
                      facts: [
                        Fact('Cua đang nuôi', '${formatCount(progress.crabsAlive)} con', color: AppColors.success),
                        Fact('Ngày nuôi', progress.daysRaised == null ? '—' : '${progress.daysRaised}'),
                      ],
                    ),
                  ],
                  if (!b.isFunding && !view.preorderOpen) const QuietNote('Lô này hiện không nhận góp vốn và đặt trước.'),
                  if (terms.any((t) => t.$2 != null && t.$2!.isNotEmpty))
                    MoreSection(label: 'Điều khoản bán hàng', children: [KeyValueList(rows: terms)]),
                  if (b.costByCategory.isNotEmpty)
                    MoreSection(
                      label: 'Chi phí chuẩn ${formatVnd(b.standardCostTotal)}',
                      children: [
                        KeyValueList(
                          rows: [for (final c in b.costByCategory) (statusLabel('costCategory', c.category), formatVnd(c.amount))],
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _FundingBlock extends StatelessWidget {
  const _FundingBlock({required this.batch});
  final ExploreBatch batch;

  @override
  Widget build(BuildContext context) {
    final b = batch;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Vốn đã xác nhận', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 2),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.end,
            spacing: 6,
            children: [
              Text(formatVnd(b.confirmedCapital), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              Text('/ ${formatVnd(b.targetCapital)}', style: const TextStyle(color: AppColors.inkMuted, fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 10),
          SoftProgressBar(value: b.fundingProgress, height: 10),
          const SizedBox(height: 8),
          KeyValueList(
            rows: [
              ('Còn nhận', formatVnd(b.remainingCapital)),
              ('Góp tối thiểu', formatVnd(b.minContribution)),
              ('Hạn góp vốn', b.fundingDeadline == null ? null : formatDate(b.fundingDeadline!)),
            ],
          ),
        ],
      ),
    );
  }
}

class _PriceTable extends StatelessWidget {
  const _PriceTable({required this.view});
  final BatchPublicView view;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final availability = view.availability;
    // Số còn đặt được theo từng quy cách chỉ có khi lấy được số còn lại của Lô.
    final remaining = {for (final s in availability?.specs ?? const <SpecAvailability>[]) s.specCode: s.remaining};
    final deadline = view.batch.preorderDeadline;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final o in view.batch.offers)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(o.specName, style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text(
                          [
                            'khoảng ${o.conversionWeightG} g/con',
                            if (remaining[o.specCode] != null) 'còn ${formatCount(remaining[o.specCode]!)} con',
                          ].join(' · '),
                          style: text.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text('${formatVnd(o.pricePerKg)}/kg', style: const TextStyle(fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          if (view.preorderOpen && availability != null) ...[
            const Divider(height: 18, color: AppColors.surfaceMuted),
            Text(
              [
                'Còn đặt được ${formatCount(availability.remainingCrabs)} con',
                'đặt cọc ${formatCount(availability.depositRatePct)}%',
                if (deadline != null) 'hạn ${formatDate(deadline)}',
              ].join(' · '),
              style: text.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}

/// Thanh nút ở đáy: nhà đầu tư góp vốn, khách hàng đặt trước. Cả hai luồng làm trên web.
class _Actions extends ConsumerWidget {
  const _Actions({required this.code, required this.canFund, required this.canPreorder});
  final String code;
  final bool canFund, canPreorder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    void preorder() => openWeb(context, ref, WebPaths.preorder(code));
    return ColoredBox(
      color: AppColors.background,
      child: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 10, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (canFund) ...[
              Text(
                'Góp vốn có rủi ro, nền tảng không cam kết kết quả tài chính.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: () => openWeb(context, ref, WebPaths.contribute(code)),
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: const Text('Góp vốn trên web'),
              ),
            ],
            if (canPreorder && canFund) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  foregroundColor: AppColors.ink,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
                ),
                onPressed: preorder,
                child: const Text('Đặt trước trên web'),
              ),
            ] else if (canPreorder)
              FilledButton.icon(
                onPressed: preorder,
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: const Text('Đặt trước trên web'),
              ),
          ],
        ),
      ),
    );
  }
}

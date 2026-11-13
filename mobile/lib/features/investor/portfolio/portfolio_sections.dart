import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/batch_repository.dart';
import '../data/decision_repository.dart';
import '../data/device_repository.dart';
import '../data/portfolio_repository.dart';
import '../data/settlement_repository.dart';
import '../investor_routes.dart';
import '../votes/decision_card.dart';
import '../widgets/investor_ui.dart';

/// Mục "Khoản góp": từng khoản góp của tôi kèm hợp đồng; thông tin ít dùng của Lô gấp lại.
class ContributionsSection extends ConsumerWidget {
  const ContributionsSection({super.key, required this.detail});
  final PortfolioDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final item = detail.position;
    final b = item.batch;
    final progress = ref.watch(batchProgressProvider(b.code)).value;
    final money = item.frozen ? ref.watch(moneySummaryProvider(b.code)).value : null;
    String? count(int? value) => value == null ? null : '${formatCount(value)} con';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (detail.contributions.isEmpty) const QuietNote('Chưa có khoản góp nào.'),
        for (final c in detail.contributions) ...[
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(formatVnd(c.amount), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    ),
                    StatusPill(kind: 'contribution', value: c.status),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  c.confirmedAt != null ? 'Tiền về ${dateTimeText(c.confirmedAt!)}' : 'Giữ chỗ ${dateTimeText(c.reservedAt)}',
                  style: text.bodySmall,
                ),
                if (c.contractNo != null) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Icon(Icons.description_outlined, size: 18, color: AppColors.inkMuted),
                      const SizedBox(width: 6),
                      Expanded(child: Text(c.contractNo!, maxLines: 1, overflow: TextOverflow.ellipsis)),
                      StatusPill(kind: 'contract', value: c.contractStatus),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
        MoreSection(
          label: 'Thông tin Lô',
          children: [
            KeyValueList(
              rows: [
                ('Vốn của Lô', '${formatVnd(b.raisedCapital)} / ${formatVnd(b.targetCapital)}'),
                ('Lô đã giải ngân theo mốc', money == null ? null : formatVnd(money.batch.disbursed)),
                ('Số dư tài khoản của Lô', money == null ? null : formatVnd(money.batch.held)),
                ('Số cua theo kế hoạch', count(b.seedQuantity)),
                ('Ngày thả cua', b.stockedAt == null ? null : formatDate(b.stockedAt!)),
                ('Thu hoạch theo kế hoạch', b.expectedHarvestDate == null ? null : formatDate(b.expectedHarvestDate!)),
                ('Đã thả bù', count(progress?.restockedCrabs)),
                ('Đã phân hạng', count(progress?.gradedCrabs)),
                ('Đã giao hoặc bán', count(progress?.deliveredOrSoldCrabs)),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

/// Mục "Thiết bị": ảnh mới nhất của từng hộp do camera của trại gửi.
class DevicesSection extends ConsumerStatefulWidget {
  const DevicesSection({super.key, required this.code});
  final String code;

  @override
  ConsumerState<DevicesSection> createState() => _DevicesSectionState();
}

class _DevicesSectionState extends ConsumerState<DevicesSection> {
  static const _step = 6;
  int _shown = _step;

  @override
  Widget build(BuildContext context) {
    final provider = boxImagesProvider(widget.code);
    return ref.watch(provider).when(
      skipLoadingOnReload: true,
      loading: () => const SectionLoading(),
      error: (error, _) => SectionError(error: error, onRetry: () => ref.invalidate(provider)),
      data: (images) {
        if (images.isEmpty) return const EmptyState(icon: Icons.videocam_off_outlined, title: 'Lô chưa có ảnh từ thiết bị');
        final rest = images.length - _shown;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const QuietNote('Ảnh camera tự chụp để theo dõi, chưa qua thẩm định.'),
            LayoutBuilder(
              builder: (context, box) => Wrap(
                spacing: 10,
                runSpacing: 12,
                children: [
                  for (final image in images.take(_shown))
                    SizedBox(width: (box.maxWidth - 10) / 2, child: _BoxImage(image: image)),
                ],
              ),
            ),
            if (rest > 0) ...[
              const SizedBox(height: 12),
              OutlinedButton(
                style: outlinedPillStyle(),
                onPressed: () => setState(() => _shown += _step),
                child: Text('Xem thêm ${rest < _step ? rest : _step} hộp'),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _BoxImage extends StatelessWidget {
  const _BoxImage({required this.image});
  final DeviceImage image;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AuthImage(image.filePath, height: 120),
        const SizedBox(height: 6),
        Text('Hộp ${image.slotCode}', style: const TextStyle(fontWeight: FontWeight.w600)),
        Text(
          '${dateTimeText(image.capturedAt)}${image.crabDetected == false ? ' · không thấy cua' : ''}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

/// Mục "Biểu quyết": các cuộc biểu quyết của Lô, mới nhất trước.
class VotesSection extends ConsumerWidget {
  const VotesSection({super.key, required this.item});
  final PortfolioItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!item.frozen) {
      return const EmptyState(icon: Icons.how_to_vote_outlined, title: 'Lô chưa chốt vốn nên chưa có biểu quyết');
    }
    final provider = batchDecisionsProvider(item.batch.code);
    return ref.watch(provider).when(
      skipLoadingOnReload: true,
      loading: () => const SectionLoading(),
      error: (error, _) => SectionError(error: error, onRetry: () => ref.invalidate(provider)),
      data: (decisions) => decisions.isEmpty
          ? const EmptyState(icon: Icons.how_to_vote_outlined, title: 'Lô này chưa có cuộc biểu quyết nào')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final d in decisions) ...[
                  DecisionCard(decision: d, onVote: ref.read(provider.notifier).vote),
                  const SizedBox(height: 12),
                ],
              ],
            ),
    );
  }
}

/// Mục "Quyết toán": bảng quyết toán đã công bố (nếu có) và sáu điều kiện chờ quyết toán dạng danh sách kiểm.
class SettlementSection extends ConsumerWidget {
  const SettlementSection({super.key, required this.item});
  final PortfolioItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!item.frozen) {
      return const EmptyState(icon: Icons.receipt_long_outlined, title: 'Lô chưa chốt vốn nên chưa có quyết toán');
    }
    final code = item.batch.code;
    final provider = settlementReadinessProvider(code);
    SettlementSummary? statement;
    for (final s in ref.watch(mySettlementsProvider).value ?? const <SettlementSummary>[]) {
      if (s.batchCode == code) statement = s;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (statement != null) ...[
          _StatementLink(statement: statement),
          const SizedBox(height: 12),
        ],
        ref.watch(provider).when(
          skipLoadingOnReload: true,
          loading: () => const SectionLoading(),
          error: (error, _) => SectionError(error: error, onRetry: () => ref.invalidate(provider)),
          data: (readiness) => AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('Điều kiện quyết toán', style: Theme.of(context).textTheme.titleMedium)),
                    InfoChip(
                      label: readiness.ready ? 'Đủ ${readiness.conditions.length} điều kiện' : 'Còn ${readiness.missing} điều kiện',
                      background: (readiness.ready ? AppColors.success : AppColors.warning).withValues(alpha: 0.14),
                      foreground: readiness.ready ? AppColors.success : AppColors.warning,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                for (final c in readiness.conditions) _ConditionRow(condition: c),
                if (statement == null) const QuietNote('Bảng quyết toán chưa được công bố.'),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ConditionRow extends StatelessWidget {
  const _ConditionRow({required this.condition});
  final ReadinessCondition condition;

  @override
  Widget build(BuildContext context) {
    final c = condition;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            c.met ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
            size: 20,
            color: c.met ? AppColors.success : AppColors.warning,
            semanticLabel: c.met ? 'Đã đạt' : 'Chưa đạt',
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.description),
                if (!c.met && c.pending > 0)
                  Text('Còn ${formatCount(c.pending)} mục', style: const TextStyle(color: AppColors.warning, fontSize: 12.5, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatementLink extends StatelessWidget {
  const _StatementLink({required this.statement});
  final SettlementSummary statement;

  @override
  Widget build(BuildContext context) {
    final s = statement;
    return AppCard(
      onTap: () => context.push(InvestorRoutes.settlement(s.id)),
      child: Row(
        children: [
          const IconTile(icon: Icons.receipt_long_outlined, size: 42),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Bảng quyết toán', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                StatusPill(kind: 'settlement', value: s.status),
              ],
            ),
          ),
          if (s.myNetPayout != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(formatVnd(s.myNetPayout!), style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('Tôi thực nhận', style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }
}

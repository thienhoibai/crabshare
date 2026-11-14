import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/settlement_repository.dart';
import '../widgets/investor_ui.dart';

/// Sao kê quyết toán của một Lô: bốn số của tôi ở đầu, rồi bảng của Lô. Góp ý trong hạn gửi trên web.
/// Mọi số ở đây lấy từ bảng quyết toán đã công bố.
class SettlementStatementPage extends ConsumerWidget {
  const SettlementStatementPage({super.key, required this.id});
  final int id;

  /// Số trừ; tránh hiện "-0 đ".
  static String _minus(int amount) => formatVnd(amount == 0 ? 0 : -amount);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = settlementStatementProvider(id);
    final statement = ref.watch(provider);
    final loaded = statement.value;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: SubPageBody<SettlementStatement>(
        title: loaded == null ? 'Quyết toán' : 'Quyết toán Lô ${loaded.batchCode}',
        value: statement,
        onRefresh: () => ref.refresh(provider.future),
        children: (s) {
          final mine = s.mine;
          return [
            Text(s.batchTitle, style: text.titleLarge),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                StatusPill(kind: 'settlement', value: s.status),
                if (s.isLiquidation)
                  InfoChip(
                    label: 'Lô thanh lý sớm',
                    background: AppColors.danger.withValues(alpha: 0.12),
                    foreground: AppColors.danger,
                  ),
              ],
            ),
            const SizedBox(height: 14),
            if (mine != null)
              FactGrid(
                facts: [
                  Fact('Vốn hoàn', formatVnd(mine.capitalReturn)),
                  Fact('Phần chia', formatVnd(mine.profitShare), color: mine.profitShare < 0 ? AppColors.danger : null),
                  Fact('Tôi thực nhận', formatVnd(mine.netPayout), color: AppColors.success),
                  Fact('Chi trả', mine.payoutStatus == null ? 'Chưa chi' : statusLabel('instruction', mine.payoutStatus)),
                ],
              ),
            const SectionHeader(title: 'Bảng của Lô'),
            AppCard(
              child: KeyValueList(
                rows: [
                  ('Doanh thu thực thu', formatVnd(s.actualRevenue)),
                  ('Phí nền tảng (${formatCount(s.platformFeeRatePct)}%)', _minus(s.platformFee)),
                  ('Chi phí được trừ', _minus(s.lockedStandardCost)),
                  ('Còn lại sau phí và chi phí', formatVnd(s.revenuePool)),
                  ('Thù lao người nuôi (${formatCount(s.operatorSharePct)}%)', _minus(s.operatorRemuneration)),
                  ('Chia cho nhà đầu tư', formatVnd(s.distributable)),
                ],
              ),
            ),
            MoreSection(
              label: 'Chi tiết',
              children: [
                KeyValueList(
                  rows: [
                    ('Lần tính', '${s.revisionNo}'),
                    ('Số nhà đầu tư', '${s.investorCount}'),
                    ('Tổng vốn của Lô', formatVnd(s.totalCapital)),
                    ('Đã giải ngân theo mốc', formatVnd(s.disbursedTotal)),
                    if (mine != null && mine.taxWithheld > 0) ('Thuế khấu trừ của tôi', _minus(mine.taxWithheld)),
                  ],
                ),
              ],
            ),
            if (s.feedbackOpen()) ...[
              const SizedBox(height: 8),
              QuietNote('Nhận góp ý tới ${dateTimeText(s.feedbackDeadline!)}.'),
              OutlinedButton.icon(
                style: outlinedPillStyle(),
                onPressed: () => openWeb(context, ref, WebPaths.settlement(s.id)),
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: const Text('Gửi góp ý trên web'),
              ),
            ],
          ];
        },
      ),
    );
  }
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/contract_repository.dart';
import '../widgets/investor_ui.dart';

/// Hợp đồng của các khoản góp của tôi và trạng thái ký. Xem nội dung và ký làm trên web:
/// trang hợp đồng của web tự mở hợp đồng đang chờ tôi ký.
class ContractsPage extends ConsumerWidget {
  const ContractsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SubPageBody<List<ContractSummary>>(
        title: 'Hợp đồng',
        value: ref.watch(myContractsProvider),
        onRefresh: () => ref.refresh(myContractsProvider.future),
        children: (rows) => [
          if (rows.isEmpty) const EmptyState(icon: Icons.draw_outlined, title: 'Bạn chưa có hợp đồng nào'),
          if (rows.any((c) => c.waitsForMe)) ...[
            FilledButton.icon(
              onPressed: () => openWeb(context, ref, WebPaths.contracts),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Ký hợp đồng trên web'),
            ),
            const SizedBox(height: 14),
          ],
          for (final c in rows) ...[
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(c.contractNo, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.titleMedium),
                      ),
                      const SizedBox(width: 8),
                      if (c.waitsForMe)
                        const InfoChip(label: 'Tới lượt bạn ký', background: AppColors.accentSoft, foreground: AppColors.accentText)
                      else
                        StatusPill(kind: 'contract', value: c.status),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('Lô ${c.batchCode} · ${formatVnd(c.amount)}', style: text.bodySmall),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

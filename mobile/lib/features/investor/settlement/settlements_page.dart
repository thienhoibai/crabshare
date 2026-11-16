import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/settlement_repository.dart';
import '../investor_routes.dart';
import '../widgets/investor_ui.dart';

/// Bảng quyết toán đã công bố của các Lô tôi góp vốn. Bấm một thẻ để mở sao kê.
class SettlementsPage extends ConsumerWidget {
  const SettlementsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SubPageBody<List<SettlementSummary>>(
        title: 'Quyết toán',
        value: ref.watch(mySettlementsProvider),
        onRefresh: () => ref.refresh(mySettlementsProvider.future),
        children: (rows) => [
          if (rows.isEmpty)
            const EmptyState(icon: Icons.receipt_long_outlined, title: 'Chưa có bảng quyết toán nào được công bố'),
          for (final s in rows) ...[
            AppCard(
              onTap: () => context.push(InvestorRoutes.settlement(s.id)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(s.batchTitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: text.titleMedium),
                      ),
                      const Icon(Icons.chevron_right_rounded),
                    ],
                  ),
                  Text('Lô ${s.batchCode}', style: text.bodySmall),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: Align(alignment: Alignment.centerLeft, child: StatusPill(kind: 'settlement', value: s.status)),
                      ),
                      if (s.myNetPayout != null)
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(formatVnd(s.myNetPayout!), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                            Text('Tôi thực nhận', style: text.bodySmall),
                          ],
                        ),
                    ],
                  ),
                  if (s.feedbackOpen && s.feedbackDeadline != null) QuietNote('Nhận góp ý tới ${dateTimeText(s.feedbackDeadline!)}.'),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ),
    );
  }
}

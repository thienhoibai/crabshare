import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/decision_repository.dart';
import '../data/portfolio_repository.dart';
import '../widgets/investor_ui.dart';
import 'decision_card.dart';

/// Biểu quyết ở mọi Lô tôi đã chốt vốn: các cuộc đang mở ở trên, các cuộc đã kết thúc gấp lại bên dưới.
class VotesPage extends ConsumerWidget {
  const VotesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final decisions = ref.watch(allDecisionsProvider);
    Future<void> vote(Decision decision, String choice) => ref.read(allDecisionsProvider.notifier).vote(decision, choice);

    return Scaffold(
      body: SubPageBody<List<Decision>>(
        title: 'Biểu quyết',
        value: decisions,
        onRefresh: () {
          ref.invalidate(portfolioProvider);
          return ref.refresh(allDecisionsProvider.future);
        },
        children: (all) {
          final open = [for (final d in all) if (d.isOpen) d];
          final closed = [for (final d in all) if (!d.isOpen) d];
          return [
            if (open.isEmpty)
              const EmptyState(icon: Icons.how_to_vote_outlined, title: 'Không có cuộc biểu quyết nào đang mở'),
            for (final d in open) ...[
              DecisionCard(decision: d, onVote: vote, showBatch: true),
              const SizedBox(height: 12),
            ],
            if (closed.isNotEmpty)
              MoreSection(
                label: 'Đã kết thúc (${closed.length})',
                children: [
                  for (final d in closed) ...[
                    DecisionCard(decision: d, onVote: vote, showBatch: true),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
          ];
        },
      ),
    );
  }
}

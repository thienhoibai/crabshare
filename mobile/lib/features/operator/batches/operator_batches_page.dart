import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/format/money.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/holding_repository.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import '../operator_web.dart';

/// Tab "Lô": Lô đang có việc tại trại đứng trước; Lô chưa chạy hoặc đã xong nằm trong khối gấp.
class OperatorBatchesPage extends ConsumerWidget {
  const OperatorBatchesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final batches = ref.watch(operatorBatchesProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AsyncContent<List<FarmBatch>>(
          value: batches,
          onRefresh: () => ref.refresh(operatorBatchesProvider.future),
          header: const _Title(),
          data: (list) {
            final onFarm = [
              for (final b in list)
                if (b.onFarm) b,
            ];
            final others = [
              for (final b in list)
                if (!b.onFarm) b,
            ];
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 0, 20, kNavBarClearance),
              children: [
                const _Title(padded: false),
                if (onFarm.isEmpty) ...[
                  const EmptyState(icon: Icons.grid_view_rounded, title: 'Chưa có Lô nào đang chạy', message: 'Tạo Lô mới trên trang web.'),
                  Center(
                    child: OutlinedButton(onPressed: () => openOperatorWeb(context, ref, '/operator/batches/new'), child: const Text('Mở trang web')),
                  ),
                ],
                for (final b in onFarm) ...[_BatchCard(batch: b), const SizedBox(height: 12)],
                if (others.isNotEmpty)
                  MoreSection(
                    label: 'Lô khác (${others.length})',
                    children: [
                      for (final b in others) ...[_BatchCard(batch: b), const SizedBox(height: 12)],
                    ],
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Title extends StatelessWidget {
  const _Title({this.padded = true});
  final bool padded;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(padded ? 20 : 0, 12, padded ? 20 : 0, 14),
    child: Text('Lô của tôi', style: Theme.of(context).textTheme.headlineMedium),
  );
}

class _BatchCard extends ConsumerWidget {
  const _BatchCard({required this.batch});
  final FarmBatch batch;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = batch;
    // Số con đang ở hộp chỉ có khi Lô đã thả; còn lại hiện số con của Lô.
    final holding = b.hasHolding && b.onFarm ? ref.watch(batchHoldingProvider(b.code)).value : null;
    final crabs = holding != null ? '${formatCount(holding.boxed)} con trong hộp' : '${formatCount(b.quantity)} con';
    return AppCard(
      onTap: () => context.push(Routes.operatorBatch(b.code)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(b.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
              ),
              const SizedBox(width: 10),
              StatusPill(kind: 'batch', value: b.status),
            ],
          ),
          const SizedBox(height: 4),
          Text('${b.code} · Lô ${b.mode}', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(crabs, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.inkMuted),
            ],
          ),
        ],
      ),
    );
  }
}

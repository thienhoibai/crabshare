import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/batch_repository.dart';
import '../widgets/investor_ui.dart';

enum _Filter { all, funding, preorder }

/// Tab "Lô": các Lô đang gọi vốn hoặc nhận đặt trước. Hai hàng chip lọc: việc muốn làm và loại cua.
class BatchExplorePage extends ConsumerStatefulWidget {
  const BatchExplorePage({super.key});

  @override
  ConsumerState<BatchExplorePage> createState() => _BatchExplorePageState();
}

class _BatchExplorePageState extends ConsumerState<BatchExplorePage> {
  _Filter _filter = _Filter.all;
  String? _crabType;

  @override
  Widget build(BuildContext context) {
    final batches = ref.watch(openBatchesProvider);
    final all = batches.value ?? const <ExploreBatch>[];
    // Chỉ đưa ra các loại cua đang có Lô mở, để không có lựa chọn nào cho ra danh sách rỗng.
    final types = {for (final b in all) b.crabType}.toList();
    final crabType = types.contains(_crabType) ? _crabType : null;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Lô đang mở', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 12),
                  PillTabs<_Filter>(
                    items: const [(_Filter.all, 'Tất cả'), (_Filter.funding, 'Gọi vốn'), (_Filter.preorder, 'Đặt trước')],
                    value: _filter,
                    onChanged: (value) => setState(() => _filter = value),
                  ),
                  if (types.length > 1) ...[
                    const SizedBox(height: 8),
                    PillTabs<String?>(
                      items: [(null, 'Mọi loại cua'), for (final t in types) (t, statusLabel('crabType', t))],
                      value: crabType,
                      onChanged: (value) => setState(() => _crabType = value),
                    ),
                  ],
                ],
              ),
            ),
            Expanded(
              child: AsyncContent(
                value: batches,
                onRefresh: () => ref.refresh(openBatchesProvider.future),
                data: (items) {
                  final rows = [
                    for (final b in items)
                      if ((crabType == null || b.crabType == crabType) &&
                          switch (_filter) {
                            _Filter.all => true,
                            _Filter.funding => b.isFunding,
                            _Filter.preorder => b.takesPreorders(),
                          })
                        b,
                  ];
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, kNavBarClearance),
                    children: [
                      if (rows.isEmpty)
                        EmptyState(
                          icon: Icons.search_off_rounded,
                          title: items.isEmpty ? 'Chưa có Lô nào đang mở' : 'Không có Lô nào khớp bộ lọc',
                        ),
                      for (final b in rows) ...[
                        BatchCard(batch: b, onTap: () => context.push(Routes.batch(b.code))),
                        const SizedBox(height: 14),
                      ],
                    ],
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

/// Thẻ một Lô đang mở: ảnh, hạn, tên, hai chip phương thức và trạng thái, rồi tiến độ gọi vốn hoặc khoảng giá.
class BatchCard extends StatelessWidget {
  const BatchCard({super.key, required this.batch, required this.onTap});
  final ExploreBatch batch;
  final VoidCallback onTap;

  String? get _deadline {
    final b = batch;
    if (b.isFunding && b.fundingDeadline != null) return 'Góp vốn ${formatDueIn(b.fundingDeadline!)}';
    if (b.preorderDeadline != null) return 'Đặt trước ${formatDueIn(b.preorderDeadline!)}';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final b = batch;
    final text = Theme.of(context).textTheme;
    final deadline = _deadline;
    final priceRange = b.priceRange;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              RoundedImage(crabImage(b.crabType), height: 140, width: double.infinity, radius: 18),
              if (deadline != null)
                Positioned(left: 10, top: 10, child: InfoChip(icon: Icons.schedule_rounded, label: deadline)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 12, 6, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(b.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: text.titleMedium),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    StatusPill(kind: 'batchMode', value: b.mode),
                    StatusPill(kind: 'batch', value: b.status),
                  ],
                ),
                if (b.isFunding) ...[
                  const SizedBox(height: 12),
                  SoftProgressBar(value: b.fundingProgress),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${formatMillions(b.confirmedCapital)} / ${formatMillions(b.targetCapital)}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      Text('Góp từ ${formatMillions(b.minContribution)}', style: text.bodySmall),
                    ],
                  ),
                ] else if (priceRange != null) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: Text(priceRange, style: const TextStyle(fontWeight: FontWeight.w700))),
                      Text('theo quy cách', style: text.bodySmall),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

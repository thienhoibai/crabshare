import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/routes.dart';
import '../../../app/theme/app_images.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../../../shared/widgets/nav_shell.dart';
import '../data/customer_models.dart';
import '../data/customer_providers.dart';

/// Ảnh minh hoạ theo loại cua của Lô.
String crabTypeImage(String crabType) => switch (crabType) {
  'FatteningMudCrab' => AppImages.crabFattening,
  'RoeCrab' || 'OilRoeCrab' || 'YoungFemaleCrab' => AppImages.crabRoe,
  'SoftShellCrab' => AppImages.crabSoft,
  _ => AppImages.crabBasket,
};

/// Tab "Lô": các Lô đang nhận đặt trước. Bấm một thẻ để mở trang Lô, nơi xem bảng giá và đặt trước.
class CustomerBatchesPage extends ConsumerWidget {
  const CustomerBatchesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = Text('Lô nhận đặt trước', style: Theme.of(context).textTheme.headlineMedium);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: AsyncContent<List<OpenBatch>>(
          value: ref.watch(preorderBatchesProvider),
          onRefresh: () => ref.refresh(preorderBatchesProvider.future),
          header: Padding(padding: const EdgeInsets.fromLTRB(20, 12, 20, 0), child: title),
          data: (batches) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, kNavBarClearance),
            children: [
              title,
              const SizedBox(height: 14),
              if (batches.isEmpty)
                const EmptyState(
                  icon: Icons.grid_view_rounded,
                  title: 'Chưa có Lô nào nhận đặt trước',
                  message: 'Kéo xuống để tải lại.',
                ),
              for (final b in batches) ...[
                _BatchCard(batch: b, onTap: () => context.push(Routes.batch(b.batchCode))),
                const SizedBox(height: 14),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _BatchCard extends StatelessWidget {
  const _BatchCard({required this.batch, required this.onTap});
  final OpenBatch batch;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final b = batch;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              RoundedImage(crabTypeImage(b.crabType), height: 150, width: double.infinity, radius: 18),
              if (b.preorderDeadline != null)
                Positioned(
                  left: 10,
                  top: 10,
                  child: InfoChip(icon: Icons.schedule_rounded, label: 'Đặt tới ${formatDayMonth(b.preorderDeadline!)}'),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 12, 6, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(b.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 2),
                Text('${b.batchCode} · ${statusLabel('crabType', b.crabType)}', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 10),
                if (b.priceRange != null)
                  Text(
                    b.priceRange!,
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.accentText),
                  ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Còn khoảng ${formatCount(b.remainingCrabs)} con',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    StatusPill(kind: 'batch', value: b.status),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

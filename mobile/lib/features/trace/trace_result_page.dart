import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_theme.dart';
import '../../core/format/dates.dart';
import '../../shared/widgets/app_ui.dart';
import 'trace_repository.dart';

/// Kết quả quét tem: hộ nuôi, lô, số hộp, khối lượng, hạng và chuỗi sự kiện từ hộp tới đơn hàng.
class TraceResultPage extends ConsumerWidget {
  const TraceResultPage({super.key, required this.tagCode});

  final String tagCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(traceProvider(tagCode));
    return Scaffold(
      body: SafeArea(
        child: AsyncContent(
          value: result,
          onRefresh: () => ref.refresh(traceProvider(tagCode).future),
          header: const SubPageHeader(title: 'Truy xuất'),
          data: (t) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              const SubPageHeader(title: 'Truy xuất nguồn gốc'),
              const SizedBox(height: 16),
              const DemoNotice(),
              Stack(
                children: [
                  RoundedImage(
                    t.crabType.image,
                    height: 200,
                    width: double.infinity,
                    radius: AppRadius.card,
                  ),
                  Positioned(
                    left: 12,
                    top: 12,
                    child: InfoChip(
                      icon: Icons.qr_code_2_rounded,
                      label: t.tagCode,
                    ),
                  ),
                  const Positioned(
                    right: 12,
                    bottom: 12,
                    child: InfoChip(
                      icon: Icons.verified_rounded,
                      label: 'Tem minh hoạ',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${t.crabType.label} · hạng ${t.gradeCode} · ${t.weightG} g',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 12),
                    _Row(
                      icon: Icons.storefront_outlined,
                      label: 'Hộ nuôi',
                      value: t.operatorName,
                    ),
                    _Row(
                      icon: Icons.inventory_2_outlined,
                      label: 'Lô',
                      value: t.batchCode,
                    ),
                    _Row(
                      icon: Icons.grid_view_rounded,
                      label: 'Hộp nuôi',
                      value: 'Số ${t.slotCode}',
                    ),
                  ],
                ),
              ),
              const SectionHeader(title: 'Hành trình'),
              AppCard(
                child: Column(
                  children: [
                    for (final (i, e) in t.events.indexed)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Column(
                            children: [
                              Container(
                                width: 14,
                                height: 14,
                                margin: const EdgeInsets.only(top: 3),
                                decoration: BoxDecoration(
                                  color: i == t.events.length - 1
                                      ? AppColors.accent
                                      : AppColors.ink,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              if (i < t.events.length - 1)
                                Container(
                                  width: 2,
                                  height: 40,
                                  color: AppColors.surfaceMuted,
                                ),
                            ],
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${e.title} · ${formatDate(e.at)}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  e.detail,
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                const SizedBox(height: 12),
                              ],
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.accentText),
          const SizedBox(width: 10),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

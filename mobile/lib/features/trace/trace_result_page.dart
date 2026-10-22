import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_theme.dart';
import '../../core/format/dates.dart';
import '../../shared/widgets/app_ui.dart';
import 'trace_repository.dart';

/// Kết quả tra cứu công khai theo mã tem.
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
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.tagCode, style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(
                      [
                        _crabTypeLabel(t.crabType),
                        if ((t.gradeName ?? t.gradeCode)?.isNotEmpty ?? false) t.gradeName ?? t.gradeCode!,
                        if (t.weightG != null) '${t.weightG} g',
                      ].join(' · '),
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 12),
                    _Row(icon: Icons.inventory_2_outlined, label: 'Lô', value: t.batchCode),
                    _Row(icon: Icons.grid_view_rounded, label: 'Hộp nuôi', value: 'Số ${t.slotCode}'),
                    _Row(icon: Icons.info_outline, label: 'Trạng thái', value: _statusLabel(t.itemStatus)),
                    _Row(icon: Icons.event_outlined, label: 'Ngày thả giống', value: formatDate(t.stockedAt)),
                    if (t.harvestedAt != null)
                      _Row(icon: Icons.sailing_outlined, label: 'Ngày thu hoạch', value: formatDate(t.harvestedAt!)),
                  ],
                ),
              ),
              const SectionHeader(title: 'Hành trình'),
              AppCard(
                child: t.events.isEmpty
                    ? const Text('Chưa có sự kiện truy xuất.')
                    : Column(
                        children: [
                          for (final (i, event) in t.events.indexed)
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
                                        color: i == t.events.length - 1 ? AppColors.accent : AppColors.ink,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    if (i < t.events.length - 1)
                                      Container(width: 2, height: 40, color: AppColors.surfaceMuted),
                                  ],
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${_eventLabel(event.eventType)} · ${formatDate(event.occurredAt)}',
                                        style: const TextStyle(fontWeight: FontWeight.w700),
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

  static String _crabTypeLabel(String value) => switch (value) {
    'FatteningMudCrab' => 'Cua thịt',
    'RoeCrab' => 'Cua gạch',
    'SoftShellCrab' => 'Cua lột',
    _ => value,
  };

  static String _statusLabel(String value) => switch (value) {
    'Harvested' => 'Đã thu hoạch',
    'Stocked' => 'Đang nuôi',
    _ => value,
  };

  static String _eventLabel(String value) => switch (value) {
    'Stocking' => 'Thả giống',
    'Harvest' => 'Thu hoạch',
    'TagActivated' => 'Kích hoạt tem',
    'Packing' => 'Đóng gói',
    _ => value,
  };
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
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

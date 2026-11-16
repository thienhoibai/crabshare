import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/theme/app_images.dart';
import '../../core/format/dates.dart';
import '../../core/format/money.dart';
import '../../shared/status_labels.dart';
import '../../shared/widgets/app_ui.dart';
import 'trace_repository.dart';

/// Trang mở khi quét QR trên đơn: Lô và loại cua, trại, nguồn cua, quy cách trong đơn, các lần đã giao.
/// Công khai, không cần đăng nhập; không có thông tin cá nhân, không có mã từng con cua.
class TraceResultPage extends ConsumerWidget {
  const TraceResultPage({super.key, required this.traceCode});
  final String traceCode;

  static String _image(String crabType) => switch (crabType) {
    'FatteningMudCrab' => AppImages.crabFattening,
    'RoeCrab' || 'OilRoeCrab' || 'YoungFemaleCrab' => AppImages.crabRoe,
    'SoftShellCrab' => AppImages.crabSoft,
    _ => AppImages.crabBasket,
  };

  /// Ghi chú chuẩn phân hạng của API, bỏ mã quy tắc trong ngoặc ở cuối câu.
  static String _plainNote(String note) => note.replaceAll(RegExp(r'\s*\((?:BR|UC)-?\d+[^)]*\)'), '').trim();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const header = SubPageHeader(title: 'Truy xuất nguồn gốc');
    return Scaffold(
      body: SafeArea(
        child: AsyncContent<OrderTrace>(
          value: ref.watch(traceProvider(traceCode)),
          onRefresh: () => ref.refresh(traceProvider(traceCode).future),
          header: const Padding(padding: EdgeInsets.fromLTRB(20, 12, 20, 0), child: header),
          data: (t) {
            final small = Theme.of(context).textTheme.bodySmall;
            final note = _plainNote(t.standardNote);
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
              children: [
                header,
                const SizedBox(height: 14),
                AppCard(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      RoundedImage(_image(t.crabType), height: 140, width: double.infinity, radius: 18),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(6, 12, 6, 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(t.batchTitle, style: Theme.of(context).textTheme.titleLarge),
                            const SizedBox(height: 2),
                            Text('Lô ${t.batchCode} · ${statusLabel('crabType', t.crabType)}', style: small),
                            const SizedBox(height: 12),
                            _IconLine(icon: Icons.agriculture_outlined, title: t.farmName, subtitle: 'Trại nuôi'),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                if (t.lines.isNotEmpty) ...[
                  SectionHeader(title: 'Quy cách trong đơn', actionLabel: '${formatCount(t.totalCrabs)} con'),
                  AppCard(
                    child: Column(
                      children: [
                        for (final l in t.lines)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                Expanded(child: Text(l.specName, style: const TextStyle(fontWeight: FontWeight.w600))),
                                const SizedBox(width: 10),
                                Text('${formatCount(l.crabs)} con', style: const TextStyle(fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                if (t.sourceLots.isNotEmpty) ...[
                  const SectionHeader(title: 'Nguồn cua'),
                  AppCard(
                    child: Column(
                      children: [
                        for (final (i, s) in t.sourceLots.indexed) ...[
                          if (i > 0) const SizedBox(height: 12),
                          _IconLine(
                            icon: Icons.place_outlined,
                            title: s.originRegion ?? 'Chưa khai vùng xuất xứ',
                            subtitle: [
                              if (s.harvestedOn != null) 'Thu ngày ${formatDate(s.harvestedOn!)}',
                              if (s.species.isNotEmpty) s.species,
                            ].join(' · '),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
                if (t.deliveries.isNotEmpty) ...[
                  const SectionHeader(title: 'Đã giao'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final d in t.deliveries) InfoChip(icon: Icons.local_shipping_outlined, label: formatDate(d)),
                    ],
                  ),
                ],
                if (note.isNotEmpty) ...[const SizedBox(height: 18), Text(note, style: small)],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _IconLine extends StatelessWidget {
  const _IconLine({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconTile(icon: icon, size: 40),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (subtitle.isNotEmpty) Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ],
    );
  }
}

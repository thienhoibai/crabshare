import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/status_labels.dart';
import '../../../shared/widgets/app_parts.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/timeline_repository.dart';
import '../widgets/investor_ui.dart';

final _number = NumberFormat('#,##0.###', 'vi_VN');

/// Một ghi nhận trong nhật trình: nhật ký chăm sóc, sự kiện của một con cua, bằng chứng đã chấp nhận,
/// cảnh báo hoặc sự kiện hộp. Mỗi ghi nhận một dòng: biểu tượng, tên, một câu tóm tắt, giờ.
class TimelineEntry extends ConsumerWidget {
  const TimelineEntry({super.key, required this.code, required this.item});
  final String code;
  final TimelineItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final log = item.productionLog;
    final crab = item.crabEvent;
    final evidence = item.evidence;
    final alert = item.alert;
    final slot = item.slotEvent;

    var icon = Icons.history_rounded;
    var color = AppColors.accentText;
    var title = 'Ghi nhận';
    String? summary;
    Widget? extra;

    if (log != null) {
      icon = Icons.menu_book_rounded;
      title = 'Nhật ký chăm sóc';
      summary = [
        if (log.ph != null) 'pH ${_number.format(log.ph)}',
        if (log.waterTempC != null) '${_number.format(log.waterTempC)} °C',
        if (log.salinityPpt != null) '${_number.format(log.salinityPpt)} ‰',
        if (log.feedKg != null) '${_number.format(log.feedKg)} kg thức ăn',
        if (log.note != null && log.note!.isNotEmpty) log.note!,
      ].join(' · ');
      if (log.plausibilityFlag != 'Ok') {
        color = AppColors.warning;
        extra = InfoChip(
          label: log.plausibilityFlag == 'OutOfRange' ? 'Ngoài ngưỡng' : 'Cần đối chiếu',
          background: AppColors.warning.withValues(alpha: 0.14),
          foreground: AppColors.warning,
        );
      }
    } else if (crab != null) {
      icon = Icons.set_meal_outlined;
      title = timelineCrabEventLabels[crab.eventType] ?? crab.eventType;
      if (crab.eventType == 'Died' || crab.eventType == 'Destroyed') color = AppColors.danger;
      summary = [
        'Cua ${crab.crabCode}',
        if (crab.slotCode != null) 'hộp ${crab.slotCode}',
        if (crab.reason != null && crab.reason!.isNotEmpty) crab.reason!,
      ].join(' · ');
    } else if (evidence != null) {
      icon = Icons.photo_camera_outlined;
      color = AppColors.success;
      title = timelineMediaLabels[evidence.mediaType] ?? evidence.mediaType;
      summary = evidence.slotCode == null ? null : 'Hộp ${evidence.slotCode}';
      final style = TextButton.styleFrom(
        foregroundColor: AppColors.accentText,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        minimumSize: const Size(48, 44),
      );
      extra = evidence.isPhoto
          ? TextButton.icon(
              style: style,
              onPressed: () => _showPhoto(context, timelineFilePath(code, item.sourceId)),
              icon: const Icon(Icons.photo_outlined, size: 18),
              label: const Text('Xem ảnh'),
            )
          : TextButton.icon(
              style: style,
              onPressed: () => openWeb(context, ref, '${WebPaths.portfolio(code)}?tab=nhat-trinh'),
              icon: const Icon(Icons.open_in_new_rounded, size: 18),
              label: const Text('Mở trên web'),
            );
    } else if (alert != null) {
      icon = Icons.warning_amber_rounded;
      color = toneColor(statusTone('severity', alert.severity));
      title = statusLabel('alertType', alert.type);
      summary = alert.message;
      extra = StatusPill(kind: 'alert', value: alert.status);
    } else if (slot != null) {
      icon = Icons.grid_view_rounded;
      title = timelineSlotLabels[slot.eventType] ?? slot.eventType;
      if (slot.eventType == 'Mortality') color = AppColors.danger;
      summary = [
        'Hộp ${slot.slotCode}${slot.destinationSlotCode == null ? '' : ' sang hộp ${slot.destinationSlotCode}'}',
        '${slot.quantity} con',
      ].join(' · ');
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconTile(icon: icon, size: 38, background: color.withValues(alpha: 0.12), foreground: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600))),
                    if (item.occurredAt != null) Text(timelineTime(item.occurredAt!), style: text.bodySmall),
                  ],
                ),
                if (summary != null && summary.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(summary, style: text.bodySmall),
                ],
                if (extra != null) ...[
                  const SizedBox(height: 4),
                  Align(alignment: Alignment.centerLeft, child: extra),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showPhoto(BuildContext context, String path) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: AppColors.surface,
        insetPadding: const EdgeInsets.all(16),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(tooltip: 'Đóng ảnh', onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close_rounded)),
              ),
              Flexible(child: _EvidencePhoto(path: path)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Ảnh bằng chứng đầy đủ khung, tải qua API cần đăng nhập, phóng to được.
class _EvidencePhoto extends ConsumerWidget {
  const _EvidencePhoto({required this.path});
  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ref.watch(authImageProvider(path)).when(
      loading: () => const SectionLoading(),
      error: (_, _) => const Padding(padding: EdgeInsets.all(20), child: Text('Ảnh tạm thời không xem được.')),
      data: (bytes) => bytes.isEmpty
          ? const Padding(padding: EdgeInsets.all(20), child: Text('Ảnh tạm thời không xem được.'))
          : InteractiveViewer(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Image.memory(
                  bytes,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => const Padding(padding: EdgeInsets.all(20), child: Text('Không đọc được ảnh.')),
                ),
              ),
            ),
    );
  }
}

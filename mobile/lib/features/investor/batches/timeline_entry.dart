import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/timeline_repository.dart';
import 'timeline_media.dart';

class TimelineEntry extends StatelessWidget {
  const TimelineEntry({super.key, required this.code, required this.item, required this.onDenied});
  final String code;
  final TimelineItem item;
  final VoidCallback onDenied;
  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final log = item.productionLog;
    final slot = item.slotEvent;
    final evidence = item.evidence;
    final alert = item.alert;
    final (label, icon) = switch (item.type) {
      'ProductionLog' => ('Nhật ký', Icons.menu_book_rounded),
      'SlotEvent' => ('Sự kiện hộp', Icons.grid_view_rounded),
      'Evidence' => ('Bằng chứng', Icons.photo_camera_outlined),
      'Alert' => ('Cảnh báo', Icons.warning_amber_rounded),
      _ => ('Ghi nhận', Icons.history_rounded),
    };
    String metric(double? value) => value == null ? '—' : NumberFormat('#,##0.###', 'vi_VN').format(value);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Icon(icon, size: 18, color: alert != null ? AppColors.danger : AppColors.ink),
          Text(label, style: text.labelLarge),
          Text(item.occurredAt == null ? 'Ghi nhận theo ngày' : '${timelineTime(item.occurredAt!)}${item.timeBasis == 'Received' ? ' · Tiếp nhận' : ''}', style: text.bodySmall),
        ]),
        const SizedBox(height: 14),
        if (log != null) ...[
          Text('Môi trường & chăm sóc', style: text.titleMedium),
          const SizedBox(height: 12),
          LayoutBuilder(builder: (context, constraints) => Wrap(spacing: 12, runSpacing: 16, children: [
            for (final (name, value, unit) in [('pH', log.ph, ''), ('Nhiệt độ', log.waterTempC, '°C'), ('Độ mặn', log.salinityPpt, 'ppt'), ('Thức ăn', log.feedKg, 'kg')])
              SizedBox(width: (constraints.maxWidth - 12) / 2, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name, style: text.bodySmall),
                Text('${metric(value)} $unit', style: text.titleLarge),
              ])),
          ])),
          if (log.note != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(log.note!)),
          const SizedBox(height: 12),
          Text('${log.source == 'Manual' ? 'Nhật ký hộ nuôi' : 'Hệ thống trại'} · ${const {'Ok': 'Trong ngưỡng đã áp dụng', 'OutOfRange': 'Ngoài ngưỡng đã áp dụng', 'Inconsistent': 'Cần đối chiếu số liệu'}[log.plausibilityFlag] ?? log.plausibilityFlag}', style: text.bodySmall),
        ],
        if (slot != null) ...[
          Text(timelineSlotLabels[slot.eventType] ?? slot.eventType, style: text.titleMedium),
          const SizedBox(height: 8),
          Text('Hộp ${slot.slotCode}${slot.destinationSlotCode == null ? '' : ' → ${slot.destinationSlotCode}'}', style: text.titleLarge),
          Text('${slot.quantity} con', style: text.bodySmall),
          if (slot.note != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(slot.note!)),
        ],
        if (evidence != null) ...[
          Text(evidence.mediaType == 'Photo' ? 'Ảnh ghi nhận tại trại' : 'File bằng chứng sản xuất', style: text.titleMedium),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            const InfoChip(icon: Icons.done_all_rounded, label: 'Đã chấp nhận'),
            if (evidence.slotCode != null) Text('Hộp ${evidence.slotCode}', style: text.bodySmall),
          ]),
          const SizedBox(height: 12),
          TimelineMedia(code: code, item: item, onDenied: onDenied),
        ],
        if (alert != null) ...[
          Text(timelineAlertLabels[alert.type] ?? alert.type, style: text.titleMedium),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            InfoChip(icon: Icons.flag_outlined, label: 'Mức độ ${timelineSeverityLabels[alert.severity] ?? alert.severity}'),
            Text(timelineStatusLabels[alert.status] ?? alert.status, style: text.labelLarge),
          ]),
          const SizedBox(height: 12), Text(alert.message),
          if (alert.acknowledgedAt != null) Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Hộ nuôi đã phản hồi · ${timelineTime(alert.acknowledgedAt!)} (UTC+7)', style: text.bodySmall),
          ),
        ],
      ])),
    );
  }
}

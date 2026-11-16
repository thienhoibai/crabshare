import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/format/dates.dart';
import '../measure/work_common.dart';
import 'delivery_models.dart';
import 'delivery_repository.dart';

/// Hộp ngắn lập chuyến giao cho một đợt: giờ dự kiến xuất, điều kiện vận chuyển, cho thay cua hạng cao hơn.
/// Trả về chuyến vừa lập, hoặc null khi người dùng đóng.
Future<Shipment?> showCreateShipmentSheet(BuildContext context, DeliveryTranche tranche) => showModalBottomSheet<Shipment>(
  context: context,
  isScrollControlled: true,
  backgroundColor: AppColors.surface,
  shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
  builder: (context) => _CreateShipmentSheet(tranche: tranche),
);

class _CreateShipmentSheet extends ConsumerStatefulWidget {
  const _CreateShipmentSheet({required this.tranche});
  final DeliveryTranche tranche;

  @override
  ConsumerState<_CreateShipmentSheet> createState() => _CreateShipmentSheetState();
}

class _CreateShipmentSheetState extends ConsumerState<_CreateShipmentSheet> {
  final _transport = TextEditingController();
  late DateTime _scheduledAt = _roundUp(DateTime.now().add(const Duration(hours: 1)));
  bool _substitute = true;
  bool _busy = false;
  String? _error;

  /// Làm tròn lên bội số 15 phút cho dễ đọc.
  static DateTime _roundUp(DateTime t) {
    final extra = (15 - t.minute % 15) % 15;
    return DateTime(t.year, t.month, t.day, t.hour, t.minute).add(Duration(minutes: extra));
  }

  @override
  void dispose() {
    _transport.dispose();
    super.dispose();
  }

  Future<void> _pickTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _scheduledAt,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 90)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_scheduledAt));
    if (time == null || !mounted) return;
    setState(() => _scheduledAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> _submit() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final shipment = await ref
          .read(deliveryRepositoryProvider)
          .createShipment(
            widget.tranche.trancheId,
            scheduledAt: _scheduledAt,
            transportCondition: _transport.text,
            allowSubstitution: _substitute,
          );
      if (mounted) Navigator.of(context).pop(shipment);
    } catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = workError(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.tranche;
    final text = Theme.of(context).textTheme;
    return PopScope(
      canPop: !_busy,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Lập chuyến giao', style: text.titleLarge),
              const SizedBox(height: 4),
              Text(
                [t.recipientName, if (t.dueDate != null) 'hạn ${formatDayMonth(t.dueDate!)}'].join(' · '),
                style: text.bodySmall,
              ),
              const SizedBox(height: 14),
              Material(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(AppRadius.chip),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: _busy ? null : _pickTime,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                    child: Row(
                      children: [
                        const Icon(Icons.schedule_rounded, color: AppColors.inkMuted),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Dự kiến xuất hàng', style: text.bodySmall),
                              Text(
                                '${formatTime(_scheduledAt)} · ${formatDate(_scheduledAt)}',
                                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.edit_calendar_rounded, color: AppColors.inkMuted),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _transport,
                enabled: !_busy,
                maxLength: 300,
                decoration: const InputDecoration(
                  labelText: 'Điều kiện vận chuyển',
                  hintText: 'Thùng xốp, đá khô, xe lạnh',
                  fillColor: AppColors.background,
                  counterText: '',
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _substitute,
                onChanged: _busy ? null : (v) => setState(() => _substitute = v),
                title: const Text('Thiếu cua thì thay cua cùng size, hạng cao hơn'),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                ),
              const SizedBox(height: 6),
              FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Đang lập…' : 'Lập chuyến')),
              const SizedBox(height: 8),
              TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: const Text('Đóng')),
            ],
          ),
        ),
      ),
    );
  }
}

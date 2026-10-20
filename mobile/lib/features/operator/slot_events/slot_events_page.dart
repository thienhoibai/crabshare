import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';
import '../evidence/evidence_camera.dart';
import '../evidence/evidence_repository.dart';
import 'slot_event_repository.dart';

String _day(String value) {
  final date = DateTime.parse(value);
  return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
}

String _time(DateTime value) {
  final local = value.toLocal();
  return '${_day(local.toIso8601String())} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}

class SlotEventsPage extends ConsumerStatefulWidget {
  const SlotEventsPage({super.key, required this.batchCode});
  final String batchCode;
  @override
  ConsumerState<SlotEventsPage> createState() => _SlotEventsPageState();
}

class _SlotEventsPageState extends ConsumerState<SlotEventsPage> {
  final _note = TextEditingController();
  SlotEventType _type = SlotEventType.molted;
  String? _slot, _destination, _error;
  int? _replacement, _evidenceId;
  EvidencePhoto? _photo;
  SlotEventInput? _pending;
  DateTime _occurredAt = DateTime.now();
  bool _busy = false;
  int _page = 1;
  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _clearEvidence() {
    _photo = null;
    _evidenceId = null;
    _pending = null;
  }

  void _refresh() {
    ref.invalidate(slotEventSourcesProvider(widget.batchCode));
    ref.invalidate(slotEventPolicyProvider(widget.batchCode));
    ref.invalidate(slotEventDestinationsProvider);
    ref.invalidate(slotEventHistoryProvider);
    if (_slot != null) {
      ref.invalidate(slotEventContextProvider((widget.batchCode, _slot!)));
    }
  }

  Future<void> _pickTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _occurredAt,
      firstDate: DateTime(2000),
      lastDate: now,
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_occurredAt),
    );
    if (time == null || !mounted) return;
    final selected = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    setState(() {
      if (selected.isAfter(DateTime.now())) {
        _error = 'Thời điểm không được ở tương lai.';
        return;
      }
      _occurredAt = selected;
      _pending = null;
      _error = null;
    });
  }

  Future<void> _capture() async {
    if (_busy) return;
    final account = ref.read(productionAccountProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final photo = await ref.read(evidenceCameraProvider).capture();
      if (mounted &&
          ref.read(productionAccountProvider) == account &&
          photo != null) {
        setState(() {
          _photo = photo;
          _evidenceId = null;
          _pending = null;
          _occurredAt = DateTime.now();
        });
      }
    } catch (e) {
      if (mounted && ref.read(productionAccountProvider) == account) {
        setState(
          () => _error = e is EvidenceCaptureException
              ? e.message
              : e is FormatException
              ? e.message
              : apiErrorMessage(e),
        );
      }
    } finally {
      if (mounted && ref.read(productionAccountProvider) == account) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _save(SlotEventContext? slotContext) async {
    if (_busy || _slot == null) return;
    if (_type.needsPhoto && _photo == null) {
      setState(
        () => _error = 'Hãy chụp ảnh trực tiếp tại hộp trước khi ghi nhận.',
      );
      return;
    }
    if (_type == SlotEventType.restocked && _replacement == null) {
      setState(() => _error = 'Chọn đúng cá thể chết cần thay thế.');
      return;
    }
    if (_type == SlotEventType.relocated &&
        (_destination == null || _destination == _slot)) {
      setState(() => _error = 'Chọn hộp đích đang trống khác hộp nguồn.');
      return;
    }
    final account = ref.read(productionAccountProvider);
    // Block double submits and edits while confirmation and upload are in flight.
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Xác nhận sự kiện hộp'),
          content: Text(
            '${_type.label} · lô ${widget.batchCode} · hộp $_slot\n'
            '${_time(_occurredAt)} · 1 con\n'
            '${_type == SlotEventType.restocked ? 'Thay cá thể ${slotContext?.replacementCandidates.where((c) => c.id == _replacement).firstOrNull?.itemUuid ?? _replacement}\n' : ''}'
            '${_type == SlotEventType.relocated ? 'Đến hộp $_destination\n' : ''}'
            '${_note.text.trim()}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Quay lại'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Xác nhận'),
            ),
          ],
        ),
      );
      if (confirmed != true ||
          !mounted ||
          ref.read(productionAccountProvider) != account) {
        return;
      }
      if (_type.needsPhoto && _evidenceId == null) {
        final result = await ref
            .read(evidenceRepositoryProvider)
            .upload(
              box: BoxSlot(
                slotCode: _slot!,
                batchCode: widget.batchCode,
                status: slotContext?.status == 'Available'
                    ? SlotStatus.available
                    : SlotStatus.occupied,
              ),
              photo: _photo!,
              slotEventType: _type == SlotEventType.restocked
                  ? 'Restocked'
                  : null,
            );
        if (!mounted || ref.read(productionAccountProvider) != account) return;
        if (result.reviewStatus == 'Rejected') {
          setState(() {
            _clearEvidence();
            _error = 'Ảnh bị từ chối. Hãy chụp lại tại hộp.';
          });
          return;
        }
        _evidenceId = result.id;
      }
      _pending ??= SlotEventInput(
        requestId: newSlotEventRequestId(),
        slotCode: _slot!,
        eventType: _type,
        occurredAt: _occurredAt,
        note: _note.text.trim(),
        destinationSlotCode: _destination,
        replacesCrabItemId: _replacement,
        evidenceId: _evidenceId,
      );
      final event = await ref
          .read(slotEventActionsProvider)
          .record(widget.batchCode, _pending!);
      if (!mounted || ref.read(productionAccountProvider) != account) return;
      setState(() {
        _clearEvidence();
        _replacement = null;
        _destination = null;
        _note.clear();
        _occurredAt = DateTime.now();
        _page = 1;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Đã ghi nhận ${event.eventTypeLabel.toLowerCase()}.${event.aliveCount == null ? '' : ' Còn ${event.aliveCount} con đang nuôi.'}',
          ),
        ),
      );
    } catch (e) {
      if (mounted && ref.read(productionAccountProvider) == account) {
        setState(() => _error = apiErrorMessage(e));
        // Preserve the exact input and its UUID for a retry after a lost response.
        _refresh();
      }
    } finally {
      if (mounted && ref.read(productionAccountProvider) == account) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(productionAccountProvider);
    ref.listen(productionAccountProvider, (previous, next) {
      if (previous == next) return;
      setState(() {
        _slot = null;
        _destination = null;
        _replacement = null;
        _clearEvidence();
        _note.clear();
        _error = null;
        _busy = false;
        _page = 1;
      });
    });
    final sources = ref.watch(slotEventSourcesProvider(widget.batchCode));
    final policy = ref.watch(slotEventPolicyProvider(widget.batchCode));
    final slotState = _slot == null
        ? null
        : ref.watch(slotEventContextProvider((widget.batchCode, _slot!)));
    final data = slotState == null || slotState.isLoading || slotState.hasError
        ? null
        : slotState.value;
    final config = policy.isLoading || policy.hasError ? null : policy.value;
    final restocking = _type == SlotEventType.restocked;
    final eligible =
        data?.canRecord == true &&
        (restocking
            ? data!.currentCrab == null &&
                  data.status == 'Available' &&
                  data.replacementCandidates.isNotEmpty &&
                  config?.current != null &&
                  data.restockDeadline != null &&
                  config!.businessDate.compareTo(data.restockDeadline!) <= 0
            : data!.currentCrab != null);
    final history = ref.watch(
      slotEventHistoryProvider((widget.batchCode, _page)),
    );
    final sourceItems = sources.isLoading || sources.hasError
        ? <BoxSlot>[]
        : sources.value ?? <BoxSlot>[];
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            const SubPageHeader(title: 'Sự kiện hộp'),
            const SizedBox(height: 12),
            Text(
              'Lô ${widget.batchCode}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Text(
              'Mỗi sự kiện ghi nhận 1 con. Thời điểm và lịch sử được kiểm tra trên máy chủ.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (sources.isLoading || policy.isLoading)
              const LoadingSkeleton(rows: 1),
            if (sources.hasError)
              ErrorView(
                message: apiErrorMessage(sources.error!),
                onRetry: _refresh,
              ),
            if (policy.hasError)
              ErrorView(
                message: apiErrorMessage(policy.error!),
                onRetry: _refresh,
              ),
            if (config != null)
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      config.current == null
                          ? 'Trại chưa cấu hình hạn thả bù. Nhờ Owner cấu hình trên web trước khi thả bù.'
                          : 'Hạn thả bù: ${config.restockDeadline == null ? 'Chưa có ngày hạn' : _day(config.restockDeadline!)} (hết ngày Việt Nam).',
                    ),
                    if (config.formula != null) Text(config.formula!),
                    if (config.current?['mortalityWindowHours'] == null)
                      const Text(
                        'Chưa cấu hình ngưỡng cảnh báo cua chết; vẫn có thể ghi nhận.',
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              key: ValueKey('source-slot'),
              isExpanded: true,
              initialValue: sourceItems.any((b) => b.slotCode == _slot)
                  ? _slot
                  : null,
              decoration: const InputDecoration(labelText: 'Hộp nguồn'),
              items: [
                for (final b in sourceItems)
                  DropdownMenuItem(value: b.slotCode, child: Text(b.slotCode)),
              ],
              onChanged: _busy
                  ? null
                  : (value) => setState(() {
                      _slot = value;
                      _replacement = null;
                      _destination = null;
                      _clearEvidence();
                      _error = null;
                    }),
            ),
            if (!sources.isLoading && !sources.hasError && sourceItems.isEmpty)
              const Text('Chưa có hộp để ghi nhận.'),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final type in SlotEventType.values)
                  ChoiceChip(
                    label: Text(type.label),
                    selected: type == _type,
                    showCheckmark: false,
                    onSelected: _busy
                        ? null
                        : (_) => setState(() {
                            _type = type;
                            _destination = null;
                            _replacement = null;
                            _clearEvidence();
                            _error = null;
                          }),
                  ),
              ],
            ),
            if (slotState?.isLoading == true) const LoadingSkeleton(rows: 1),
            if (slotState?.hasError == true)
              ErrorView(
                message: apiErrorMessage(slotState!.error!),
                onRetry: _refresh,
              ),
            if (data != null) ...[
              const SizedBox(height: 12),
              Text(
                '${data.aliveCount} con đang nuôi · ${data.status == 'Available' ? 'Hộp trống' : 'Hộp có cua'}',
              ),
              Text(
                data.currentCrab == null
                    ? 'Hộp hiện không có cua đang nuôi.'
                    : 'Cá thể hiện tại: ${data.currentCrab!.itemUuid}',
              ),
              if (!data.canRecord)
                const Text(
                  'Bạn chưa có quyền ghi nhận cho lô này hoặc lô chưa ở trạng thái cho phép.',
                ),
              if (restocking && data.replacementCandidates.isEmpty)
                const Text(
                  'Hộp này không có cá thể chết chưa được thay của lô.',
                ),
              if (restocking && data.restockDeadline != null)
                Text(
                  'Hạn của hộp: ${_day(data.restockDeadline!)} (giờ Việt Nam).',
                ),
              if (restocking &&
                  config != null &&
                  data.restockDeadline != null &&
                  config.businessDate.compareTo(data.restockDeadline!) > 0)
                const Text(
                  'Đã quá hạn thả bù của trại. Không thể nhập lùi để thay đổi hạn.',
                ),
              if (restocking)
                DropdownButtonFormField<int>(
                  key: ValueKey('replacement-crab'),
                  isExpanded: true,
                  initialValue: _replacement,
                  decoration: const InputDecoration(
                    labelText: 'Cá thể chết cần thay',
                  ),
                  items: [
                    for (final crab in data.replacementCandidates)
                      DropdownMenuItem(
                        value: crab.id,
                        child: Text(
                          '${crab.itemUuid} · ${_time(crab.diedAt!)}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: _busy
                      ? null
                      : (value) => setState(() {
                          _replacement = value;
                          _clearEvidence();
                        }),
                ),
            ],
            if (_type == SlotEventType.relocated) _destinations(),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : _pickTime,
              icon: const Icon(Icons.schedule),
              label: Text(_time(_occurredAt)),
            ),
            const Text(
              'Giờ trên thiết bị; gửi kèm múi giờ. Không được ở tương lai hoặc trước lịch sử hộp/cá thể.',
            ),
            if (_type.needsPhoto) ...[
              const SizedBox(height: 12),
              const Text(
                'Ảnh bắt buộc chụp trực tiếp bằng camera và GPS tại hộp. Ảnh thả bù phải sau khi cua chết.',
              ),
              if (_photo != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.memory(
                      _photo!.bytes,
                      height: 160,
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              OutlinedButton.icon(
                onPressed: _busy || _slot == null ? null : _capture,
                icon: const Icon(Icons.photo_camera_outlined),
                label: Text(_photo == null ? 'Chụp ảnh tại hộp' : 'Chụp lại'),
              ),
              if (_photo != null)
                Text(
                  'Ảnh mới chụp · ${_time(_photo!.capturedAt)} · GPS ${_photo!.latitude.toStringAsFixed(5)}, ${_photo!.longitude.toStringAsFixed(5)}',
                ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              enabled: !_busy,
              maxLength: 1000,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Ghi chú (không bắt buộc)',
              ),
              onChanged: (_) => setState(() => _pending = null),
            ),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            FilledButton(
              key: const ValueKey('save-slot-event'),
              onPressed:
                  _busy ||
                      (_pending == null &&
                          (!eligible || policy.hasError || policy.isLoading))
                  ? null
                  : () => _save(data),
              child: Text(
                _busy
                    ? 'Đang xử lý…'
                    : _pending != null
                    ? 'Thử gửi lại sự kiện'
                    : 'Ghi nhận sự kiện',
              ),
            ),
            const SizedBox(height: 24),
            const SectionHeader(title: 'Lịch sử sự kiện'),
            ...history.when(
              loading: () => [const LoadingSkeleton(rows: 1)],
              error: (e, _) => [
                ErrorView(message: apiErrorMessage(e), onRetry: _refresh),
              ],
              data: (h) => [
                if (h.items.isEmpty) const Text('Chưa có sự kiện.'),
                for (final event in h.items)
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${event.eventTypeLabel} · hộp ${event.slotCode}${event.destinationSlotCode == null ? '' : ' → ${event.destinationSlotCode}'}',
                        ),
                        Text(
                          '${_time(event.occurredAt)} · ${event.itemUuid ?? 'Chưa có liên kết cá thể'}',
                        ),
                        Text(
                          event.aliveCount == null
                              ? 'Không có số liệu tại thời điểm ghi'
                              : '${event.aliveCount} con đang nuôi tại thời điểm ghi',
                        ),
                        if (event.note != null) Text(event.note!),
                      ],
                    ),
                  ),
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    TextButton(
                      onPressed: _busy || _page <= 1
                          ? null
                          : () => setState(() => _page--),
                      child: const Text('Trước'),
                    ),
                    Text('Trang $_page · ${h.total} sự kiện'),
                    TextButton(
                      onPressed: _busy || _page * 10 >= h.total
                          ? null
                          : () => setState(() => _page++),
                      child: const Text('Sau'),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _destinations() {
    final destinations = ref.watch(slotEventDestinationsProvider);
    return destinations.when(
      loading: () => const LoadingSkeleton(rows: 1),
      error: (e, _) => ErrorView(
        message: apiErrorMessage(e),
        onRetry: () => ref.invalidate(slotEventDestinationsProvider),
      ),
      data: (boxes) => DropdownButtonFormField<String>(
        key: ValueKey('destination-slot'),
        isExpanded: true,
        initialValue: _destination,
        decoration: const InputDecoration(labelText: 'Hộp đích đang trống'),
        items: [
          for (final box in boxes.where((b) => b.slotCode != _slot))
            DropdownMenuItem(value: box.slotCode, child: Text(box.slotCode)),
        ],
        onChanged: _busy
            ? null
            : (value) => setState(() {
                _destination = value;
                _pending = null;
              }),
      ),
    );
  }
}

import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/routes.dart';
import '../../../core/api/api_client.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/operator_repository.dart';
import '../slot_events/slot_event_repository.dart' show newSlotEventRequestId;
import 'harvest_actions.dart';
import 'harvest_models.dart';
import 'harvest_repository.dart';

class HarvestPage extends ConsumerWidget {
  const HarvestPage({super.key, required this.batchCode});
  final String batchCode;
  @override
  Widget build(BuildContext context, WidgetRef ref) => _HarvestBody(
    key: ValueKey((ref.watch(productionAccountProvider), batchCode)),
    batchCode: batchCode,
  );
}

class _HarvestBody extends ConsumerStatefulWidget {
  const _HarvestBody({super.key, required this.batchCode});
  final String batchCode;
  @override
  ConsumerState<_HarvestBody> createState() => _HarvestBodyState();
}

class _HarvestBodyState extends ConsumerState<_HarvestBody> {
  final _weight = TextEditingController(),
      _name = TextEditingController(),
      _note = TextEditingController();
  String? _slot, _error;
  ShellCondition? _shell;
  int? _confirmedCrabId, _confirmedHarvestId, _historyId;
  int _sessionsPage = 1, _recordsPage = 1;
  bool _busy = false;
  HarvestedCrab? _result;
  @override
  void dispose() {
    _weight.dispose();
    _name.dispose();
    _note.dispose();
    super.dispose();
  }

  HarvestPendingStore get _pending => ref.read(harvestPendingProvider);
  bool get _unresolved =>
      _pending.records.containsKey(widget.batchCode) ||
      _pending.starts.containsKey(widget.batchCode);
  bool get _locked =>
      _busy || _pending.busy.contains(widget.batchCode) || _unresolved;

  Future<void> _refresh() async {
    ref.read(harvestActionsProvider).refresh(widget.batchCode);
    try {
      await ref.read(harvestContextProvider((widget.batchCode, _slot)).future);
    } catch (_) {
      /* Render the API error. */
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy || _pending.busy.contains(widget.batchCode)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted && error is! HarvestAccountChanged) {
        setState(() => _error = apiErrorMessage(error));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _start() => _run(() async {
    final session = await ref
        .read(harvestActionsProvider)
        .start(widget.batchCode, name: _name.text, note: _note.text);
    if (!mounted) return;
    setState(() {
      _historyId = session.status == 'Open' ? null : session.id;
      _recordsPage = 1;
      _name.clear();
      _note.clear();
    });
  });
  Future<void> _record(HarvestContext data) => _run(() async {
    final weight = int.tryParse(_weight.text.trim());
    if (weight == null ||
        weight < 1 ||
        weight > 32767 ||
        _shell == null ||
        _slot == null) {
      return;
    }
    if (data.currentCrab?.id != _confirmedCrabId ||
        data.activeHarvest?.id != _confirmedHarvestId) {
      setState(() {
        _shell = null;
        _error = 'Đợt hoặc cá thể đã thay đổi. Tải lại hộp và xác nhận vỏ trước khi cân.';
      });
      await _refresh();
      return;
    }
    final input = HarvestInput(
      harvestId: _confirmedHarvestId!,
      requestId: newSlotEventRequestId(),
      slotCode: _slot!,
      expectedCrabItemId: _confirmedCrabId!,
      weightG: weight,
      shellCondition: _shell!,
    );
    try {
      final result = await ref
          .read(harvestActionsProvider)
          .record(widget.batchCode, input);
      if (mounted) {
        setState(() {
          _result = result;
          _resetEntry();
        });
      }
    } catch (_) {
      if (mounted && !_pending.records.containsKey(widget.batchCode)) {
        setState(_resetEntry);
      }
      rethrow;
    }
  });
  void _resetEntry() {
    _slot = null;
    _shell = null;
    _confirmedCrabId = null;
    _confirmedHarvestId = null;
    _weight.clear();
    _recordsPage = 1;
  }

  Future<void> _retryRecord() => _run(() async {
    final result = await ref
        .read(harvestActionsProvider)
        .retryRecord(widget.batchCode);
    if (mounted) {
      setState(() {
        _result = result;
        _resetEntry();
      });
    }
  });
  Future<void> _edit(HarvestSession session) async {
    var name = session.name ?? '', note = session.note ?? '';
    final edited = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sửa thông tin đợt'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                initialValue: name,
                onChanged: (value) => name = value,
                maxLength: 100,
                decoration: const InputDecoration(labelText: 'Tên đợt'),
              ),
              TextFormField(
                initialValue: note,
                onChanged: (value) => note = value,
                maxLength: 300,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Ghi chú'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, (name, note)),
            child: const Text('Lưu thông tin'),
          ),
        ],
      ),
    );
    if (!mounted || edited == null) return;
    await _run(() async {
      await ref
          .read(harvestActionsProvider)
          .update(session, name: edited.$1, note: edited.$2);
    });
  }

  Future<void> _complete(HarvestSession session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Chốt đợt thu hoạch?'),
        content: Text(
          '${session.displayName}: ${session.harvestedCount} con · ${session.totalWeightKg.toStringAsFixed(3)} kg. Cua còn lại tiếp tục nuôi trong lô.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Xác nhận chốt'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    await _run(() async {
      final done = await ref.read(harvestActionsProvider).complete(session);
      if (mounted) {
        setState(() {
          _historyId = done.id;
          _resetEntry();
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(harvestPendingProvider);
    final data = ref.watch(harvestContextProvider((widget.batchCode, _slot)));
    final sessions = ref.watch(
      harvestSessionsProvider((widget.batchCode, _sessionsPage)),
    );
    final active = data.asData?.value.activeHarvest;
    final selectedId = _historyId ?? active?.id;
    final selected = selectedId == null
        ? null
        : ref.watch(harvestSessionProvider(selectedId));
    final pendingRecord = _pending.records[widget.batchCode],
        pendingStart = _pending.starts[widget.batchCode];
    final sending = _busy || _pending.busy.contains(widget.batchCode);
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              SubPageHeader(title: 'Thu hoạch · ${widget.batchCode}'),
              const SizedBox(height: 16),
              if (_error != null) _message(_error!),
              if (sending) const LinearProgressIndicator(),
              if (pendingRecord != null)
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Chưa xác định kết quả lần cân',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        'Đợt #${pendingRecord.harvestId} · hộp ${pendingRecord.slotCode} · cá thể #${pendingRecord.expectedCrabItemId} · ${pendingRecord.weightG} g · ${pendingRecord.shellCondition.label}',
                      ),
                      const Text(
                        'Gửi lại yêu cầu cũ để lấy kết quả trước khi đổi hộp hoặc số cân.',
                      ),
                      FilledButton(
                        onPressed: sending ? null : _retryRecord,
                        child: const Text('Gửi lại yêu cầu cũ'),
                      ),
                    ],
                  ),
                ),
              if (pendingStart != null)
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Chưa xác định kết quả bắt đầu đợt.'),
                      Text(pendingStart.name ?? 'Đợt chưa đặt tên'),
                      FilledButton(
                        onPressed: sending ? null : _start,
                        child: const Text('Gửi lại yêu cầu bắt đầu'),
                      ),
                    ],
                  ),
                ),
              if (_result != null) ...[
                const SizedBox(height: 12),
                _recordCard(_result!, saved: true),
              ],
              const SizedBox(height: 12),
              ...data.when(
                loading: () => [const LoadingSkeleton()],
                error: (error, _) => [
                  _message(apiErrorMessage(error)),
                  TextButton(onPressed: _refresh, child: const Text('Thử lại')),
                ],
                data: (value) => [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${value.harvestedCount} con đã thu hoạch · ${value.totalWeightKg.toStringAsFixed(3)} kg',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          'Còn ${value.remainingGrowingCount} con đang nuôi',
                        ),
                        if (value.activeHarvest != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            value.activeHarvest!.displayName,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            '${value.activeHarvest!.statusLabel} · ${value.activeHarvest!.harvestedCount} con · ${value.activeHarvest!.totalWeightKg.toStringAsFixed(3)} kg',
                          ),
                          if (value.activeHarvest!.note?.isNotEmpty == true)
                            Text(value.activeHarvest!.note!),
                          if (value.canComplete &&
                              value.activeHarvest!.canComplete)
                            Wrap(
                              spacing: 8,
                              children: [
                                TextButton(
                                  onPressed: _locked
                                      ? null
                                      : () => _edit(value.activeHarvest!),
                                  child: const Text('Sửa thông tin đợt'),
                                ),
                                TextButton(
                                  onPressed: _locked
                                      ? null
                                      : () => _complete(value.activeHarvest!),
                                  child: const Text('Chốt đợt'),
                                ),
                              ],
                            ),
                        ] else if (value.canStart) ...[
                          const SizedBox(height: 12),
                          TextField(
                            key: const Key('harvest-name'),
                            controller: _name,
                            enabled: !_locked,
                            maxLength: 100,
                            decoration: const InputDecoration(
                              labelText: 'Tên đợt (tùy chọn)',
                            ),
                          ),
                          TextField(
                            controller: _note,
                            enabled: !_locked,
                            maxLength: 300,
                            maxLines: 2,
                            decoration: const InputDecoration(
                              labelText: 'Ghi chú (tùy chọn)',
                            ),
                          ),
                          FilledButton(
                            onPressed: _locked ? null : _start,
                            child: const Text('Bắt đầu đợt'),
                          ),
                        ] else
                          const Text(
                            'Chưa có đợt mở. Chủ hộ có thể bắt đầu đợt mới.',
                          ),
                      ],
                    ),
                  ),
                  if (value.activeHarvest != null &&
                      value.canRecord &&
                      value.activeHarvest!.canRecord) ...[
                    const SizedBox(height: 12),
                    _weighForm(value),
                  ],
                ],
              ),
              const SizedBox(height: 24),
              Text(
                'Các đợt thu hoạch',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              ...sessions.when(
                loading: () => [const LoadingSkeleton()],
                error: (error, _) => [
                  _message(apiErrorMessage(error)),
                  TextButton(
                    onPressed: () => ref.invalidate(
                      harvestSessionsProvider((
                        widget.batchCode,
                        _sessionsPage,
                      )),
                    ),
                    child: const Text('Tải lại các đợt'),
                  ),
                ],
                data: (page) => [
                  if (page.items.isEmpty) const Text('Chưa có đợt thu hoạch.'),
                  for (final session in page.items)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(session.displayName),
                      subtitle: Text(
                        '${session.statusLabel} · ${session.harvestedCount} con · ${session.totalWeightKg.toStringAsFixed(3)} kg',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      selected: selectedId == session.id,
                      onTap: sending
                          ? null
                          : () => setState(() {
                              _historyId = session.id;
                              _recordsPage = 1;
                            }),
                    ),
                  _pagination(
                    page.page,
                    page.hasNext,
                    (next) => setState(() => _sessionsPage = next),
                  ),
                ],
              ),
              if (selectedId != null && selected != null) ...[
                const SizedBox(height: 16),
                Text(
                  'Cá thể đã cân',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                ...selected.when(
                  loading: () => [const LoadingSkeleton()],
                  error: (error, _) => [_message(apiErrorMessage(error))],
                  data: (session) => [
                    Text('${session.displayName} · ${session.statusLabel}'),
                    if (session.status == 'Completed') ...[
                      const SizedBox(height: 8),
                      const Text('Tổng hợp theo hạng cua'),
                      if (session.gradeSummaries.isEmpty)
                        const Text('Đợt này không có cua được ghi nhận.'),
                      for (final grade in session.gradeSummaries)
                        Text('${grade.gradeName} (${grade.gradeCode}) · ${grade.crabCount} con · ${grade.totalWeightKg.toStringAsFixed(3)} kg'),
                    ],
                  ],
                ),
                _history(selectedId),
              ],
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _weighForm(HarvestContext data) {
    final boxes = ref.watch(harvestBoxesProvider(widget.batchCode));
    final weight = int.tryParse(_weight.text.trim());
    final validWeight = weight != null && weight >= 1 && weight <= 32767;
    final ready =
        !_locked &&
        validWeight &&
        _shell != null &&
        _slot != null &&
        data.slotStatus == 'Occupied' &&
        data.currentCrab != null &&
        data.canRecord;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Cân từng cá thể',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          boxes.when(
            loading: () => const LoadingSkeleton(),
            error: (error, _) => Column(
              children: [
                _message(apiErrorMessage(error)),
                TextButton(
                  onPressed: () =>
                      ref.invalidate(harvestBoxesProvider(widget.batchCode)),
                  child: const Text('Tải lại hộp'),
                ),
              ],
            ),
            data: (items) => items.isEmpty
                ? const Text('Không còn hộp có cua thuộc lô này.')
                : SizedBox(
                    key: const Key('harvest-box'),
                    child: DropdownButtonFormField<String>(
                      key: ValueKey(_slot),
                      initialValue: items.any((b) => b.slotCode == _slot)
                          ? _slot
                          : null,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Hộp đang nuôi',
                      ),
                      items: items
                          .map(
                            (box) => DropdownMenuItem(
                              value: box.slotCode,
                              child: Text('Hộp ${box.slotCode}'),
                            ),
                          )
                          .toList(),
                      onChanged: _locked
                          ? null
                          : (slot) => setState(() {
                              _resetEntry();
                              _slot = slot;
                              _error = null;
                            }),
                    ),
                  ),
          ),
          if (_slot != null) ...[
            const SizedBox(height: 12),
            if (data.currentCrab != null) ...[
              Text('Cá thể #${data.currentCrab!.id}'),
              SelectableText(data.currentCrab!.itemUuid),
              if (data.latestMoltedAt != null)
                Text(
                  'Lột gần nhất: ${_time(data.latestMoltedAt!)}. Xác nhận vỏ hiện tại khi cân.',
                ),
            ] else
              const Text('Hộp không còn cá thể hợp lệ. Chọn lại hộp.'),
          ],
          const SizedBox(height: 16),
          TextField(
            key: const Key('harvest-weight'),
            controller: _weight,
            enabled: !_locked && data.currentCrab != null && _slot != null,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Khối lượng (gram)',
              helperText: 'Số nguyên từ 1 đến 32767 g',
              errorText: _weight.text.isNotEmpty && !validWeight
                  ? 'Nhập số gram nguyên từ 1 đến 32767.'
                  : null,
            ),
          ),
          const SizedBox(height: 12),
          const Text('Trạng thái vỏ hiện tại (bắt buộc)'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final shell in ShellCondition.values)
                ChoiceChip(
                  label: Text(shell.label),
                  selected: _shell == shell,
                  onSelected:
                      _locked || data.currentCrab == null || _slot == null
                      ? null
                      : (_) => setState(() {
                          _shell = shell;
                          _confirmedCrabId = data.currentCrab!.id;
                          _confirmedHarvestId = data.activeHarvest?.id;
                        }),
                ),
            ],
          ),
          const SizedBox(height: 12),
          const Text('Máy chủ xếp hạng và tạo tem sau khi lưu.'),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: ready ? () => _record(data) : null,
            child: const Text('Ghi nhận thu hoạch'),
          ),
        ],
      ),
    );
  }

  Widget _history(int id) {
    final history = ref.watch(harvestRecordsProvider((id, _recordsPage)));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: history.when(
        loading: () => [const LoadingSkeleton()],
        error: (error, _) => [
          _message(apiErrorMessage(error)),
          TextButton(
            onPressed: () =>
                ref.invalidate(harvestRecordsProvider((id, _recordsPage))),
            child: const Text('Tải lại lịch sử'),
          ),
        ],
        data: (page) => [
          if (page.items.isEmpty)
            const Text('Chưa ghi nhận cá thể nào trong đợt này.'),
          for (final item in page.items)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _recordCard(item),
            ),
          _pagination(
            page.page,
            page.hasNext,
            (next) => setState(() => _recordsPage = next),
          ),
        ],
      ),
    );
  }

  Widget _recordCard(HarvestedCrab item, {bool saved = false}) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (saved)
          const Text(
            'Đã lưu thu hoạch',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        Text('Cá thể #${item.crabItemId} · hộp ${item.slotCode ?? '—'}'),
        SelectableText(item.itemUuid),
        Text(
          '${item.weightG ?? '—'} g · ${item.gradeCode ?? 'Chưa có hạng'}${item.gradeName == null ? '' : ' · ${item.gradeName}'}',
        ),
        if (item.shellCondition != null)
          Text(item.shellCondition == 'SoftShell' ? 'Vỏ mềm' : 'Vỏ cứng'),
        SelectableText(
          'Tem: ${item.tagCode ?? 'Chưa có dữ liệu'} · ${item.tagStatus ?? 'Chưa có trạng thái lịch sử'}',
        ),
        if (item.recordedAt != null) Text(_time(item.recordedAt!)),
        if (item.tracePath != null) ...[
          SelectableText(item.tracePath!),
          TextButton(
            onPressed: () async {
              try {
                final opened = await launchUrl(
                  Uri.parse(webUrl).resolve(item.tracePath!),
                );
                if (!opened && mounted) {
                  setState(() => _error = 'Không mở được trang truy xuất.');
                }
              } catch (_) {
                if (mounted) {
                  setState(() => _error = 'Không mở được trang truy xuất.');
                }
              }
            },
            child: const Text('Mở truy xuất'),
          ),
        ],
        if (item.tagCode != null)
          TextButton.icon(
            onPressed: () => context.push(Routes.operatorTags),
            icon: const Icon(Icons.local_offer_outlined),
            label: const Text('Quản lý tem đã in'),
          ),
      ],
    ),
  );
  Widget _message(String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Semantics(
      liveRegion: true,
      child: Text(
        text,
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    ),
  );
  Widget _pagination(int page, bool hasNext, ValueChanged<int> onChange) =>
      Wrap(
        spacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          TextButton(
            onPressed: page > 1 && !_busy ? () => onChange(page - 1) : null,
            child: const Text('Trang trước'),
          ),
          Text('Trang $page'),
          TextButton(
            onPressed: hasNext && !_busy ? () => onChange(page + 1) : null,
            child: const Text('Trang sau'),
          ),
        ],
      );
}

String _time(DateTime time) {
  final local = time.toLocal();
  String n(int value) => value.toString().padLeft(2, '0');
  return '${n(local.day)}/${n(local.month)}/${local.year} ${n(local.hour)}:${n(local.minute)}';
}

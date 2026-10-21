import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/operator_repository.dart';
import '../evidence/evidence_repository.dart';
import '../slot_events/slot_event_repository.dart';
import 'harvest_models.dart';
import 'harvest_repository.dart';

class HarvestStartInput {
  HarvestStartInput({required this.requestId, this.name, this.note});
  final String requestId;
  final String? name, note;
}

/// Retained while navigating within this account. Unknown outcomes are retried
/// verbatim, including when the session has completed or the box is reused.
class HarvestPendingStore {
  HarvestPendingStore(this._changed);
  final void Function() _changed;
  final starts = <String, HarvestStartInput>{};
  final records = <String, HarvestInput>{};
  final busy = <String>{};
  void notifyChanged() => _changed();
}

final harvestPendingProvider = Provider((ref) {
  ref.watch(productionAccountProvider);
  return HarvestPendingStore(() {
    if (ref.mounted) ref.notifyListeners();
  });
});
final harvestActionsProvider = Provider(HarvestActions.new);

class HarvestAccountChanged implements Exception {}

class HarvestActions {
  HarvestActions(this.ref);
  final Ref ref;
  bool _current(Object account) =>
      ref.mounted && ref.read(productionAccountProvider) == account;

  void refresh(String batchCode) {
    ref.invalidate(harvestContextProvider);
    ref.invalidate(harvestSessionsProvider);
    ref.invalidate(harvestSessionProvider);
    ref.invalidate(harvestRecordsProvider);
    ref.invalidate(harvestBoxesProvider(batchCode));
    ref.invalidate(activeBatchesProvider);
    ref.invalidate(todaySummaryProvider);
    ref.invalidate(boxesProvider);
    ref.invalidate(captureBoxesProvider);
    ref.invalidate(slotEventSourcesProvider(batchCode));
    ref.invalidate(slotEventDestinationsProvider);
    ref.invalidate(slotEventContextProvider);
    ref.invalidate(slotEventHistoryProvider);
  }

  Future<HarvestSession> start(
    String batchCode, {
    String? name,
    String? note,
  }) async {
    final account = ref.read(productionAccountProvider);
    final store = ref.read(harvestPendingProvider);
    if (!store.busy.add(batchCode)) throw StateError('Yêu cầu đang được gửi.');
    final input = store.starts.putIfAbsent(
      batchCode,
      () => HarvestStartInput(
        requestId: newSlotEventRequestId(),
        name: _trim(name),
        note: _trim(note),
      ),
    );
    store.notifyChanged();
    try {
      final session = await ref
          .read(harvestRepositoryProvider)
          .start(
            batchCode,
            requestId: input.requestId,
            name: input.name,
            note: input.note,
          );
      if (!_current(account)) throw HarvestAccountChanged();
      store.starts.remove(batchCode);
      store.notifyChanged();
      refresh(batchCode);
      return session;
    } catch (error) {
      if (_current(account) && _knownFailure(error)) {
        store.starts.remove(batchCode);
        store.notifyChanged();
        refresh(batchCode);
      }
      rethrow;
    } finally {
      store.busy.remove(batchCode);
      store.notifyChanged();
    }
  }

  Future<HarvestedCrab> record(String batchCode, HarvestInput input) async {
    final account = ref.read(productionAccountProvider);
    final store = ref.read(harvestPendingProvider);
    if (!store.busy.add(batchCode)) throw StateError('Yêu cầu đang được gửi.');
    final pending = store.records.putIfAbsent(batchCode, () => input);
    store.notifyChanged();
    try {
      final result = await ref.read(harvestRepositoryProvider).record(pending);
      if (!_current(account)) throw HarvestAccountChanged();
      store.records.remove(batchCode);
      store.notifyChanged();
      refresh(batchCode);
      return result;
    } catch (error) {
      if (_current(account) && _knownFailure(error)) {
        store.records.remove(batchCode);
        store.notifyChanged();
        refresh(batchCode);
      }
      rethrow;
    } finally {
      store.busy.remove(batchCode);
      store.notifyChanged();
    }
  }

  Future<HarvestedCrab> retryRecord(String batchCode) => record(
    batchCode,
    ref.read(harvestPendingProvider).records[batchCode] ??
        (throw StateError('Không có yêu cầu chờ.')),
  );

  Future<HarvestSession> update(
    HarvestSession session, {
    String? name,
    String? note,
  }) async {
    final account = ref.read(productionAccountProvider);
    final result = await ref
        .read(harvestRepositoryProvider)
        .update(
          session.id,
          expectedRevision: session.revision,
          name: _trim(name),
          note: _trim(note),
        );
    if (!_current(account)) throw HarvestAccountChanged();
    refresh(session.batchCode);
    return result;
  }

  Future<HarvestSession> complete(HarvestSession session) async {
    final account = ref.read(productionAccountProvider);
    final result = await ref
        .read(harvestRepositoryProvider)
        .complete(session.id, expectedRevision: session.revision);
    if (!_current(account)) throw HarvestAccountChanged();
    refresh(session.batchCode);
    return result;
  }

  static String? _trim(String? value) =>
      value?.trim().isEmpty == true ? null : value?.trim();
  static bool _knownFailure(Object error) =>
      error is DioException &&
      error.response?.statusCode != null &&
      error.response!.statusCode! < 500 &&
      error.response!.statusCode != 408;
}

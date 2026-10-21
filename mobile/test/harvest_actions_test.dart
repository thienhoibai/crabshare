import 'dart:async';

import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_actions.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_repository.dart';
import 'package:crabshare_mobile/features/operator/harvest/harvest_models.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/harvest_fakes.dart';

const input = HarvestInput(
  harvestId: 41,
  requestId: 'record-id',
  slotCode: '0006',
  expectedCrabItemId: 123,
  weightG: 250,
  shellCondition: ShellCondition.softShell,
);

void main() {
  test('lost record response preserves exact immutable payload through occupant/session changes', () async {
    final server = HarvestServer()..lostRecordResponse = true;
    final container = ProviderContainer(
      overrides: [
        harvestRepositoryProvider.overrideWithValue(
          ApiHarvestRepository(server.dio()),
        ),
      ],
    );
    addTearDown(container.dispose);
    final actions = container.read(harvestActionsProvider);
    await expectLater(
      actions.record('REAL-01', input),
      throwsA(isA<DioException>()),
    );
    expect(
      container.read(harvestPendingProvider).records['REAL-01'],
      same(input),
    );
    server.crabId = 456;
    server.active = false;
    final result = await actions.retryRecord('REAL-01');
    final posts = server.requests.where((r) => r.method == 'POST').toList();
    expect(posts, hasLength(2));
    expect(posts[0].path, posts[1].path);
    expect(posts[0].data, posts[1].data);
    expect(result.crabItemId, 123);
    expect(container.read(harvestPendingProvider).records, isEmpty);
  });

  test('lost start response reuses original request and metadata', () async {
    final server = HarvestServer()..lostStartResponse = true;
    final container = ProviderContainer(
      overrides: [
        harvestRepositoryProvider.overrideWithValue(
          ApiHarvestRepository(server.dio()),
        ),
      ],
    );
    addTearDown(container.dispose);
    final actions = container.read(harvestActionsProvider);
    await expectLater(
      actions.start('REAL-01', name: 'Sáng', note: 'A'),
      throwsA(isA<DioException>()),
    );
    await actions.start('REAL-01', name: 'Changed', note: 'B');
    expect(server.requests.first.data, server.requests.last.data);
    expect(server.requests.last.data['name'], 'Sáng');
    expect(container.read(harvestPendingProvider).starts, isEmpty);
  });

  test('known 409 clears pending record so context can be reloaded before a new selection', () async {
    final server = HarvestServer()..failNextRecord = true;
    final container = ProviderContainer(
      overrides: [
        harvestRepositoryProvider.overrideWithValue(
          ApiHarvestRepository(server.dio()),
        ),
      ],
    );
    addTearDown(container.dispose);
    await expectLater(
      container.read(harvestActionsProvider).record('REAL-01', input),
      throwsA(isA<DioException>()),
    );
    expect(container.read(harvestPendingProvider).records, isEmpty);
  });

  test('old account response cannot clear or refresh the new account pending state', () async {
    final session = _SwitchSession();
    final repo = _DelayedRepository();
    final container = ProviderContainer(
      overrides: [
        sessionProvider.overrideWith(() => session),
        harvestRepositoryProvider.overrideWithValue(repo),
      ],
    );
    addTearDown(container.dispose);
    final oldStore = container.read(harvestPendingProvider);
    final future = container
        .read(harvestActionsProvider)
        .record('REAL-01', input);
    session.change();
    final newStore = container.read(harvestPendingProvider);
    expect(newStore, isNot(same(oldStore)));
    final newInput = HarvestInput(
      harvestId: 42,
      requestId: 'new',
      slotCode: '0010',
      expectedCrabItemId: 456,
      weightG: 500,
      shellCondition: ShellCondition.hardShell,
    );
    newStore.records['REAL-01'] = newInput;
    repo.pending.complete(HarvestedCrab.fromJson(harvestRecordJson()));
    await expectLater(future, throwsA(isA<HarvestAccountChanged>()));
    expect(newStore.records['REAL-01'], same(newInput));
  });
}

class _SwitchSession extends SessionController {
  _SwitchSession() : super(const SessionState(token: 'old'));
  void change() => state = const SessionState(token: 'new');
}

class _DelayedRepository extends ApiHarvestRepository {
  _DelayedRepository() : super(Dio());
  final pending = Completer<HarvestedCrab>();
  @override
  Future<HarvestedCrab> record(HarvestInput input) => pending.future;
}

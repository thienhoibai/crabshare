import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import 'batch_repository.dart' show optional;
import 'portfolio_repository.dart';

/// Một cuộc biểu quyết tập thể của Lô. Phiếu tính theo vốn đã chốt.
class Decision {
  const Decision({
    required this.decisionNo,
    required this.batchCode,
    required this.kind,
    required this.proposal,
    required this.status,
    required this.closesAt,
    required this.eligibleCapital,
    required this.yesCapital,
    required this.noCapital,
    required this.yesPct,
    required this.noPct,
    required this.canVote,
    this.decidedAt,
    this.myChoice,
  });
  final String decisionNo, batchCode, kind, proposal, status;
  final DateTime closesAt;
  final DateTime? decidedAt;
  final int eligibleCapital, yesCapital, noCapital;
  final double yesPct, noPct;
  final String? myChoice;
  final bool canVote;

  bool get isOpen => status == 'Open';

  factory Decision.fromJson(Json j) => Decision(
    decisionNo: str(j, 'decisionNo'),
    batchCode: str(j, 'batchCode'),
    kind: str(j, 'kind'),
    proposal: str(j, 'proposal'),
    status: str(j, 'status'),
    closesAt: dateOf(j, 'closesAt'),
    decidedAt: dateOrNull(j, 'decidedAt'),
    eligibleCapital: intOf(j, 'eligibleCapital'),
    yesCapital: intOf(j, 'yesCapital'),
    noCapital: intOf(j, 'noCapital'),
    yesPct: doubleOf(j, 'yesPct'),
    noPct: doubleOf(j, 'noPct'),
    myChoice: strOrNull(j, 'myChoice'),
    canVote: boolOf(j, 'canVote'),
  );
}

abstract interface class DecisionRepository {
  /// Các cuộc biểu quyết của một Lô đã chốt vốn, cũ trước.
  Future<List<Decision>> list(String batchCode);

  /// [choice] là `Yes` hoặc `No`. Trả về cuộc biểu quyết sau khi ghi phiếu.
  Future<Decision> vote(String decisionNo, String choice);
}

class ApiDecisionRepository implements DecisionRepository {
  ApiDecisionRepository(this._dio);
  final Dio _dio;

  @override
  Future<List<Decision>> list(String batchCode) async => [
    for (final d in await _dio.getList('/api/batches/${Uri.encodeComponent(batchCode)}/decisions')) Decision.fromJson(d),
  ];

  @override
  Future<Decision> vote(String decisionNo, String choice) async => Decision.fromJson(
    await _dio.postJson('/api/decisions/${Uri.encodeComponent(decisionNo)}/votes', data: {'choice': choice}),
  );
}

final decisionRepositoryProvider = Provider<DecisionRepository>((ref) => ApiDecisionRepository(ref.watch(dioProvider)));

/// Tăng sau mỗi phiếu đã ghi để các danh sách biểu quyết khác tải lại.
final voteRevisionProvider = NotifierProvider<VoteRevision, int>(VoteRevision.new);

class VoteRevision extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state++;
}

/// Biểu quyết của một Lô, mới nhất trước.
class BatchDecisions extends AsyncNotifier<List<Decision>> {
  BatchDecisions(this.batchCode);
  final String batchCode;

  @override
  Future<List<Decision>> build() async {
    requireInvestor(ref);
    final list = await ref.watch(decisionRepositoryProvider).list(batchCode);
    return list.reversed.toList();
  }

  Future<void> vote(Decision decision, String choice) async {
    final updated = await ref.read(decisionRepositoryProvider).vote(decision.decisionNo, choice);
    if (!ref.mounted) return;
    state = AsyncData([
      for (final d in state.value ?? const <Decision>[]) d.decisionNo == updated.decisionNo ? updated : d,
    ]);
    ref.read(voteRevisionProvider.notifier).bump();
  }
}

final batchDecisionsProvider = AsyncNotifierProvider.autoDispose.family<BatchDecisions, List<Decision>, String>(
  BatchDecisions.new,
  retry: (_, _) => null,
);

/// Biểu quyết ở mọi Lô tôi đã chốt vốn: đang mở trước (hạn gần nhất trên cùng), rồi đã kết thúc.
class AllDecisions extends AsyncNotifier<List<Decision>> {
  @override
  Future<List<Decision>> build() async {
    final repo = ref.watch(decisionRepositoryProvider);
    ref.watch(voteRevisionProvider);
    final items = await ref.watch(portfolioProvider.future);
    final lists = await Future.wait([
      for (final p in items)
        if (p.frozen) optional(repo.list(p.batch.code)),
    ]);
    final all = [for (final list in lists) ...?list];
    final open = [for (final d in all) if (d.isOpen) d]..sort((a, b) => a.closesAt.compareTo(b.closesAt));
    final closed = [for (final d in all) if (!d.isOpen) d]
      ..sort((a, b) => (b.decidedAt ?? b.closesAt).compareTo(a.decidedAt ?? a.closesAt));
    return [...open, ...closed];
  }

  Future<void> vote(Decision decision, String choice) async {
    await ref.read(decisionRepositoryProvider).vote(decision.decisionNo, choice);
    if (!ref.mounted) return;
    ref.invalidate(batchDecisionsProvider(decision.batchCode));
    ref.read(voteRevisionProvider.notifier).bump();
  }
}

final allDecisionsProvider = AsyncNotifierProvider.autoDispose<AllDecisions, List<Decision>>(
  AllDecisions.new,
  retry: (_, _) => null,
);

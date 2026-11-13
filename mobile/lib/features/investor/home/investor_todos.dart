import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';
import '../data/batch_repository.dart' show optional;
import '../data/contract_repository.dart';
import '../data/decision_repository.dart';
import '../data/portfolio_repository.dart';
import '../data/settlement_repository.dart';
import '../kyc/kyc_repository.dart';
import '../widgets/investor_ui.dart';

enum TodoKind { kyc, payment, contract, vote, settlement }

/// Một việc nhà đầu tư cần làm tiếp, hiện ở đầu màn Tổng quan.
class InvestorTodo {
  const InvestorTodo(this.kind, this.title, this.sub, {this.batchCode, this.settlementId});
  final TodoKind kind;
  final String title, sub;
  final String? batchCode;
  final int? settlementId;
}

/// Việc cần làm: xác minh danh tính, chuyển khoản cho khoản đang giữ chỗ, ký hợp đồng tới lượt,
/// biểu quyết đang mở, bảng quyết toán còn hạn góp ý. Nguồn nào lỗi thì bỏ qua nguồn đó.
final investorTodosProvider = FutureProvider.autoDispose<List<InvestorTodo>>((ref) async {
  ref.watch(voteRevisionProvider);
  final decisionRepo = ref.watch(decisionRepositoryProvider);
  final kycFuture = optional(ref.watch(kycDetailsProvider.future));
  final contributionsFuture = optional(ref.watch(myContributionsProvider.future));
  final contractsFuture = optional(ref.watch(myContractsProvider.future));
  final settlementsFuture = optional(ref.watch(mySettlementsProvider.future));
  final items = await ref.watch(portfolioProvider.future);

  final decisionLists = await Future.wait([
    for (final p in items)
      if (p.frozen) optional(decisionRepo.list(p.batch.code)),
  ]);
  final kyc = await kycFuture;
  final contributions = await contributionsFuture ?? const <MyContribution>[];
  final contracts = await contractsFuture ?? const <ContractSummary>[];
  final settlements = await settlementsFuture ?? const <SettlementSummary>[];

  return [
    if (kyc != null && kyc.status != KycStatus.verified)
      const InvestorTodo(TodoKind.kyc, 'Xác minh danh tính', 'Cần có trước khi góp vốn'),
    for (final c in contributions)
      if (c.waitingForPayment())
        InvestorTodo(
          TodoKind.payment,
          'Chuyển khoản cho Lô ${c.batchCode}',
          '${formatVnd(c.amount)} · giữ chỗ tới ${dateTimeText(c.expiresAt)}',
          batchCode: c.batchCode,
        ),
    for (final c in contracts)
      if (c.waitsForMe) InvestorTodo(TodoKind.contract, 'Ký hợp đồng ${c.contractNo}', 'Lô ${c.batchCode} · ${formatVnd(c.amount)}'),
    for (final list in decisionLists)
      for (final d in list ?? const <Decision>[])
        if (d.canVote)
          InvestorTodo(
            TodoKind.vote,
            'Biểu quyết: ${statusLabel('decisionKind', d.kind)}',
            'Lô ${d.batchCode} · hạn ${dateTimeText(d.closesAt)}',
            batchCode: d.batchCode,
          ),
    for (final s in settlements)
      if (s.feedbackOpen)
        InvestorTodo(
          TodoKind.settlement,
          'Xem bảng quyết toán Lô ${s.batchCode}',
          s.feedbackDeadline == null ? 'Đang lấy góp ý' : 'Góp ý tới ${dateTimeText(s.feedbackDeadline!)}',
          settlementId: s.id,
        ),
  ];
}, retry: (_, _) => null);

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import 'portfolio_repository.dart' show requireInvestor;

/// Một trong sáu điều kiện chờ quyết toán của Lô.
class ReadinessCondition {
  const ReadinessCondition({required this.no, required this.description, required this.met, required this.pending});
  final int no, pending;
  final String description;
  final bool met;

  factory ReadinessCondition.fromJson(Json j) => ReadinessCondition(
    no: intOf(j, 'no'),
    description: str(j, 'description'),
    met: boolOf(j, 'met'),
    pending: intOf(j, 'pending'),
  );
}

class SettlementReadiness {
  const SettlementReadiness({required this.ready, required this.conditions});
  final bool ready;
  final List<ReadinessCondition> conditions;

  int get missing => conditions.where((c) => !c.met).length;

  factory SettlementReadiness.fromJson(Json j) => SettlementReadiness(
    ready: boolOf(j, 'ready'),
    conditions: [for (final c in asJsonList(j['conditions'])) ReadinessCondition.fromJson(c)],
  );
}

/// Bảng quyết toán đã công bố của một Lô tôi góp vốn (dòng danh sách).
class SettlementSummary {
  const SettlementSummary({
    required this.id,
    required this.batchCode,
    required this.batchTitle,
    required this.status,
    required this.feedbackOpen,
    this.myNetPayout,
    this.feedbackDeadline,
  });
  final int id;
  final String batchCode, batchTitle, status;
  final int? myNetPayout;
  final DateTime? feedbackDeadline;

  /// Còn trong hạn góp ý.
  final bool feedbackOpen;

  factory SettlementSummary.fromJson(Json j) => SettlementSummary(
    id: intOf(j, 'settlementId'),
    batchCode: str(j, 'batchCode'),
    batchTitle: str(j, 'batchTitle'),
    status: str(j, 'status'),
    myNetPayout: intOrNull(j, 'myNetPayout'),
    feedbackDeadline: dateOrNull(j, 'feedbackDeadline'),
    feedbackOpen: boolOf(j, 'feedbackOpen'),
  );
}

/// Dòng của một nhà đầu tư trong bảng quyết toán. Nhà đầu tư chỉ nhận được dòng của mình.
class SettlementLine {
  const SettlementLine({
    required this.capitalReturn,
    required this.profitShare,
    required this.taxWithheld,
    required this.netPayout,
    required this.isMine,
    this.payoutStatus,
  });
  final int capitalReturn, profitShare, taxWithheld, netPayout;
  final bool isMine;
  final String? payoutStatus;

  factory SettlementLine.fromJson(Json j) => SettlementLine(
    capitalReturn: intOf(j, 'capitalReturn'),
    profitShare: intOf(j, 'profitShare'),
    taxWithheld: intOf(j, 'taxWithheld'),
    netPayout: intOf(j, 'netPayout'),
    isMine: boolOf(j, 'isMine'),
    payoutStatus: strOrNull(j, 'payoutStatus'),
  );
}

/// Sao kê quyết toán của một Lô: số tổng của Lô và dòng của tôi.
class SettlementStatement {
  const SettlementStatement({
    required this.id,
    required this.batchCode,
    required this.batchTitle,
    required this.status,
    required this.revisionNo,
    required this.actualRevenue,
    required this.platformFee,
    required this.platformFeeRatePct,
    required this.lockedStandardCost,
    required this.revenuePool,
    required this.operatorSharePct,
    required this.operatorRemuneration,
    required this.distributable,
    required this.totalCapital,
    required this.investorCount,
    required this.disbursedTotal,
    required this.isLiquidation,
    required this.lines,
    this.feedbackDeadline,
  });
  final int id, revisionNo;
  final String batchCode, batchTitle, status;
  final int actualRevenue, platformFee, lockedStandardCost, revenuePool, operatorRemuneration, distributable;
  final int totalCapital, investorCount, disbursedTotal;
  final double platformFeeRatePct, operatorSharePct;
  final bool isLiquidation;
  final DateTime? feedbackDeadline;
  final List<SettlementLine> lines;

  SettlementLine? get mine {
    for (final line in lines) {
      if (line.isMine) return line;
    }
    return null;
  }

  /// Còn nhận góp ý: bảng đang lấy góp ý và chưa quá hạn.
  bool feedbackOpen([DateTime? now]) =>
      (status == 'Proposed' || status == 'Disputed') && feedbackDeadline != null && feedbackDeadline!.isAfter(now ?? DateTime.now());

  factory SettlementStatement.fromJson(Json j) {
    final breakdown = asJsonOrNull(j['breakdown']) ?? const <String, dynamic>{};
    return SettlementStatement(
      id: intOf(j, 'settlementId'),
      batchCode: str(j, 'batchCode'),
      batchTitle: str(j, 'batchTitle'),
      status: str(j, 'status'),
      revisionNo: intOf(j, 'revisionNo'),
      actualRevenue: intOf(j, 'actualRevenue'),
      platformFee: intOf(breakdown, 'platformFee'),
      platformFeeRatePct: doubleOf(breakdown, 'platformFeeRatePct'),
      lockedStandardCost: intOf(j, 'lockedStandardCost'),
      revenuePool: intOf(j, 'revenuePool'),
      operatorSharePct: doubleOf(j, 'operatorSharePct'),
      operatorRemuneration: intOf(j, 'operatorRemuneration'),
      distributable: intOf(j, 'distributable'),
      totalCapital: intOf(j, 'totalCapital'),
      investorCount: intOf(j, 'investorCount'),
      disbursedTotal: intOf(breakdown, 'disbursedTotal'),
      isLiquidation: boolOf(breakdown, 'isLiquidation'),
      feedbackDeadline: dateOrNull(j, 'feedbackDeadline'),
      lines: [for (final l in asJsonList(j['lines'])) SettlementLine.fromJson(l)],
    );
  }
}

abstract interface class SettlementRepository {
  /// Sáu điều kiện chờ quyết toán; nhà đầu tư có vốn đã chốt ở Lô mới xem được.
  Future<SettlementReadiness> readiness(String batchCode);
  Future<List<SettlementSummary>> mine();
  Future<SettlementStatement> statement(int id);
}

class ApiSettlementRepository implements SettlementRepository {
  ApiSettlementRepository(this._dio);
  final Dio _dio;

  @override
  Future<SettlementReadiness> readiness(String batchCode) async => SettlementReadiness.fromJson(
    await _dio.getJson('/api/batches/${Uri.encodeComponent(batchCode)}/settlement-readiness'),
  );

  @override
  Future<List<SettlementSummary>> mine() async => [
    for (final s in await _dio.getList('/api/me/settlements')) SettlementSummary.fromJson(s),
  ];

  @override
  Future<SettlementStatement> statement(int id) async => SettlementStatement.fromJson(await _dio.getJson('/api/settlements/$id'));
}

final settlementRepositoryProvider = Provider<SettlementRepository>((ref) => ApiSettlementRepository(ref.watch(dioProvider)));

final settlementReadinessProvider = FutureProvider.autoDispose.family<SettlementReadiness, String>((ref, code) {
  requireInvestor(ref);
  return ref.watch(settlementRepositoryProvider).readiness(code);
}, retry: (_, _) => null);

final mySettlementsProvider = FutureProvider.autoDispose<List<SettlementSummary>>((ref) {
  requireInvestor(ref);
  return ref.watch(settlementRepositoryProvider).mine();
}, retry: (_, _) => null);

final settlementStatementProvider = FutureProvider.autoDispose.family<SettlementStatement, int>((ref, id) {
  requireInvestor(ref);
  return ref.watch(settlementRepositoryProvider).statement(id);
}, retry: (_, _) => null);

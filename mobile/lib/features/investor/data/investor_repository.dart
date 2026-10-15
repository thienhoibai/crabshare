import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../shared/models/batch_enums.dart';
import 'investor_models.dart';

export 'portfolio_repository.dart' show myContributionsProvider;

abstract interface class InvestorRepository {
  Future<BatchPage> batches({BatchStatus? status, CrabType? crabType, int page = 1, int pageSize = 20, CancelToken? cancelToken});
  Future<BatchSummary> batchByCode(String code, {CancelToken? cancelToken});
}

final investorRepositoryProvider = Provider<InvestorRepository>(
  (ref) => ApiInvestorRepository(ref.watch(dioProvider)),
);
final discoveryStatusProvider = NotifierProvider<DiscoveryStatus, BatchStatus?>(DiscoveryStatus.new);
class DiscoveryStatus extends Notifier<BatchStatus?> {
  @override
  BatchStatus? build() => null;
  void select(BatchStatus? value) => state = value;
}
final discoveryTypeProvider = NotifierProvider<DiscoveryType, CrabType?>(DiscoveryType.new);
class DiscoveryType extends Notifier<CrabType?> {
  @override
  CrabType? build() => null;
  void select(CrabType? value) => state = value;
}
final discoveryPageProvider = NotifierProvider<DiscoveryPage, int>(DiscoveryPage.new);
class DiscoveryPage extends Notifier<int> {
  @override
  int build() => 1;
  void select(int value) => state = value;
}
void _requireInvestor(AppUser? user) {
  if (user == null || !user.isInvestor) {
    throw StateError('Bạn cần đăng nhập bằng tài khoản nhà đầu tư.');
  }
}

final batchesProvider = FutureProvider.autoDispose<BatchPage>((ref) {
  _requireInvestor(ref.watch(sessionProvider.select((s) => s.user)));
  final cancel = CancelToken();
  ref.onDispose(() => cancel.cancel());
  return ref.watch(investorRepositoryProvider).batches(
    status: ref.watch(discoveryStatusProvider),
    crabType: ref.watch(discoveryTypeProvider),
    page: ref.watch(discoveryPageProvider),
    cancelToken: cancel,
  );
}, retry: (count, error) => null);
final batchDetailProvider = FutureProvider.autoDispose.family<BatchSummary, String>((ref, code) {
  _requireInvestor(ref.watch(sessionProvider.select((s) => s.user)));
  final cancel = CancelToken();
  ref.onDispose(() => cancel.cancel());
  return ref.watch(investorRepositoryProvider).batchByCode(code, cancelToken: cancel);
}, retry: (count, error) => null);

class ApiInvestorRepository implements InvestorRepository {
  ApiInvestorRepository(this._dio);
  final Dio _dio;
  @override
  Future<BatchPage> batches({BatchStatus? status, CrabType? crabType, int page = 1, int pageSize = 20, CancelToken? cancelToken}) async {
    final response = await _dio.get<Map<String, dynamic>>('/api/batches', queryParameters: {
      if (status != null) 'status': status.apiValue,
      if (crabType != null) 'crabType': crabType.apiValue,
      'page': page, 'pageSize': pageSize,
    }, cancelToken: cancelToken);
    final data = response.data!;
    return BatchPage(items: (data['items'] as List).map((v) => discoveryBatchFromJson(Map<String, dynamic>.from(v as Map))).toList(),
      page: data['page'] as int, pageSize: data['pageSize'] as int, total: data['total'] as int);
  }
  @override
  Future<BatchSummary> batchByCode(String code, {CancelToken? cancelToken}) async {
    final response = await _dio.get<Map<String, dynamic>>('/api/batches/${Uri.encodeComponent(code)}', cancelToken: cancelToken);
    return discoveryBatchFromJson(response.data!);
  }
}

BatchSummary discoveryBatchFromJson(Map<String, dynamic> data) {
  final progress = Map<String, dynamic>.from(data['fundingProgress'] as Map);
  final cost = data['standardCost'] == null ? null : Map<String, dynamic>.from(data['standardCost'] as Map);
  DateTime? date(String key) => data[key] == null ? null : DateTime.parse(data[key] as String);
  return BatchSummary(
    code: data['batchCode'] as String, title: data['title'] as String,
    operatorName: data['operatorName'] as String,
    crabType: CrabType.fromApi(data['crabType'] as String),
    status: BatchStatus.fromApi(data['status'] as String),
    targetCapital: (data['targetCapital'] as num).toInt(),
    raisedCapital: (progress['confirmedCapital'] as num).toInt(),
    minContribution: (data['minContribution'] as num).toInt(),
    cycleDays: data['cycleDays'] as int, seedQuantity: data['seedQuantity'] as int,
    expectedOutputKg: (data['expectedOutputKg'] as num).toDouble(),
    restockCutoffDays: data['restockCutoffDays'] as int,
    minViableCapital: (data['minViableCapital'] as num).toInt(),
    maxCapital: (data['maxCapital'] as num).toInt(),
    operatorSharePct: (data['operatorSharePct'] as num).toDouble(),
    fundingOpenAt: date('fundingOpenAt'), fundingDeadline: date('fundingDeadline'),
    discoveryProgress: DiscoveryFundingProgress(
      confirmedCapital: (progress['confirmedCapital'] as num).toInt(),
      reservedCapital: (progress['reservedCapital'] as num).toInt(),
      investorCount: progress['investorCount'] as int,
      pctOfTarget: (progress['pctOfTarget'] as num).toDouble(),
      percentLabel: progress['percentLabel'] as String),
    standardCost: cost == null ? null : LockedStandardCost(
      versionNo: cost['versionNo'] as int, status: cost['status'] as String,
      total: (cost['total'] as num).toInt(),
      lockedAt: cost['lockedAt'] == null ? null : DateTime.parse(cost['lockedAt'] as String),
      items: (cost['items'] as List).map((v) => StandardCostItem(category: v['category'] as String, amount: (v['amount'] as num).toInt())).toList()),
  );
}

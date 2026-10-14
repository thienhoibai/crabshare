import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../../../shared/models/batch_enums.dart';
import 'investor_models.dart';

DateTime? _date(dynamic value) =>
    value == null ? null : DateTime.parse(value as String);
Map<String, dynamic> _map(dynamic value) =>
    Map<String, dynamic>.from(value as Map);

Contribution portfolioPositionFromJson(Map<String, dynamic> data) {
  final b = _map(data['batch']);
  final s = data['settlement'] == null ? null : _map(data['settlement']);
  return Contribution(
    batch: BatchSummary(
      code: b['code'] as String,
      title: b['title'] as String,
      operatorName: b['operatorName'] as String,
      crabType: CrabType.fromApi(b['crabType'] as String),
      status: BatchStatus.fromApi(b['status'] as String),
      targetCapital: b['targetCapital'] as int,
      raisedCapital: b['raisedCapital'] as int,
      minContribution: b['minContribution'] as int,
      cycleDays: b['cycleDays'] as int,
      seedQuantity: b['seedQuantity'] as int,
      fundingDeadline: _date(b['fundingDeadline']),
      dayOfCycle: b['dayOfCycle'] as int?,
      aliveCount: b['aliveCount'] as int?,
      openAlerts: b['openAlerts'] as int,
      expectedHarvestDate: _date(b['expectedHarvestDate']),
    ),
    amount: data['confirmedAmount'] as int,
    sharePct: (data['capitalRatio'] as num?)?.toDouble() == null
        ? null
        : (data['capitalRatio'] as num).toDouble() * 100,
    paidAt: _date(data['lastConfirmedAt']),
    capitalFrozen: data['capitalBasis'] == 'Frozen',
    settlement: s == null
        ? null
        : PortfolioSettlement(
            status: s['status'] as String,
            capitalReturn: s['capitalReturn'] as int,
            profitShare: s['profitShare'] as int,
            taxWithheld: s['taxWithheld'] as int,
            netPayout: s['netPayout'] as int,
            inKindQtyKg: (s['inKindQtyKg'] as num).toDouble(),
          ),
  );
}

PortfolioDetail portfolioDetailFromJson(Map<String, dynamic> data) {
  final log = data['latestProduction'] == null
      ? null
      : _map(data['latestProduction']);
  return PortfolioDetail(
    position: portfolioPositionFromJson(_map(data['position'])),
    contributions: (data['contributions'] as List).map((v) {
      final c = _map(v);
      return PortfolioPayment(
        id: c['id'] as int,
        amount: c['amount'] as int,
        status: c['status'] as String,
        reservedAt: _date(c['reservedAt'])!,
        confirmedAt: _date(c['confirmedAt']),
        contractNo: c['contractNo'] as String?,
        contractStatus: c['contractStatus'] as String?,
      );
    }).toList(),
    timeline: (data['timeline'] as List).map((v) {
      final e = _map(v);
      return PortfolioEvent(
        type: e['type'] as String,
        label: e['label'] as String,
        at: _date(e['at'])!,
      );
    }).toList(),
    latestProduction: log == null
        ? null
        : PortfolioProduction(
            logDate: _date(log['logDate'])!,
            ph: (log['ph'] as num?)?.toDouble(),
            waterTempC: (log['waterTempC'] as num?)?.toDouble(),
            salinityPpt: (log['salinityPpt'] as num?)?.toDouble(),
            feedKg: (log['feedKg'] as num?)?.toDouble(),
            plausibilityFlag: log['plausibilityFlag'] as String,
            verifiedAt: _date(log['verifiedAt']),
          ),
  );
}

abstract interface class PortfolioRepository {
  Future<List<Contribution>> list({CancelToken? cancelToken});
  Future<PortfolioDetail> get(String code, {CancelToken? cancelToken});
}

class ApiPortfolioRepository implements PortfolioRepository {
  ApiPortfolioRepository(this.dio);
  final Dio dio;
  @override
  Future<List<Contribution>> list({CancelToken? cancelToken}) async {
    final items = <Contribution>[];
    for (var page = 1; ; page++) {
      final data = (await dio.get<Map<String, dynamic>>(
        '/api/investor/portfolio',
        queryParameters: {'page': page, 'pageSize': 100},
        cancelToken: cancelToken,
      )).data!;
      final rows = data['items'] as List;
      items.addAll(rows.map((v) => portfolioPositionFromJson(_map(v))));
      if (rows.isEmpty || page * 100 >= (data['total'] as int)) break;
    }
    return items;
  }

  @override
  Future<PortfolioDetail> get(String code, {CancelToken? cancelToken}) async =>
      portfolioDetailFromJson(
        (await dio.get<Map<String, dynamic>>(
          '/api/investor/portfolio/${Uri.encodeComponent(code)}',
          cancelToken: cancelToken,
        )).data!,
      );
}

final portfolioRepositoryProvider = Provider<PortfolioRepository>(
  (ref) => ApiPortfolioRepository(ref.watch(dioProvider)),
);
void _requireInvestor(AppUser? user) {
  if (user == null || !user.isInvestor) {
    throw StateError('Bạn cần đăng nhập bằng tài khoản nhà đầu tư.');
  }
}

final myContributionsProvider = FutureProvider.autoDispose<List<Contribution>>((
  ref,
) {
  _requireInvestor(ref.watch(sessionProvider.select((s) => s.user)));
  final cancel = CancelToken();
  ref.onDispose(() => cancel.cancel());
  return ref.watch(portfolioRepositoryProvider).list(cancelToken: cancel);
}, retry: (count, error) => null);
final portfolioDetailProvider = FutureProvider.autoDispose
    .family<PortfolioDetail, String>((ref, code) {
      _requireInvestor(ref.watch(sessionProvider.select((s) => s.user)));
      final cancel = CancelToken();
      ref.onDispose(() => cancel.cancel());
      return ref
          .watch(portfolioRepositoryProvider)
          .get(code, cancelToken: cancel);
    }, retry: (count, error) => null);

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/auth/session.dart';
import 'batch_repository.dart' show optional;
import 'portfolio_models.dart';

export 'portfolio_models.dart';

/// Các Lô tôi đã góp vốn và ba số tiền đã ghi nhận của từng Lô.
abstract interface class PortfolioRepository {
  Future<List<PortfolioItem>> list();
  Future<PortfolioDetail> detail(String code);

  /// Chỉ xem được ở Lô đã chốt vốn.
  Future<MoneySummary> money(String code);
  Future<List<MyContribution>> contributions();
}

class ApiPortfolioRepository implements PortfolioRepository {
  ApiPortfolioRepository(this._dio);
  final Dio _dio;

  @override
  Future<List<PortfolioItem>> list() async {
    final items = <PortfolioItem>[];
    for (var page = 1; ; page++) {
      final data = Paged.fromJson(
        await _dio.getJson('/api/investor/portfolio', query: {'page': page, 'pageSize': 100}),
        PortfolioItem.fromJson,
      );
      items.addAll(data.items);
      if (data.items.isEmpty || page * 100 >= data.total) return items;
    }
  }

  @override
  Future<PortfolioDetail> detail(String code) async =>
      PortfolioDetail.fromJson(await _dio.getJson('/api/investor/portfolio/${Uri.encodeComponent(code)}'));

  @override
  Future<MoneySummary> money(String code) async =>
      MoneySummary.fromJson(await _dio.getJson('/api/batches/${Uri.encodeComponent(code)}/money-summary'));

  @override
  Future<List<MyContribution>> contributions() async => [
    for (final c in await _dio.getList('/api/me/contributions')) MyContribution.fromJson(c),
  ];
}

final portfolioRepositoryProvider = Provider<PortfolioRepository>((ref) => ApiPortfolioRepository(ref.watch(dioProvider)));

/// Các màn của nhà đầu tư chỉ tải khi phiên có vai nhà đầu tư; đổi tài khoản thì tải lại.
void requireInvestor(Ref ref) {
  final user = ref.watch(sessionProvider.select((s) => s.user));
  if (user == null || !user.isInvestor) throw StateError('Bạn cần đăng nhập bằng tài khoản nhà đầu tư.');
}

final portfolioProvider = FutureProvider.autoDispose<List<PortfolioItem>>((ref) {
  requireInvestor(ref);
  return ref.watch(portfolioRepositoryProvider).list();
}, retry: (_, _) => null);

final portfolioDetailProvider = FutureProvider.autoDispose.family<PortfolioDetail, String>((ref, code) {
  requireInvestor(ref);
  return ref.watch(portfolioRepositoryProvider).detail(code);
}, retry: (_, _) => null);

final moneySummaryProvider = FutureProvider.autoDispose.family<MoneySummary, String>((ref, code) {
  requireInvestor(ref);
  return ref.watch(portfolioRepositoryProvider).money(code);
}, retry: (_, _) => null);

final myContributionsProvider = FutureProvider.autoDispose<List<MyContribution>>((ref) {
  requireInvestor(ref);
  return ref.watch(portfolioRepositoryProvider).contributions();
}, retry: (_, _) => null);

/// Cộng ba số tiền của tôi trên các Lô đã chốt vốn. Lô chưa chốt vốn chỉ có số đã xác nhận.
final overviewMoneyProvider = FutureProvider.autoDispose<OverviewMoney>((ref) async {
  final repo = ref.watch(portfolioRepositoryProvider);
  final items = await ref.watch(portfolioProvider.future);
  final frozen = [for (final p in items) if (p.frozen) p];
  final summaries = await Future.wait([for (final p in frozen) optional(repo.money(p.batch.code))]);
  var figures = const MoneyFigures();
  var missing = 0;
  for (final summary in summaries) {
    if (summary?.mine == null) {
      missing++;
    } else {
      figures += summary!.mine!;
    }
  }
  return OverviewMoney(
    figures: figures,
    frozenBatches: frozen.length,
    waitingAmount: items.where((p) => !p.frozen).fold(0, (sum, p) => sum + p.confirmedAmount),
    missing: missing,
  );
}, retry: (_, _) => null);

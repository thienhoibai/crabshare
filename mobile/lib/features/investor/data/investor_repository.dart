import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/batch_enums.dart';
import 'investor_models.dart';

export 'portfolio_repository.dart' show myContributionsProvider;

/// Khám phá lô mẫu; danh mục và thông báo cá nhân dùng API riêng.
abstract interface class InvestorRepository {
  Future<List<BatchSummary>> batches();
  Future<BatchSummary> batchByCode(String code);
}

final investorRepositoryProvider = Provider<InvestorRepository>(
  (ref) => MockInvestorRepository(),
);

final batchesProvider = FutureProvider(
  (ref) => ref.watch(investorRepositoryProvider).batches(),
);
final batchDetailProvider = FutureProvider.family<BatchSummary, String>(
  (ref, code) => ref.watch(investorRepositoryProvider).batchByCode(code),
);

/// Dữ liệu mẫu để dựng giao diện. Tên hộ nuôi khớp seed của backend (DevDataSeeder); mã lô chỉ là ví dụ.
class MockInvestorRepository implements InvestorRepository {
  static final _now = DateTime.now();

  static final _batches = [
    BatchSummary(
      code: 'CS-2610-01',
      title: 'Cua thịt vỗ béo Năm Căn',
      operatorName: 'HTX Nuôi cua Năm Căn',
      crabType: CrabType.fattening,
      status: BatchStatus.inProduction,
      targetCapital: 120000000,
      raisedCapital: 120000000,
      minContribution: 1000000,
      cycleDays: 90,
      seedQuantity: 1200,
      dayOfCycle: 45,
      aliveCount: 1180,
      expectedHarvestDate: _now.add(const Duration(days: 45)),
    ),
    BatchSummary(
      code: 'CS-2610-02',
      title: 'Cua gạch Năm Căn',
      operatorName: 'HTX Nuôi cua Năm Căn',
      crabType: CrabType.roe,
      status: BatchStatus.funding,
      targetCapital: 150000000,
      raisedCapital: 102000000,
      minContribution: 1000000,
      cycleDays: 75,
      seedQuantity: 1500,
      fundingDeadline: _now.add(const Duration(days: 6)),
    ),
    BatchSummary(
      code: 'CS-2610-03',
      title: 'Cua lột hộp nhựa',
      operatorName: 'HTX Nuôi cua Năm Căn',
      crabType: CrabType.softShell,
      status: BatchStatus.funding,
      targetCapital: 80000000,
      raisedCapital: 21500000,
      minContribution: 1000000,
      cycleDays: 45,
      seedQuantity: 2000,
      fundingDeadline: _now.add(const Duration(days: 12)),
    ),
    BatchSummary(
      code: 'CS-2609-04',
      title: 'Cua thịt lô tháng 9',
      operatorName: 'HTX Nuôi cua Năm Căn',
      crabType: CrabType.fattening,
      status: BatchStatus.harvesting,
      targetCapital: 80000000,
      raisedCapital: 80000000,
      minContribution: 1000000,
      cycleDays: 90,
      seedQuantity: 800,
      dayOfCycle: 88,
      aliveCount: 776,
      openAlerts: 1,
      expectedHarvestDate: _now.add(const Duration(days: 2)),
    ),
  ];

  Future<T> _delay<T>(T value) =>
      Future.delayed(const Duration(milliseconds: 350), () => value);

  @override
  Future<List<BatchSummary>> batches() => _delay(_batches);

  @override
  Future<BatchSummary> batchByCode(String code) =>
      _delay(_batches.firstWhere((b) => b.code == code));
}

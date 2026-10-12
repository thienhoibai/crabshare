import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/batch_enums.dart';
import 'investor_models.dart';

/// Hợp đồng dữ liệu của tính năng Nhà đầu tư.
/// Hiện dùng [MockInvestorRepository]; khi backend xong endpoint thì viết ApiInvestorRepository
/// (gọi dioProvider) và đổi đúng một dòng ở investorRepositoryProvider bên dưới.
abstract interface class InvestorRepository {
  Future<List<Contribution>> myContributions();
  Future<List<BatchSummary>> batches();
  Future<BatchSummary> batchByCode(String code);
  Future<List<InvestorNotification>> notifications();
}

final investorRepositoryProvider = Provider<InvestorRepository>((ref) => MockInvestorRepository());

final myContributionsProvider = FutureProvider((ref) => ref.watch(investorRepositoryProvider).myContributions());
final batchesProvider = FutureProvider((ref) => ref.watch(investorRepositoryProvider).batches());
final batchDetailProvider = FutureProvider.family<BatchSummary, String>((ref, code) => ref.watch(investorRepositoryProvider).batchByCode(code));
final investorNotificationsProvider = FutureProvider((ref) => ref.watch(investorRepositoryProvider).notifications());

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

  Future<T> _delay<T>(T value) => Future.delayed(const Duration(milliseconds: 350), () => value);

  @override
  Future<List<Contribution>> myContributions() => _delay([
        Contribution(batch: _batches[0], amount: 15000000, sharePct: 12.5, paidAt: _now.subtract(const Duration(days: 52))),
        Contribution(batch: _batches[3], amount: 5000000, sharePct: 6.25, paidAt: _now.subtract(const Duration(days: 95))),
      ]);

  @override
  Future<List<BatchSummary>> batches() => _delay(_batches);

  @override
  Future<BatchSummary> batchByCode(String code) => _delay(_batches.firstWhere((b) => b.code == code));

  @override
  Future<List<InvestorNotification>> notifications() => _delay([
        InvestorNotification(
          kind: NotificationKind.production,
          title: 'Nhật ký mới lô CS-2610-01',
          body: 'pH 7,8 · 28,5°C · độ mặn 15‰ · thức ăn 2,4 kg',
          at: _now.subtract(const Duration(hours: 2)),
          batchCode: 'CS-2610-01',
        ),
        InvestorNotification(
          kind: NotificationKind.alert,
          title: 'Cảnh báo chất lượng nước — CS-2609-04',
          body: 'Độ mặn ngoài ngưỡng. Hộ nuôi đã xác nhận và đang xử lý.',
          at: _now.subtract(const Duration(hours: 9)),
          batchCode: 'CS-2609-04',
        ),
        InvestorNotification(
          kind: NotificationKind.payment,
          title: 'Đã nhận tiền góp vốn',
          body: '15.000.000 đ cho lô CS-2610-01 đã được xác nhận.',
          at: _now.subtract(const Duration(days: 52)),
          batchCode: 'CS-2610-01',
        ),
        InvestorNotification(
          kind: NotificationKind.contract,
          title: 'Hợp đồng đã ký đủ',
          body: 'Hợp đồng góp vốn lô CS-2610-01 đã có đủ chữ ký số.',
          at: _now.subtract(const Duration(days: 50)),
          batchCode: 'CS-2610-01',
        ),
      ]);

}

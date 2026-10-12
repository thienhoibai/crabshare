import '../../../shared/models/batch_enums.dart';

/// Thông tin một lô hiển thị cho nhà đầu tư.
/// Không có trường "lợi suất kỳ vọng" — nền tảng không hiển thị lợi suất (TL-05 §8, BR-49).
class BatchSummary {
  const BatchSummary({
    required this.code,
    required this.title,
    required this.operatorName,
    required this.crabType,
    required this.status,
    required this.targetCapital,
    required this.raisedCapital,
    required this.minContribution,
    required this.cycleDays,
    required this.seedQuantity,
    this.fundingDeadline,
    this.dayOfCycle,
    this.aliveCount,
    this.openAlerts = 0,
    this.expectedHarvestDate,
  });

  final String code;
  final String title;
  final String operatorName;
  final CrabType crabType;
  final BatchStatus status;

  /// Tiền: số nguyên đồng.
  final int targetCapital;
  final int raisedCapital;
  final int minContribution;

  final int cycleDays;
  final int seedQuantity;
  final DateTime? fundingDeadline;
  final int? dayOfCycle;
  final int? aliveCount;
  final int openAlerts;
  final DateTime? expectedHarvestDate;

  double get fundingProgress => targetCapital == 0 ? 0 : raisedCapital / targetCapital;
  double get cycleProgress => dayOfCycle == null ? 0 : dayOfCycle! / cycleDays;
}

/// Một khoản góp vốn của nhà đầu tư vào một lô.
class Contribution {
  const Contribution({required this.batch, required this.amount, required this.sharePct, required this.paidAt});

  final BatchSummary batch;
  final int amount;

  /// Tỷ lệ vốn trong lô (%), dùng để chia Revenue Pool khi quyết toán.
  final double sharePct;
  final DateTime paidAt;
}

enum NotificationKind { payment, production, alert, settlement, contract }

class InvestorNotification {
  const InvestorNotification({required this.kind, required this.title, required this.body, required this.at, this.batchCode});

  final NotificationKind kind;
  final String title;
  final String body;
  final DateTime at;
  final String? batchCode;
}

enum KycStatus { unverified, pending, verified, rejected }

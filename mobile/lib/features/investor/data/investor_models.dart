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

  double get fundingProgress =>
      targetCapital == 0 ? 0 : raisedCapital / targetCapital;
  double get cycleProgress => dayOfCycle == null || cycleDays <= 0
      ? 0
      : (dayOfCycle! / cycleDays).clamp(0.0, 1.0);
}

/// Một khoản góp vốn của nhà đầu tư vào một lô.
class Contribution {
  const Contribution({
    required this.batch,
    required this.amount,
    required this.sharePct,
    required this.paidAt,
    this.capitalFrozen = true,
    this.settlement,
  });

  final BatchSummary batch;
  final int amount;

  /// Tỷ lệ vốn trong lô (%), dùng để chia Revenue Pool khi quyết toán.
  final double? sharePct;
  final DateTime? paidAt;
  final bool capitalFrozen;
  final PortfolioSettlement? settlement;

  String get ratioLabel => sharePct == null
      ? 'Chưa có tỷ lệ vốn'
      : '${capitalFrozen ? '' : 'Tạm tính '}${sharePct!.toStringAsFixed(4).replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '').replaceAll('.', ',')}% vốn lô';
}

class PortfolioSettlement {
  const PortfolioSettlement({
    required this.status,
    required this.capitalReturn,
    required this.profitShare,
    required this.taxWithheld,
    required this.netPayout,
    required this.inKindQtyKg,
  });
  final String status;
  final int capitalReturn, profitShare, taxWithheld, netPayout;
  final double inKindQtyKg;
}

class PortfolioDetail {
  const PortfolioDetail({
    required this.position,
    required this.contributions,
    required this.timeline,
    this.latestProduction,
  });
  final Contribution position;
  final List<PortfolioPayment> contributions;
  final List<PortfolioEvent> timeline;
  final PortfolioProduction? latestProduction;
}

class PortfolioPayment {
  const PortfolioPayment({
    required this.id,
    required this.amount,
    required this.status,
    required this.reservedAt,
    this.confirmedAt,
    this.contractNo,
    this.contractStatus,
  });
  final int id, amount;
  final String status;
  final DateTime reservedAt;
  final DateTime? confirmedAt;
  final String? contractNo, contractStatus;
}

class PortfolioEvent {
  const PortfolioEvent({
    required this.type,
    required this.label,
    required this.at,
  });
  final String type, label;
  final DateTime at;
}

class PortfolioProduction {
  const PortfolioProduction({
    required this.logDate,
    this.ph,
    this.waterTempC,
    this.salinityPpt,
    this.feedKg,
    required this.plausibilityFlag,
    this.verifiedAt,
  });
  final DateTime logDate;
  final double? ph, waterTempC, salinityPpt, feedKg;
  final String plausibilityFlag;
  final DateTime? verifiedAt;
}

enum NotificationKind { payment, production, alert, settlement, contract }

class InvestorNotification {
  const InvestorNotification({
    required this.kind,
    required this.title,
    required this.body,
    required this.at,
    this.batchCode,
  });

  final NotificationKind kind;
  final String title;
  final String body;
  final DateTime at;
  final String? batchCode;
}

enum KycStatus { unverified, pending, verified, rejected }

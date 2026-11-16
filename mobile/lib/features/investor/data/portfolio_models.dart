import '../../../core/api/json.dart';

/// Lô mà nhà đầu tư đã góp vốn (phần thông tin của Lô).
class PortfolioBatch {
  const PortfolioBatch({
    required this.code,
    required this.title,
    required this.operatorName,
    required this.crabType,
    required this.status,
    required this.targetCapital,
    required this.raisedCapital,
    required this.cycleDays,
    required this.seedQuantity,
    this.stockedAt,
    this.expectedHarvestDate,
    this.dayOfCycle,
    this.openAlerts = 0,
  });
  final String code, title, operatorName, crabType, status;
  final int targetCapital, raisedCapital, cycleDays, seedQuantity, openAlerts;
  final DateTime? stockedAt, expectedHarvestDate;
  final int? dayOfCycle;

  factory PortfolioBatch.fromJson(Json j) => PortfolioBatch(
    code: str(j, 'code'),
    title: str(j, 'title'),
    operatorName: str(j, 'operatorName'),
    crabType: str(j, 'crabType'),
    status: str(j, 'status'),
    targetCapital: intOf(j, 'targetCapital'),
    raisedCapital: intOf(j, 'raisedCapital'),
    cycleDays: intOf(j, 'cycleDays'),
    seedQuantity: intOf(j, 'seedQuantity'),
    stockedAt: dateOrNull(j, 'stockedAt'),
    expectedHarvestDate: dateOrNull(j, 'expectedHarvestDate'),
    dayOfCycle: intOrNull(j, 'dayOfCycle'),
    openAlerts: intOf(j, 'openAlerts'),
  );
}

/// Số đã duyệt của tôi trong bảng quyết toán của Lô.
class ApprovedPayout {
  const ApprovedPayout({
    required this.status,
    required this.capitalReturn,
    required this.profitShare,
    required this.taxWithheld,
    required this.netPayout,
  });
  final String status;
  final int capitalReturn, profitShare, taxWithheld, netPayout;

  factory ApprovedPayout.fromJson(Json j) => ApprovedPayout(
    status: str(j, 'status'),
    capitalReturn: intOf(j, 'capitalReturn'),
    profitShare: intOf(j, 'profitShare'),
    taxWithheld: intOf(j, 'taxWithheld'),
    netPayout: intOf(j, 'netPayout'),
  );
}

/// Phần vốn của tôi ở một Lô.
class PortfolioItem {
  const PortfolioItem({
    required this.batch,
    required this.confirmedAmount,
    required this.frozen,
    this.capitalRatio,
    this.settlement,
  });
  final PortfolioBatch batch;
  final int confirmedAmount;

  /// Lô đã chốt vốn: phần vốn của tôi đã cố định, xem được ba số tiền và biểu quyết.
  final bool frozen;

  /// Tỷ lệ vốn góp trong Lô (0,6 = 60%).
  final double? capitalRatio;
  final ApprovedPayout? settlement;

  factory PortfolioItem.fromJson(Json j) {
    final settlement = asJsonOrNull(j['settlement']);
    return PortfolioItem(
      batch: PortfolioBatch.fromJson(asJson(j['batch'])),
      confirmedAmount: intOf(j, 'confirmedAmount'),
      frozen: str(j, 'capitalBasis') == 'Frozen',
      capitalRatio: doubleOrNull(j, 'capitalRatio'),
      settlement: settlement == null ? null : ApprovedPayout.fromJson(settlement),
    );
  }
}

/// Một khoản góp của tôi ở một Lô, kèm hợp đồng nếu đã lập.
class PortfolioContribution {
  const PortfolioContribution({
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

  factory PortfolioContribution.fromJson(Json j) => PortfolioContribution(
    id: intOf(j, 'id'),
    amount: intOf(j, 'amount'),
    status: str(j, 'status'),
    reservedAt: dateOf(j, 'reservedAt'),
    confirmedAt: dateOrNull(j, 'confirmedAt'),
    contractNo: strOrNull(j, 'contractNo'),
    contractStatus: strOrNull(j, 'contractStatus'),
  );
}

class PortfolioDetail {
  const PortfolioDetail({required this.position, required this.contributions});
  final PortfolioItem position;
  final List<PortfolioContribution> contributions;

  factory PortfolioDetail.fromJson(Json j) => PortfolioDetail(
    position: PortfolioItem.fromJson(asJson(j['position'])),
    contributions: [for (final c in asJsonList(j['contributions'])) PortfolioContribution.fromJson(c)],
  );
}

/// Ba số tiền đã ghi nhận: đã góp, đã giải ngân theo mốc, còn giữ trong tài khoản của Lô.
class MoneyFigures {
  const MoneyFigures({this.contributed = 0, this.disbursed = 0, this.held = 0});
  final int contributed, disbursed, held;

  factory MoneyFigures.fromJson(Json j) => MoneyFigures(
    contributed: intOf(j, 'contributed'),
    disbursed: intOf(j, 'disbursed'),
    held: intOf(j, 'heldInAccount'),
  );

  MoneyFigures operator +(MoneyFigures other) => MoneyFigures(
    contributed: contributed + other.contributed,
    disbursed: disbursed + other.disbursed,
    held: held + other.held,
  );
}

class MoneySummary {
  const MoneySummary({required this.batch, this.mine});
  final MoneyFigures batch;
  final MoneyFigures? mine;

  factory MoneySummary.fromJson(Json j) {
    final mine = asJsonOrNull(j['mine']);
    return MoneySummary(
      batch: MoneyFigures.fromJson(asJson(j['batch'])),
      mine: mine == null ? null : MoneyFigures.fromJson(mine),
    );
  }
}

/// Khoản góp của tôi trên mọi Lô, dùng để tìm khoản đang giữ chỗ chờ chuyển khoản.
class MyContribution {
  const MyContribution({
    required this.id,
    required this.batchCode,
    required this.amount,
    required this.status,
    required this.expiresAt,
  });
  final int id, amount;
  final String batchCode, status;
  final DateTime expiresAt;

  bool waitingForPayment([DateTime? now]) => status == 'Reserved' && expiresAt.isAfter(now ?? DateTime.now());

  factory MyContribution.fromJson(Json j) => MyContribution(
    id: intOf(j, 'contributionId'),
    batchCode: str(j, 'batchCode'),
    amount: intOf(j, 'amount'),
    status: str(j, 'status'),
    expiresAt: dateOf(j, 'expiresAt'),
  );
}

/// Ba số tiền của tôi cộng trên các Lô đã chốt vốn, cho thẻ đầu màn Tổng quan.
class OverviewMoney {
  const OverviewMoney({required this.figures, required this.frozenBatches, required this.waitingAmount, required this.missing});
  final MoneyFigures figures;
  final int frozenBatches;

  /// Tiền đã xác nhận ở các Lô chưa chốt vốn.
  final int waitingAmount;

  /// Số Lô chưa lấy được số tiền.
  final int missing;
}

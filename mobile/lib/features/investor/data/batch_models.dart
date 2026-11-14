import '../../../core/api/json.dart';
import '../../../core/format/money.dart';

/// Một dòng của bảng giá theo quy cách.
class ExploreOffer {
  const ExploreOffer({
    required this.specCode,
    required this.specName,
    required this.pricePerKg,
    required this.conversionWeightG,
    required this.offeredQuantity,
  });
  final String specCode, specName;
  final int pricePerKg, conversionWeightG, offeredQuantity;

  factory ExploreOffer.fromJson(Json j) => ExploreOffer(
    specCode: str(j, 'specCode'),
    specName: str(j, 'specName'),
    pricePerKg: intOf(j, 'pricePerKg'),
    conversionWeightG: intOf(j, 'conversionWeightG'),
    offeredQuantity: intOf(j, 'offeredQuantity'),
  );
}

class CostCategory {
  const CostCategory(this.category, this.amount);
  final String category;
  final int amount;
}

/// Lô đã công bố, xem từ trang gọi vốn hoặc đặt trước. Chỉ có số đã phát sinh, giá và điều khoản.
class ExploreBatch {
  const ExploreBatch({
    required this.code,
    required this.mode,
    required this.status,
    required this.title,
    required this.crabType,
    required this.executorName,
    required this.plannedQuantity,
    required this.hasHolding,
    required this.standardCostTotal,
    required this.targetCapital,
    required this.confirmedCapital,
    required this.remainingCapital,
    required this.investorCount,
    required this.minContribution,
    required this.sellableCrabs,
    required this.depositedPreorderCrabs,
    this.holdingDays,
    this.saleDays,
    this.expectedAvgWeightG,
    this.expectedGrade,
    this.expectedReceiptDate,
    this.deliveryRadiusKm,
    this.floorPricePerKg,
    this.offtakeBuyerName,
    this.fundingDeadline,
    this.preorderDeadline,
    this.offers = const [],
    this.costByCategory = const [],
  });

  final String code, mode, status, title, crabType, executorName;
  final int plannedQuantity, standardCostTotal;
  final bool hasHolding;
  final int targetCapital, confirmedCapital, remainingCapital, investorCount, minContribution;
  final int sellableCrabs, depositedPreorderCrabs;
  final int? holdingDays, saleDays, expectedAvgWeightG, floorPricePerKg;
  final String? expectedGrade, offtakeBuyerName;
  final double? deliveryRadiusKm;
  final DateTime? expectedReceiptDate, fundingDeadline, preorderDeadline;
  final List<ExploreOffer> offers;
  final List<CostCategory> costByCategory;

  factory ExploreBatch.fromJson(Json j) => ExploreBatch(
    code: str(j, 'batchCode'),
    mode: str(j, 'batchMode'),
    status: str(j, 'status'),
    title: str(j, 'title'),
    crabType: str(j, 'crabType'),
    executorName: str(j, 'executorName'),
    plannedQuantity: intOf(j, 'plannedQuantity'),
    hasHolding: boolOf(j, 'hasHolding'),
    holdingDays: intOrNull(j, 'holdingDays'),
    saleDays: intOrNull(j, 'saleDays'),
    expectedAvgWeightG: intOrNull(j, 'expectedAvgWeightG'),
    expectedGrade: strOrNull(j, 'expectedGrade'),
    expectedReceiptDate: dateOrNull(j, 'expectedReceiptDate'),
    deliveryRadiusKm: doubleOrNull(j, 'deliveryRadiusKm'),
    standardCostTotal: intOf(j, 'standardCostTotal'),
    floorPricePerKg: intOrNull(j, 'floorPricePerKg'),
    offtakeBuyerName: strOrNull(j, 'offtakeBuyerName'),
    targetCapital: intOf(j, 'targetCapital'),
    confirmedCapital: intOf(j, 'confirmedCapital'),
    remainingCapital: intOf(j, 'remainingCapital'),
    investorCount: intOf(j, 'investorCount'),
    minContribution: intOf(j, 'minContribution'),
    sellableCrabs: intOf(j, 'sellableCrabs'),
    depositedPreorderCrabs: intOf(j, 'depositedPreorderCrabs'),
    fundingDeadline: dateOrNull(j, 'fundingDeadline'),
    preorderDeadline: dateOrNull(j, 'preorderDeadline'),
    offers: [for (final o in asJsonList(j['offers'])) ExploreOffer.fromJson(o)],
    costByCategory: [for (final c in asJsonList(j['costByCategory'])) CostCategory(str(c, 'category'), intOf(c, 'amount'))],
  );

  /// Lô P đang nhận góp vốn.
  bool get isFunding => mode == 'P' && status == 'Funding';

  /// Phần vốn đã xác nhận so với mục tiêu, để vẽ thanh tiến độ.
  double get fundingProgress => targetCapital <= 0 ? 0 : confirmedCapital / targetCapital;

  /// Lô có bảng giá và còn trong hạn đặt trước.
  bool takesPreorders([DateTime? now]) =>
      offers.isNotEmpty &&
      !const {'Closed', 'Cancelled', 'Settlement', 'Settling', 'AwaitingSettlement', 'Liquidating'}.contains(status) &&
      (preorderDeadline == null || preorderDeadline!.isAfter(now ?? DateTime.now()));

  /// "380.000 đ – 520.000 đ / kg" từ bảng giá; null khi Lô chưa có bảng giá.
  String? get priceRange {
    if (offers.isEmpty) return null;
    final prices = [for (final o in offers) o.pricePerKg]..sort();
    return prices.first == prices.last
        ? '${formatVnd(prices.first)} / kg'
        : '${formatVnd(prices.first)} – ${formatVnd(prices.last)} / kg';
  }
}

/// Tiến độ Lô. Bốn số sau chỉ có khi người xem đã góp vốn hoặc có đơn ở Lô.
class BatchProgress {
  const BatchProgress({
    required this.crabsAlive,
    required this.isParticipant,
    this.daysRaised,
    this.deadCrabs,
    this.restockedCrabs,
    this.gradedCrabs,
    this.deliveredOrSoldCrabs,
  });
  final int crabsAlive;
  final bool isParticipant;
  final int? daysRaised, deadCrabs, restockedCrabs, gradedCrabs, deliveredOrSoldCrabs;

  bool get hasData => crabsAlive > 0 || daysRaised != null;

  factory BatchProgress.fromJson(Json j) => BatchProgress(
    crabsAlive: intOf(j, 'crabsAlive'),
    isParticipant: boolOf(j, 'isParticipant'),
    daysRaised: intOrNull(j, 'daysRaised'),
    deadCrabs: intOrNull(j, 'deadCrabs'),
    restockedCrabs: intOrNull(j, 'restockedCrabs'),
    gradedCrabs: intOrNull(j, 'gradedCrabs'),
    deliveredOrSoldCrabs: intOrNull(j, 'deliveredOrSoldCrabs'),
  );
}

class SpecAvailability {
  const SpecAvailability({
    required this.specCode,
    required this.specName,
    required this.pricePerKg,
    required this.conversionWeightG,
    required this.remaining,
  });
  final String specCode, specName;
  final int pricePerKg, conversionWeightG, remaining;

  factory SpecAvailability.fromJson(Json j) => SpecAvailability(
    specCode: str(j, 'specCode'),
    specName: str(j, 'specName'),
    pricePerKg: intOf(j, 'pricePerKg'),
    conversionWeightG: intOf(j, 'conversionWeightG'),
    remaining: intOf(j, 'remaining'),
  );
}

/// Số con còn đặt trước được của Lô, chung và theo quy cách.
class BatchAvailability {
  const BatchAvailability({
    required this.acceptingPreorders,
    required this.remainingCrabs,
    required this.depositRatePct,
    this.specs = const [],
  });
  final bool acceptingPreorders;
  final int remainingCrabs;
  final double depositRatePct;
  final List<SpecAvailability> specs;

  factory BatchAvailability.fromJson(Json j) => BatchAvailability(
    acceptingPreorders: boolOf(j, 'acceptingPreorders'),
    remainingCrabs: intOf(j, 'remainingCrabs'),
    depositRatePct: doubleOf(j, 'depositRatePct'),
    specs: [for (final s in asJsonList(j['specs'])) SpecAvailability.fromJson(s)],
  );
}

/// Dữ liệu của màn Lô công khai: Lô, tiến độ và số còn đặt được (hai phần sau có thể thiếu).
class BatchPublicView {
  const BatchPublicView({required this.batch, this.progress, this.availability});
  final ExploreBatch batch;
  final BatchProgress? progress;
  final BatchAvailability? availability;

  /// Lô còn nhận đặt trước và có bảng giá để đặt.
  bool get preorderOpen => batch.offers.isNotEmpty && (availability?.acceptingPreorders ?? batch.takesPreorders());
}

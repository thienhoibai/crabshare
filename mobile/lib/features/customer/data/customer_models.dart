import 'package:intl/intl.dart';

import '../../../core/api/json.dart';
import '../../../core/format/money.dart';

export 'delivery_models.dart';

/// Model của khu khách hàng: đơn đặt trước, đợt giao và Lô nhận đặt trước ở tệp này;
/// chuyến giao, nghiệm thu, hoá đơn, khiếu nại ở delivery_models.dart (được xuất lại từ đây).
/// Tên trường theo đúng JSON của backend (PreorderResponse, ExploreBatchResponse).

final _decimal = NumberFormat.decimalPattern('vi_VN');

/// 5.2 → "5,2 kg"; null → "—".
String formatKg(num? kg) => kg == null ? '—' : '${_decimal.format(kg)} kg';

/// "30 con · 9,4 kg".
String crabsAndKg(int crabs, num? kg) => '$crabs con · ${formatKg(kg)}';

/// 12/11 08:30 theo giờ máy.
String formatDayTime(DateTime value) => DateFormat('dd/MM HH:mm').format(value.toLocal());

/// Yêu cầu chuyển khoản còn chờ: tiền cọc của đơn hoặc phần còn lại của một chuyến giao.
class PaymentStart {
  const PaymentStart({required this.referenceCode, required this.amount, required this.status, this.expiresAt});
  final String referenceCode;
  final int amount;
  final String status;
  final DateTime? expiresAt;

  factory PaymentStart.fromJson(Json j) => PaymentStart(
    referenceCode: str(j, 'referenceCode'),
    amount: intOf(j, 'amount'),
    status: str(j, 'status'),
    expiresAt: dateOrNull(j, 'expiresAt'),
  );
}

class PreorderLine {
  const PreorderLine({
    required this.specCode,
    required this.specName,
    required this.mode,
    required this.qtyCrabs,
    required this.qtyKg,
    required this.convertedCrabs,
    required this.pricePerKg,
    required this.estimatedValue,
  });
  final String specCode;
  final String specName;
  final String mode;
  final int? qtyCrabs;
  final double? qtyKg;
  final int convertedCrabs;
  final int pricePerKg;
  final int estimatedValue;

  /// Số lượng theo đúng đơn vị khách đã đặt.
  String get quantity => mode == 'ByKg' ? formatKg(qtyKg) : '${qtyCrabs ?? 0} con';

  factory PreorderLine.fromJson(Json j) => PreorderLine(
    specCode: str(j, 'specCode'),
    specName: str(j, 'specName'),
    mode: str(j, 'mode', 'ByCount'),
    qtyCrabs: intOrNull(j, 'qtyCrabs'),
    qtyKg: doubleOrNull(j, 'qtyKg'),
    convertedCrabs: intOf(j, 'convertedCrabs'),
    pricePerKg: intOf(j, 'pricePerKg'),
    estimatedValue: intOf(j, 'estimatedValue'),
  );
}

class TrancheLine {
  const TrancheLine({required this.specCode, required this.qtyCrabs, required this.qtyKg});
  final String specCode;
  final int? qtyCrabs;
  final double? qtyKg;

  String get quantity => qtyKg != null ? formatKg(qtyKg) : '${qtyCrabs ?? 0} con';

  factory TrancheLine.fromJson(Json j) =>
      TrancheLine(specCode: str(j, 'specCode'), qtyCrabs: intOrNull(j, 'qtyCrabs'), qtyKg: doubleOrNull(j, 'qtyKg'));
}

class OrderTranche {
  const OrderTranche({required this.seq, required this.dueDate, required this.status, required this.lines});
  final int seq;
  final DateTime? dueDate;
  final String status;
  final List<TrancheLine> lines;

  factory OrderTranche.fromJson(Json j) => OrderTranche(
    seq: intOf(j, 'seq'),
    dueDate: dateOrNull(j, 'dueDate'),
    status: str(j, 'status'),
    lines: [for (final l in asJsonList(j['lines'])) TrancheLine.fromJson(l)],
  );
}

class Preorder {
  const Preorder({
    required this.orderNo,
    required this.batchCode,
    required this.status,
    required this.estimatedValue,
    required this.depositAmount,
    required this.convertedCrabs,
    required this.placedAt,
    required this.holdExpiresAt,
    required this.deliveryAddress,
    required this.deliveryDistanceKm,
    required this.lines,
    required this.tranches,
    required this.deposit,
    required this.cancelReason,
  });
  final String orderNo;
  final String batchCode;
  final String status;
  final int estimatedValue;
  final int depositAmount;
  final int convertedCrabs;
  final DateTime? placedAt;
  final DateTime? holdExpiresAt;
  final String deliveryAddress;
  final double? deliveryDistanceKm;
  final List<PreorderLine> lines;
  final List<OrderTranche> tranches;
  final PaymentStart? deposit;
  final String? cancelReason;

  static const _open = {'PendingDeposit', 'Deposited', 'Confirmed', 'Delivering', 'Delivered', 'CancelRequested'};
  static const _delivery = {'Confirmed', 'Delivering', 'Delivered'};
  static const _cancellable = {'PendingDeposit', 'Deposited', 'Confirmed'};

  /// Đơn còn đang chạy (chưa kết thúc, chưa huỷ).
  bool get isOpen => _open.contains(status);

  /// Đơn có thể đã có chuyến giao cần theo dõi.
  bool get hasDeliveries => _delivery.contains(status);

  /// Khách còn tự huỷ được.
  bool get isCancellable => _cancellable.contains(status);

  bool get isDelivered => status == 'Delivered' || status == 'Completed';

  /// Mã trạng thái cọc (nhóm nhãn "deposit") suy ra từ trạng thái đơn; đơn huỷ khi chưa cọc thì không có.
  String? get depositState => switch (status) {
    'PendingDeposit' => 'Pending',
    'Deposited' || 'CancelRequested' || 'Confirmed' || 'Delivering' => 'Held',
    'Delivered' || 'Completed' => 'Applied',
    'Forfeited' => 'Forfeited',
    'Refunded' => 'Refunded',
    _ => null,
  };

  /// Đợt giao sắp tới: đợt chưa hoàn tất có thứ tự nhỏ nhất.
  OrderTranche? get nextTranche {
    final pending = [
      for (final t in tranches)
        if (const {'Planned', 'Allocated', 'Dispatched', 'Accepted'}.contains(t.status)) t,
    ]..sort((a, b) => a.seq.compareTo(b.seq));
    return pending.isEmpty ? null : pending.first;
  }

  String specName(String specCode) {
    for (final l in lines) {
      if (l.specCode == specCode) return l.specName;
    }
    return specCode;
  }

  factory Preorder.fromJson(Json j) => Preorder(
    orderNo: str(j, 'orderNo'),
    batchCode: str(j, 'batchCode'),
    status: str(j, 'status'),
    estimatedValue: intOf(j, 'estimatedValue'),
    depositAmount: intOf(j, 'depositAmount'),
    convertedCrabs: intOf(j, 'convertedCrabs'),
    placedAt: dateOrNull(j, 'placedAt'),
    holdExpiresAt: dateOrNull(j, 'holdExpiresAt'),
    deliveryAddress: str(j, 'deliveryAddress'),
    deliveryDistanceKm: doubleOrNull(j, 'deliveryDistanceKm'),
    lines: [for (final l in asJsonList(j['lines'])) PreorderLine.fromJson(l)],
    tranches: [for (final t in asJsonList(j['tranches'])) OrderTranche.fromJson(t)],
    deposit: asJsonOrNull(j['deposit']) == null ? null : PaymentStart.fromJson(asJson(j['deposit'])),
    cancelReason: strOrNull(j, 'cancelReason'),
  );
}

/// Một Lô đang mở, đọc phần khách hàng cần: bảng chào giá và số con còn đặt được.
class OpenBatch {
  const OpenBatch({
    required this.batchCode,
    required this.title,
    required this.crabType,
    required this.status,
    required this.prices,
    required this.sellableCrabs,
    required this.depositedPreorderCrabs,
    required this.preorderDeadline,
  });
  final String batchCode;
  final String title;
  final String crabType;
  final String status;

  /// Giá mỗi kg của từng quy cách trong bảng chào giá.
  final List<int> prices;
  final int sellableCrabs;
  final int depositedPreorderCrabs;
  final DateTime? preorderDeadline;

  static const _ended = {'Closed', 'Cancelled', 'Settlement', 'Settling', 'AwaitingSettlement', 'Liquidating'};

  /// Lô có bảng chào giá và còn trong hạn đặt trước.
  bool takesPreorders([DateTime? now]) =>
      prices.isNotEmpty &&
      !_ended.contains(status) &&
      (preorderDeadline == null || preorderDeadline!.isAfter(now ?? DateTime.now()));

  int get remainingCrabs => sellableCrabs > depositedPreorderCrabs ? sellableCrabs - depositedPreorderCrabs : 0;

  /// "380.000 đ – 520.000 đ / kg".
  String? get priceRange {
    if (prices.isEmpty) return null;
    final min = prices.reduce((a, b) => a < b ? a : b);
    final max = prices.reduce((a, b) => a > b ? a : b);
    return min == max ? '${formatVnd(min)} / kg' : '${formatVnd(min)} – ${formatVnd(max)} / kg';
  }

  factory OpenBatch.fromJson(Json j) => OpenBatch(
    batchCode: str(j, 'batchCode'),
    title: str(j, 'title'),
    crabType: str(j, 'crabType'),
    status: str(j, 'status'),
    prices: [for (final o in asJsonList(j['offers'])) intOf(o, 'pricePerKg')],
    sellableCrabs: intOf(j, 'sellableCrabs'),
    depositedPreorderCrabs: intOf(j, 'depositedPreorderCrabs'),
    preorderDeadline: dateOrNull(j, 'preorderDeadline'),
  );
}

/// Đường dẫn màn hình dùng chung của app (BR v1.5). Tìm một màn: tìm path ở đây, xem tệp `*_routes.dart` của khu đó, mở tệp page.
/// Mỗi khu có thể khai thêm đường dẫn màn con trong tệp routes của khu; ở đây chỉ giữ các đường dẫn mà khu khác cần biết.
abstract final class Routes {
  // ---------- Công khai ----------
  static const onboarding = '/onboarding';
  static const login = '/login';

  /// Quét mã QR trên đơn hàng.
  static const scan = '/scan';

  /// Trang truy xuất của một đơn: Lô, trại, nguồn cua, quy cách đã duyệt.
  static String trace(String traceCode) =>
      '/trace/${Uri.encodeComponent(traceCode)}';

  // ---------- Dùng chung sau đăng nhập ----------
  static const unsupported = '/unsupported';
  static const payoutAccount = '/account/payout-account';

  /// Trang công khai của một Lô (khám phá, góp vốn, đặt trước).
  static String batch(String code) => '/batches/${Uri.encodeComponent(code)}';

  // ---------- Nhà đầu tư: /i ----------
  static const investorHome = '/i/home';
  static const investorBatches = '/i/batches';
  static const investorNotifications = '/i/notifications';
  static const investorAccount = '/i/account';
  static const kyc = '/i/kyc';
  static String portfolioBatch(String code) =>
      '/i/portfolio/${Uri.encodeComponent(code)}';

  // ---------- Người nuôi: /o ----------
  static const operatorToday = '/o/today';
  static const operatorBatches = '/o/batches';
  static String operatorBatch(String code) =>
      '/o/batches/${Uri.encodeComponent(code)}';
  static const operatorDeliveries = '/o/deliveries';
  static String operatorShipment(String shipmentNo) =>
      '/o/shipments/${Uri.encodeComponent(shipmentNo)}';

  /// Đo cua của một Lô: mở lượt đo trước khi đặt cua lên trạm.
  static String operatorMeasure(String batchCode) =>
      '/o/measure/${Uri.encodeComponent(batchCode)}';
  static const operatorAccount = '/o/account';
  static const operatorLogs = '/o/logs';
  static const operatorAlerts = '/o/alerts';
  static const dailyLogNew = '/o/log/new';
  static String dailyLogFor(String batchCode) =>
      '$dailyLogNew?batch=${Uri.encodeQueryComponent(batchCode)}';
  static const flaggedEvidence = '/o/evidence';
  static String evidenceExplanation(int id) => '$flaggedEvidence/$id';

  /// Chụp ảnh bằng chứng tại hộp.
  static const capture = '/o/capture';
  static String captureBox(String slotCode) =>
      '$capture?slot=${Uri.encodeQueryComponent(slotCode)}';
  static String captureRequest({
    required int id,
    required String slotCode,
    required String batchCode,
    required DateTime dueAt,
  }) => Uri(
    path: capture,
    queryParameters: {
      'slot': slotCode,
      'batch': batchCode,
      'requestId': '$id',
      'dueAt': dueAt.toUtc().toIso8601String(),
    },
  ).toString();

  // ---------- Nhân viên kiểm phẩm: /q ----------
  static const qcTasks = '/q/tasks';
  static const qcIncoming = '/q/incoming';
  static String qcReceipt(String receiptNo, {String? batchCode}) => Uri(
    path: '/q/incoming/${Uri.encodeComponent(receiptNo)}',
    queryParameters: batchCode == null ? null : {'batch': batchCode},
  ).toString();
  static const qcGrading = '/q/grading';
  static String qcGradingBatch(String batchCode) =>
      '/q/grading/${Uri.encodeComponent(batchCode)}';
  static const qcSiteVisits = '/q/visits';
  static String qcSiteVisit(int assignmentId, {String? batchCode}) => Uri(
    path: '/q/visits/$assignmentId',
    queryParameters: batchCode == null ? null : {'batch': batchCode},
  ).toString();
  static const qcAccount = '/q/account';

  // ---------- Khách hàng: /c ----------
  static const customerOrders = '/c/orders';
  static String customerOrder(String orderNo) =>
      '/c/orders/${Uri.encodeComponent(orderNo)}';
  static const customerBatches = '/c/batches';
  static const customerDeliveries = '/c/deliveries';
  static const customerAccount = '/c/account';
}

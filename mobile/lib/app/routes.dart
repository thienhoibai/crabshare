/// Mọi đường dẫn màn hình ở một chỗ. Muốn tìm màn hình nào: tìm path ở đây → xem router.dart → mở file page.
abstract final class Routes {
  // Công khai
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const scan = '/scan';
  static String trace(String tagCode) => '/trace/$tagCode';

  // Dùng chung sau đăng nhập
  static const unsupported = '/unsupported';
  static const payoutAccount = '/account/payout-account';
  static String batch(String code) => '/batches/$code';

  // Nhà đầu tư — 4 tab dưới + màn con
  static const investorHome = '/i/home';
  static String portfolioBatch(String code) =>
      '/i/portfolio/${Uri.encodeComponent(code)}';
  static const investorBatches = '/i/batches';
  static const investorNotifications = '/i/notifications';
  static const investorAccount = '/i/account';
  static const kyc = '/i/kyc';

  // Hộ nuôi — 4 tab dưới + màn con
  static const operatorToday = '/o/today';
  static String slotEvents(String batchCode) =>
      '/o/slot-events/${Uri.encodeComponent(batchCode)}';
  static const operatorLogs = '/o/logs';
  static const operatorAlerts = '/o/alerts';
  static const flaggedEvidence = '/o/evidence';
  static String evidenceExplanation(int id) => '$flaggedEvidence/$id';
  static const operatorAccount = '/o/account';
  static const dailyLogNew = '/o/log/new';
  static String dailyLogFor(String batchCode) =>
      '$dailyLogNew?batch=$batchCode';
  static const capture = '/o/capture';
  static String captureBox(String slotCode) => '$capture?slot=$slotCode';
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
  static String harvest(String batchCode) => '/o/harvest/$batchCode';
  static const operatorPack = '/o/pack';
  static String operatorPackOrder(String orderNo) => '$operatorPack/$orderNo';
}

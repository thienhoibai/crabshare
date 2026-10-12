/// Mọi đường dẫn màn hình ở một chỗ. Muốn tìm màn hình nào: tìm path ở đây → xem router.dart → mở file page.
abstract final class Routes {
  // Công khai
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const scan = '/scan';
  static String trace(String tagCode) => '/trace/$tagCode';

  // Dùng chung sau đăng nhập
  static const unsupported = '/unsupported';
  static String batch(String code) => '/batches/$code';

  // Nhà đầu tư — 4 tab dưới + màn con
  static const investorHome = '/i/home';
  static const investorBatches = '/i/batches';
  static const investorNotifications = '/i/notifications';
  static const investorAccount = '/i/account';
  static const kyc = '/i/kyc';

  // Hộ nuôi — 4 tab dưới + màn con
  static const operatorToday = '/o/today';
  static const operatorLogs = '/o/logs';
  static const operatorAlerts = '/o/alerts';
  static const operatorAccount = '/o/account';
  static const dailyLogNew = '/o/log/new';
  static String dailyLogFor(String batchCode) => '$dailyLogNew?batch=$batchCode';
  static const capture = '/o/capture';
  static String captureBox(String slotCode) => '$capture?slot=$slotCode';
  static String harvest(String batchCode) => '/o/harvest/$batchCode';
}

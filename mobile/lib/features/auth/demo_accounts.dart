// Tài khoản demo — trùng với backend/src/CrabShare.Api/Infrastructure/Persistence/DevDataSeeder.cs
// và web/src/features/auth/demoAccounts.ts.
import 'package:flutter/foundation.dart';

/// Nút đăng nhập nhanh hiện khi chạy debug, hoặc khi build bản demo với --dart-define=DEMO_ACCOUNTS=true.
/// Bản phát hành thật KHÔNG bật cờ này.
const showDemoAccounts = bool.fromEnvironment('DEMO_ACCOUNTS', defaultValue: kDebugMode);

const demoPassword = 'CrabShare@2026';

const demoAccounts = [
  (label: 'Hộ nuôi (chủ)', email: 'operator@crabshare.local'),
  (label: 'Nhân viên trại', email: 'staff@crabshare.local'),
  (label: 'Nhà đầu tư', email: 'investor1@crabshare.local'),
];

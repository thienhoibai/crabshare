import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app/app.dart';
import 'core/auth/session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('vi_VN');

  // Đọc phiên đăng nhập đã lưu để mở app không phải đăng nhập lại.
  final saved = await SessionController.restore();

  runApp(
    ProviderScope(
      overrides: [sessionProvider.overrideWith(() => SessionController(saved))],
      child: const CrabShareApp(),
    ),
  );
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../shared/widgets/app_parts.dart';

/// Mở trình duyệt; test thay bằng bản giả.
final operatorWebLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// Việc làm trên trang web của người nuôi (tạo Lô, hồ sơ hộ nuôi): mở `webUrl + path`; không mở được thì báo ngắn.
Future<void> openOperatorWeb(BuildContext context, WidgetRef ref, String path) async {
  var opened = false;
  try {
    opened = await ref.read(operatorWebLauncherProvider)(Uri.parse('$webUrl$path'));
  } catch (_) {
    opened = false;
  }
  if (!opened && context.mounted) showAppToast(context, 'Không mở được trang web.', error: true);
}

import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/session.dart';
import '../../shared/widgets/app_ui.dart';

/// Quản trị viên, người thẩm định và khách hàng dùng bản web; app chỉ phục vụ nhà đầu tư và hộ nuôi.
class UnsupportedRolePage extends ConsumerWidget {
  const UnsupportedRolePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const EmptyState(
                icon: Icons.desktop_windows_outlined,
                title: 'Tài khoản này dùng trên web',
                message: 'Ứng dụng di động dành cho nhà đầu tư và hộ nuôi. Quản trị, thẩm định và mua hàng vui lòng dùng web CrabShare.',
              ),
              FilledButton(onPressed: () => ref.read(sessionProvider.notifier).signOut(), child: const Text('Đăng xuất')),
            ],
          ),
        ),
      ),
    );
  }
}

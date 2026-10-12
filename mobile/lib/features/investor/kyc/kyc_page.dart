import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_theme.dart';
import '../../../shared/widgets/app_ui.dart';
import '../data/investor_models.dart';
import '../data/investor_repository.dart';

/// Xác minh danh tính (eKYC) của nhà đầu tư.
/// Backend gọi IEkycProvider (hiện là FakeEkycProvider); chỉ lưu KẾT QUẢ, không lưu ảnh giấy tờ (Phiếu, mục Identity).
class KycPage extends ConsumerWidget {
  const KycPage({super.key});

  static const _steps = [
    (Icons.badge_outlined, 'CCCD mặt trước', 'Chụp rõ 4 góc, không loá'),
    (Icons.flip_outlined, 'CCCD mặt sau', 'Chụp mặt có mã QR'),
    (Icons.face_retouching_natural_outlined, 'Xác thực khuôn mặt', 'Quay đầu chậm theo hướng dẫn'),
    (Icons.fact_check_outlined, 'Kết quả', 'Thường có trong vòng 1 phút'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(kycStatusProvider).value ?? KycStatus.unverified;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            const SubPageHeader(title: 'Xác minh danh tính'),
            const SizedBox(height: 20),
            AppCard(
              color: AppColors.ink,
              child: Row(
                children: [
                  const IconTile(icon: Icons.shield_outlined, background: AppColors.accent, foreground: AppColors.ink),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_statusLabel(status), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
                        const SizedBox(height: 2),
                        const Text(
                          'Cần xác minh trước khi góp vốn. CrabShare chỉ lưu kết quả xác minh.',
                          style: TextStyle(color: Color(0xFFBDB7B1), fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SectionHeader(title: 'Các bước'),
            for (final (i, (icon, title, hint)) in _steps.indexed) ...[
              AppCard(
                child: Row(
                  children: [
                    IconTile(icon: icon),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${i + 1}. $title', style: Theme.of(context).textTheme.titleMedium),
                          Text(hint, style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: status == KycStatus.verified
                  ? null
                  : () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Luồng eKYC sandbox đang được xây dựng.')),
                      ),
              child: const Text('Bắt đầu xác minh'),
            ),
          ],
        ),
      ),
    );
  }

  static String _statusLabel(KycStatus s) => switch (s) {
        KycStatus.unverified => 'Chưa xác minh',
        KycStatus.pending => 'Đang chờ kết quả',
        KycStatus.verified => 'Đã xác minh',
        KycStatus.rejected => 'Xác minh không đạt — thử lại',
      };
}

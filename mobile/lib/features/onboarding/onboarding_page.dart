import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../app/theme/app_images.dart';
import '../../app/theme/app_theme.dart';
import '../../shared/widgets/app_ui.dart';

/// Màn chào — theo mẫu: ảnh tràn viền có chip nổi, tiêu đề đậm lớn, mô tả, chấm trang, nút đen "Bắt đầu".
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({super.key});

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _Slide {
  const _Slide(this.image, this.title, this.subtitle, this.chips);
  final String image;
  final String title;
  final String subtitle;
  final List<(IconData, String)> chips;
}

class _OnboardingPageState extends State<OnboardingPage> {
  final _controller = PageController();
  int _page = 0;

  static const _slides = [
    _Slide(
      AppImages.crabFattening,
      'Góp vốn nuôi cua,\nthấy rõ từng lô',
      'Theo dõi lô bạn góp vốn qua nhật ký hằng ngày và ảnh chụp trực tiếp từ trại.',
      [(Icons.inventory_2_outlined, 'Lô CS-2610-01'), (Icons.photo_camera_outlined, 'Ảnh chụp trực tiếp'), (Icons.lock_outline_rounded, 'Chi phí chuẩn đã khoá')],
    ),
    _Slide(
      AppImages.farmer,
      'Hộ nuôi ghi nhận\nngay trên điện thoại',
      'Nhật ký, sự kiện từng hộp và ảnh bằng chứng — gửi trong vài chạm.',
      [(Icons.science_outlined, 'pH 7,8'), (Icons.thermostat_outlined, '28,5°C'), (Icons.grid_view_rounded, 'Hộp 0014')],
    ),
    _Slide(
      AppImages.crabRoe,
      'Quét tem,\nbiết cua từ đâu tới',
      'Mỗi con cua có tem riêng từ lúc thu hoạch đến tay người mua.',
      [(Icons.qr_code_2_rounded, 'Tem CSAB23CD45EF'), (Icons.route_outlined, 'Hộp → Đơn hàng')],
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height;
    return Scaffold(
      body: Column(
        children: [
          SizedBox(
            height: height * 0.56,
            child: PageView.builder(
              controller: _controller,
              itemCount: _slides.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (context, i) => _SlideImage(slide: _slides[i]),
            ),
          ),
          Expanded(
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 22, 24, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Phần chữ cuộn được khi màn hình thấp hoặc người dùng phóng to cỡ chữ.
                    Expanded(
                      child: SingleChildScrollView(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          child: Column(
                            key: ValueKey(_page),
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(_slides[_page].title, style: Theme.of(context).textTheme.displaySmall?.copyWith(fontSize: 32)),
                              const SizedBox(height: 10),
                              Text(_slides[_page].subtitle, style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: AppColors.inkMuted)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        for (var i = 0; i < _slides.length; i++)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            margin: const EdgeInsets.only(right: 6),
                            width: i == _page ? 22 : 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: i == _page ? AppColors.ink : AppColors.surfaceMuted,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        const Spacer(),
                        TextButton.icon(
                          onPressed: () => context.push(Routes.scan),
                          icon: const Icon(Icons.qr_code_scanner_rounded, color: AppColors.ink),
                          label: const Text('Quét tem', style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    FilledButton(onPressed: () => context.go(Routes.login), child: const Text('Bắt đầu')),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SlideImage extends StatelessWidget {
  const _SlideImage({required this.slide});

  final _Slide slide;

  static const _chipSpots = [Alignment(-0.85, -0.35), Alignment(0.8, 0.15), Alignment(-0.6, 0.7)];

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(36)),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(slide.image, fit: BoxFit.cover),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.black.withValues(alpha: 0.25), Colors.transparent, Colors.black.withValues(alpha: 0.15)],
              ),
            ),
          ),
          for (final (i, (icon, label)) in slide.chips.indexed)
            Align(
              alignment: _chipSpots[i % _chipSpots.length],
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 16, offset: const Offset(0, 6))],
                ),
                child: InfoChip(icon: icon, label: label),
              ),
            ),
          Positioned(
            top: MediaQuery.paddingOf(context).top + 12,
            left: 20,
            child: const InfoChip(icon: Icons.set_meal_rounded, label: 'CrabShare', background: AppColors.ink, foreground: Colors.white),
          ),
        ],
      ),
    );
  }
}

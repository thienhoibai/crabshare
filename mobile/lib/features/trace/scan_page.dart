import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import '../../app/theme/app_theme.dart';
import '../../shared/widgets/app_ui.dart';

/// Quét tem cua. Khung camera đang là hình minh hoạ; tích hợp đọc QR thật (package mobile_scanner) là một task riêng.
/// Tạm thời cho nhập mã tem 12 ký tự.
class ScanPage extends StatefulWidget {
  const ScanPage({super.key});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _lookup() {
    final code = _code.text.trim().toUpperCase();
    if (code.length != 12) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Mã tem gồm 12 ký tự.')));
      return;
    }
    context.push(Routes.trace(code));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.nav,
      body: SafeArea(
        child: ListView(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Row(
                children: [
                  CircleIconButton(
                    icon: Icons.close_rounded,
                    background: Colors.white.withValues(alpha: 0.12),
                    foreground: Colors.white,
                    onTap: () => Navigator.of(context).maybePop(),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Quét tem truy xuất',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: _Viewfinder()),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
              decoration: const BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Nhập mã tem minh hoạ',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _code,
                    maxLength: 12,
                    textCapitalization: TextCapitalization.characters,
                    onSubmitted: (_) => _lookup(),
                    decoration: const InputDecoration(
                      hintText: 'VD: CSAB23CD45EF',
                      prefixIcon: Icon(Icons.qr_code_2_rounded),
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _lookup,
                    child: const Text('Tra cứu'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Khung ngắm có 4 góc cam và vạch quét chạy lên xuống.
class _Viewfinder extends StatefulWidget {
  const _Viewfinder();

  @override
  State<_Viewfinder> createState() => _ViewfinderState();
}

class _ViewfinderState extends State<_Viewfinder>
    with SingleTickerProviderStateMixin {
  late final _anim = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 2),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const size = 240.0;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: size,
          height: size,
          child: Stack(
            children: [
              Positioned.fill(child: CustomPaint(painter: _CornersPainter())),
              AnimatedBuilder(
                animation: _anim,
                builder: (context, _) => Positioned(
                  left: 18,
                  right: 18,
                  top: 18 + (size - 36) * _anim.value,
                  child: Container(height: 2, color: AppColors.accent),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const Text(
          'Khung minh hoạ · Nhập mã ở bên dưới',
          style: TextStyle(color: Color(0xFFBDB7B1)),
        ),
      ],
    );
  }
}

class _CornersPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = AppColors.accent
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    const l = 36.0;
    final w = size.width;
    final h = size.height;
    for (final (x, y, dx, dy) in [
      (0.0, 0.0, 1.0, 1.0),
      (w, 0.0, -1.0, 1.0),
      (0.0, h, 1.0, -1.0),
      (w, h, -1.0, -1.0),
    ]) {
      canvas.drawLine(Offset(x, y), Offset(x + l * dx, y), p);
      canvas.drawLine(Offset(x, y), Offset(x, y + l * dy), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../app/routes.dart';
import '../../app/theme/app_theme.dart';
import '../../shared/widgets/app_ui.dart';
import 'trace_code_parser.dart';

/// Quét tem truy xuất bằng camera hoặc nhập mã tem nếu camera không khả dụng.
class ScanPage extends StatefulWidget {
  const ScanPage({super.key});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  final _code = TextEditingController();
  final _scanGate = TraceScanGate();
  final _scanner = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  bool _openingResult = false;

  @override
  void dispose() {
    _code.dispose();
    _scanner.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_openingResult) return;
    for (final barcode in capture.barcodes) {
      final code = _scanGate.accept(barcode.rawValue);
      if (code == null) continue;
      unawaited(_openResult(code));
      return;
    }
  }

  Future<void> _lookup() async {
    final code = _scanGate.accept(_code.text);
    if (code == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mã tem gồm 12 ký tự đúng định dạng.')),
      );
      return;
    }
    await _openResult(code);
  }

  Future<void> _openResult(String code) async {
    if (_openingResult) return;
    _openingResult = true;
    try {
      if (_scanner.value.isRunning) await _scanner.stop();
      if (!mounted) return;
      await context.push(Routes.trace(code));
    } finally {
      if (mounted) {
        _scanGate.reset();
        _openingResult = false;
        if (!_scanner.value.isRunning) {
          try {
            await _scanner.start();
          } on MobileScannerException {
            // The error builder explains permission and initialization failures.
          }
        }
      }
    }
  }

  Future<void> _retryCamera() async {
    try {
      if (!_scanner.value.isRunning) await _scanner.start();
    } on MobileScannerException {
      // Keep the error builder visible if camera permission is still denied.
    }
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
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: SizedBox(
                height: 284,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      MobileScanner(
                        controller: _scanner,
                        onDetect: _onDetect,
                        placeholderBuilder: (_) => const Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircularProgressIndicator(color: AppColors.accent),
                              SizedBox(height: 12),
                              Text('Đang khởi tạo camera…', style: TextStyle(color: Colors.white)),
                            ],
                          ),
                        ),
                        errorBuilder: (_, error) => TraceCameraError(
                          error: error,
                          onRetry: () => unawaited(_retryCamera()),
                        ),
                      ),
                      const IgnorePointer(child: _Viewfinder()),
                    ],
                  ),
                ),
              ),
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
                    'Nhập mã tem nếu không quét được',
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
                  FilledButton(onPressed: _lookup, child: const Text('Tra cứu')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Permission and initialization errors have different recovery guidance.
class TraceCameraError extends StatelessWidget {
  const TraceCameraError({super.key, required this.error, required this.onRetry});

  final MobileScannerException error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    final unsupported = error.errorCode == MobileScannerErrorCode.unsupported;
    final message = denied
        ? 'Quyền camera đã bị từ chối. Hãy cho phép camera trong cài đặt hoặc nhập mã tem bên dưới.'
        : unsupported
            ? 'Thiết bị không hỗ trợ camera. Bạn có thể nhập mã tem bên dưới.'
            : 'Không khởi tạo được camera. Hãy thử lại hoặc nhập mã tem bên dưới.';

    return ColoredBox(
      color: Colors.black87,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(denied ? Icons.no_photography_outlined : Icons.camera_alt_outlined,
                  color: Colors.white, size: 32),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
              const SizedBox(height: 10),
              TextButton(onPressed: onRetry, child: const Text('Thử lại')),
            ],
          ),
        ),
      ),
    );
  }
}

/// Aim guide drawn over the live camera preview.
class _Viewfinder extends StatefulWidget {
  const _Viewfinder();

  @override
  State<_Viewfinder> createState() => _ViewfinderState();
}

class _ViewfinderState extends State<_Viewfinder> with SingleTickerProviderStateMixin {
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
      mainAxisAlignment: MainAxisAlignment.center,
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
        const SizedBox(height: 10),
        const Text(
          'Đưa tem QR vào khung hình',
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
    const length = 36.0;
    final width = size.width;
    final height = size.height;
    for (final (x, y, dx, dy) in [
      (0.0, 0.0, 1.0, 1.0),
      (width, 0.0, -1.0, 1.0),
      (0.0, height, 1.0, -1.0),
      (width, height, -1.0, -1.0),
    ]) {
      canvas.drawLine(Offset(x, y), Offset(x + length * dx, y), p);
      canvas.drawLine(Offset(x, y), Offset(x, y + length * dy), p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

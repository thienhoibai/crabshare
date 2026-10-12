import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../../app/theme/app_theme.dart';

/// Đồng hồ bán nguyệt chia vạch (theo mẫu "995 kcal / Goal 2000 kcal").
/// [value] từ 0 đến 1; [center] là phần chữ nằm giữa vòng cung.
class SegmentedGauge extends StatelessWidget {
  const SegmentedGauge({super.key, required this.value, required this.center, this.segments = 26, this.width = 270});

  final double value;
  final Widget center;
  final int segments;
  final double width;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: value.clamp(0.0, 1.0)),
      duration: const Duration(milliseconds: 900),
      curve: Curves.easeOutCubic,
      builder: (context, animated, child) => SizedBox(
        width: width,
        height: width / 2 + 14,
        child: CustomPaint(
          painter: _GaugePainter(value: animated, segments: segments),
          child: Align(alignment: const Alignment(0, 0.95), child: child),
        ),
      ),
      child: center,
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter({required this.value, required this.segments});

  final double value;
  final int segments;

  @override
  void paint(Canvas canvas, Size size) {
    final origin = Offset(size.width / 2, size.height - 8);
    final outer = size.width / 2 - 6;
    final inner = outer - 30;
    final paint = Paint()
      ..strokeWidth = 7
      ..strokeCap = StrokeCap.round;

    for (var i = 0; i < segments; i++) {
      final t = (i + 0.5) / segments;
      final angle = math.pi + t * math.pi; // từ trái (π) qua đỉnh tới phải (2π)
      final dir = Offset(math.cos(angle), math.sin(angle));
      paint.color = t <= value
          ? Color.lerp(AppColors.accent.withValues(alpha: 0.55), AppColors.accent, t)!
          : AppColors.surfaceMuted;
      canvas.drawLine(origin + dir * inner, origin + dir * outer, paint);
    }
  }

  @override
  bool shouldRepaint(_GaugePainter old) => old.value != value || old.segments != segments;
}

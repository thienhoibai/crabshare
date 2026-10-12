/// Khoảng giá trị dùng để NHẮC ngay trên form khi người nuôi nhập.
/// Đây là giá trị tạm để dựng giao diện — ngưỡng chính thức do backend cấu hình theo lô
/// và là nơi sinh cảnh báo WaterQuality. Chốt số liệu theo SRS trước khi demo.
class ValueRange {
  const ValueRange(this.min, this.max);

  final double min;
  final double max;

  bool contains(double value) => value >= min && value <= max;

  String format() => '${_f(min)}–${_f(max)}';

  static String _f(double v) => (v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1)).replaceAll('.', ',');
}

abstract final class LogThresholds {
  static const ph = ValueRange(7.5, 8.5);
  static const waterTempC = ValueRange(25, 32);
  static const salinityPpt = ValueRange(10, 25);
  static const feedKg = ValueRange(0, 50);
}

/// Đọc số người dùng gõ, chấp nhận cả dấu phẩy thập phân kiểu Việt ("7,8").
double? parseDecimal(String text) {
  final t = text.trim().replaceAll(',', '.');
  return t.isEmpty ? null : double.tryParse(t);
}

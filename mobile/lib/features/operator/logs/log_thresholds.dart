/// A batch's configured range. No operating ranges are supplied by the app.
class ValueRange {
  const ValueRange(this.min, this.max);

  final double min;
  final double max;

  bool contains(double value) => value >= min && value <= max;

  String format() => '${formatLogNumber(min)}–${formatLogNumber(max)}';
}

String formatLogNumber(double? value, {int digits = 1}) =>
    value == null ? '—' : value.toStringAsFixed(digits).replaceAll('.', ',');

/// Đọc số người dùng gõ, chấp nhận cả dấu phẩy thập phân kiểu Việt ("7,8").
double? parseDecimal(String text) {
  final t = text.trim().replaceAll(',', '.');
  if (!RegExp(r'^-?\d+(?:\.\d+)?$').hasMatch(t)) return null;
  final value = double.tryParse(t);
  return value != null && value.isFinite ? value : null;
}

/// Physical/storage limits are validation bounds, never farming safety presets.
String? validateLogNumber(
  String? text, {
  required double min,
  required double max,
  int digits = 1,
}) {
  final raw = (text ?? '').trim();
  final value = parseDecimal(raw);
  if (value == null) return 'Nhập số hợp lệ.';
  final fraction = raw.replaceAll(',', '.').split('.');
  if (fraction.length > 1 && fraction.last.length > digits) {
    return 'Tối đa $digits chữ số thập phân.';
  }
  if (value < min || value > max) return 'Giá trị phải từ $min đến $max.';
  return null;
}

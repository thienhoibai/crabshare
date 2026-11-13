// Đọc và hiển thị số đo của nhật ký chăm sóc theo kiểu Việt (dấu phẩy thập phân).

/// 7.85 → "7,9"; null → "—".
String formatLogNumber(double? value, {int digits = 1}) => value == null ? '—' : value.toStringAsFixed(digits).replaceAll('.', ',');

/// Số để điền sẵn vào ô nhập: tối đa [digits] chữ số thập phân, bỏ số 0 thừa. 15.10 → "15,1"; 28.0 → "28".
String prefillNumber(double value, {int digits = 1}) {
  final text = value.toStringAsFixed(digits);
  final trimmed = text.contains('.') ? text.replaceFirst(RegExp(r'\.?0+$'), '') : text;
  return trimmed.replaceAll('.', ',');
}

/// Đọc số người dùng gõ, chấp nhận cả dấu phẩy thập phân ("7,8").
double? parseDecimal(String text) {
  final t = text.trim().replaceAll(',', '.');
  if (!RegExp(r'^-?\d+(?:\.\d+)?$').hasMatch(t)) return null;
  final value = double.tryParse(t);
  return value != null && value.isFinite ? value : null;
}

/// Giới hạn ở đây là giới hạn lưu trữ của máy chủ, không phải ngưỡng nuôi.
String? validateLogNumber(String? text, {required double min, required double max, int digits = 1}) {
  final raw = (text ?? '').trim();
  if (raw.isEmpty) return 'Chưa nhập.';
  final value = parseDecimal(raw);
  if (value == null) return 'Nhập số hợp lệ.';
  final fraction = raw.replaceAll(',', '.').split('.');
  if (fraction.length > 1 && fraction.last.length > digits) return 'Tối đa $digits chữ số thập phân.';
  if (value < min || value > max) return 'Từ ${prefillNumber(min, digits: 3)} đến ${prefillNumber(max, digits: 3)}.';
  return null;
}

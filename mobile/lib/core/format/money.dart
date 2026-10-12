import 'package:intl/intl.dart';

final _vnd = NumberFormat.decimalPattern('vi_VN');

/// 1500000 → "1.500.000 đ". Tiền trong hệ thống luôn là số nguyên đồng.
String formatVnd(num amount) => '${_vnd.format(amount.round())} đ';

/// 1180 → "1.180" (số con, số hộp...).
String formatCount(num value) => _vnd.format(value);

/// 120000000 → "120 triệu" (dùng cho số lớn trên thẻ).
String formatMillions(num amount) {
  final m = amount / 1000000;
  final text = m == m.roundToDouble() ? m.toStringAsFixed(0) : m.toStringAsFixed(1).replaceAll('.', ',');
  return '$text triệu';
}

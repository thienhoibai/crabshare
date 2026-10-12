import 'package:crabshare_mobile/core/format/dates.dart';
import 'package:crabshare_mobile/core/format/money.dart';
import 'package:crabshare_mobile/features/operator/logs/log_thresholds.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('tiền VND là số nguyên, phân cách bằng dấu chấm', () {
    expect(formatVnd(15000000), '15.000.000 đ');
    expect(formatMillions(120000000), '120 triệu');
    expect(formatMillions(21500000), '21,5 triệu');
  });

  test('đọc số kiểu Việt có dấu phẩy', () {
    expect(parseDecimal('7,8'), 7.8);
    expect(parseDecimal(' 28.5 '), 28.5);
    expect(parseDecimal(''), isNull);
    expect(parseDecimal('abc'), isNull);
  });

  test('thời hạn còn lại / quá hạn', () {
    final now = DateTime(2026, 10, 12, 8);
    expect(formatDueIn(now.add(const Duration(minutes: 45)), now: now), 'còn 45 phút');
    expect(formatDueIn(now.add(const Duration(days: 6)), now: now), 'còn 6 ngày');
    expect(formatDueIn(now.subtract(const Duration(hours: 2)), now: now), 'quá hạn 2 giờ');
  });
}

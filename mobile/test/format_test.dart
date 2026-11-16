import 'package:crabshare_mobile/core/format/dates.dart';
import 'package:crabshare_mobile/core/format/money.dart';
import 'package:crabshare_mobile/features/operator/logs/log_numbers.dart';
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

  test('số điền sẵn từ cảm biến làm tròn một chữ số thập phân và bỏ số 0 thừa', () {
    expect(prefillNumber(7.85), '7,8');
    expect(prefillNumber(15.10), '15,1');
    expect(prefillNumber(28), '28');
    expect(prefillNumber(100), '100');
    expect(parseDecimal(prefillNumber(27.64)), 27.6);
    expect(formatLogNumber(null), '—');
    expect(formatLogNumber(0.72, digits: 3), '0,720');
  });

  test('kiểm tra số đo nhật ký: bắt buộc, số chữ số thập phân, giới hạn', () {
    expect(validateLogNumber('', min: 0, max: 14), 'Chưa nhập.');
    expect(validateLogNumber('abc', min: 0, max: 14), 'Nhập số hợp lệ.');
    expect(validateLogNumber('7,85', min: 0, max: 14), 'Tối đa 1 chữ số thập phân.');
    expect(validateLogNumber('15', min: 0, max: 14), 'Từ 0 đến 14.');
    expect(validateLogNumber('7,8', min: 0, max: 14), isNull);
    expect(validateLogNumber('0,725', min: 0, max: 999, digits: 3), isNull);
  });

  test('thời hạn còn lại / quá hạn', () {
    final now = DateTime(2026, 10, 12, 8);
    expect(formatDueIn(now.add(const Duration(minutes: 45)), now: now), 'còn 45 phút');
    expect(formatDueIn(now.add(const Duration(days: 6)), now: now), 'còn 6 ngày');
    expect(formatDueIn(now.subtract(const Duration(hours: 2)), now: now), 'quá hạn 2 giờ');
  });
}

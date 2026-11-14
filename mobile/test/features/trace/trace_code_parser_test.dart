import 'package:flutter_test/flutter_test.dart';

import 'package:crabshare_mobile/features/trace/trace_code_parser.dart';

void main() {
  group('parseOrderTraceCode', () {
    test('accepts a bare trace code and normalizes case and spaces', () {
      expect(parseOrderTraceCode('QR7K2M9XQ4TB'), 'QR7K2M9XQ4TB');
      expect(parseOrderTraceCode('qr7k2m9xq4tb'), 'QR7K2M9XQ4TB');
      expect(parseOrderTraceCode(' QR7K2M9XQ4TB '), 'QR7K2M9XQ4TB');
    });

    test('maps hand-typed letters the code alphabet does not have', () {
      expect(parseOrderTraceCode('QRO123456789'), 'QR0123456789');
      expect(parseOrderTraceCode('qril23456789'), 'QR1123456789');
    });

    test('accepts the order trace URL on any deployment host', () {
      expect(parseOrderTraceCode('https://crabshare.vn/truy-xuat/QR7K2M9XQ4TB'), 'QR7K2M9XQ4TB');
      expect(parseOrderTraceCode('http://localhost:5173/truy-xuat/qr7k2m9xq4tb'), 'QR7K2M9XQ4TB');
      expect(parseOrderTraceCode('https://demo.crabshare.vn/app/truy-xuat/QR7K2M9XQ4TB/'), 'QR7K2M9XQ4TB');
    });

    test('rejects old per-crab tag codes, malformed codes and other URLs', () {
      for (final raw in [
        '',
        '23456789ABCD',
        'CSAB23CD45EF',
        'QR7K2M9XQ4T',
        'QR7K2M9XQ4TBX',
        'QR7K2M9XQ4TU',
        'QR7K2M9XQ4T-',
        'https://crabshare.vn/truy-xuat/23456789ABCD',
        'ftp://crabshare.vn/truy-xuat/QR7K2M9XQ4TB',
        'https://crabshare.vn/lo/QR7K2M9XQ4TB',
        'https://crabshare.vn/truy-xuat/QR7K2M9XQ4TB/extra',
        'https://crabshare.vn/truy-xuat?code=QR7K2M9XQ4TB',
        'https://user@crabshare.vn/truy-xuat/QR7K2M9XQ4TB',
        'not a URL',
      ]) {
        expect(parseOrderTraceCode(raw), isNull, reason: raw);
      }
    });
  });

  test('TraceScanGate accepts one valid callback until reset', () {
    final gate = TraceScanGate();

    expect(gate.accept('invalid'), isNull);
    expect(gate.accept(null), isNull);
    expect(gate.accept('QR7K2M9XQ4TB'), 'QR7K2M9XQ4TB');
    expect(gate.accept('https://crabshare.vn/truy-xuat/QR0123456789'), isNull);

    gate.reset();
    expect(gate.accept('https://crabshare.vn/truy-xuat/QR0123456789'), 'QR0123456789');
  });
}

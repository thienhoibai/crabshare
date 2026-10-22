import 'package:flutter_test/flutter_test.dart';

import 'package:crabshare_mobile/features/trace/trace_code_parser.dart';

void main() {
  group('parseTraceTag', () {
    test('accepts a raw VI-15 code and normalizes lowercase', () {
      expect(parseTraceTag('23456789ABCD'), '23456789ABCD');
      expect(parseTraceTag('23456789abcd'), '23456789ABCD');
      expect(parseTraceTag(' 23456789ABCD '), '23456789ABCD');
    });

    test('accepts an absolute VI-15 URL on any deployment host', () {
      expect(
        parseTraceTag('https://trace.crabshare.vn/truy-xuat/23456789ABCD'),
        '23456789ABCD',
      );
      expect(
        parseTraceTag('http://localhost:5173/truy-xuat/23456789abcd'),
        '23456789ABCD',
      );
    });

    test('rejects malformed codes and URLs outside the published route', () {
      for (final raw in [
        '',
        '23456789ABC',
        '23456789ABCDE',
        '23456789ABCI',
        '23456789ABCO',
        '23456789ABCL',
        'ftp://trace.crabshare.vn/truy-xuat/23456789ABCD',
        'https://trace.crabshare.vn/other/23456789ABCD',
        'https://trace.crabshare.vn/truy-xuat/23456789ABCD/extra',
        'https://trace.crabshare.vn/truy-xuat?tagCode=23456789ABCD',
        'not a URL',
      ]) {
        expect(parseTraceTag(raw), isNull, reason: raw);
      }
    });
  });
}

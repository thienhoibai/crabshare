import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'package:crabshare_mobile/features/trace/scan_page.dart';
import 'package:crabshare_mobile/features/trace/trace_code_parser.dart';

void main() {
  test('TraceScanGate accepts one valid callback until reset', () {
    final gate = TraceScanGate();

    expect(gate.accept('invalid'), isNull);
    expect(gate.accept('23456789ABCD'), '23456789ABCD');
    expect(gate.accept('https://trace.crabshare.vn/truy-xuat/23456789ABCD'), isNull);

    gate.reset();
    expect(gate.accept('https://trace.crabshare.vn/truy-xuat/23456789EFGH'), '23456789EFGH');
  });

  testWidgets('camera permission denial explains how to continue and can retry', (tester) async {
    var retried = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TraceCameraError(
          error: const MobileScannerException(
            errorCode: MobileScannerErrorCode.permissionDenied,
          ),
          onRetry: () => retried = true,
        ),
      ),
    ));

    expect(find.textContaining('Quyền camera'), findsOneWidget);
    await tester.tap(find.text('Thử lại'));
    expect(retried, isTrue);
  });

  testWidgets('camera initialization failure is shown separately from permission denial', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: TraceCameraError(
          error: MobileScannerException(errorCode: MobileScannerErrorCode.genericError),
          onRetry: _noop,
        ),
      ),
    ));

    expect(find.textContaining('Không khởi tạo được camera'), findsOneWidget);
  });
}

void _noop() {}

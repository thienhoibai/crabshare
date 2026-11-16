import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/features/trace/scan_page.dart';

void main() {
  testWidgets('typing the trace code by hand opens the trace screen; a wrong code is refused', (tester) async {
    final router = GoRouter(
      initialLocation: Routes.scan,
      routes: [
        GoRoute(path: Routes.scan, builder: (context, state) => const ScanPage()),
        GoRoute(
          path: '/trace/:code',
          builder: (context, state) => Scaffold(body: Text('Truy xuất ${state.pathParameters['code']}')),
        ),
      ],
    );
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pump();

    expect(find.text('Quét QR đơn hàng'), findsOneWidget);
    expect(find.text('Nhập mã truy xuất nếu không quét được'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '23456789ABCD');
    await tester.tap(find.text('Tra cứu'));
    await tester.pump();
    expect(find.text('Mã truy xuất chưa đúng. Mã gồm chữ QR và 10 ký tự.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'qrs69qkr2gp0');
    await tester.tap(find.text('Tra cứu'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Truy xuất QRS69QKR2GP0'), findsOneWidget);
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
    expect(find.textContaining('nhập mã truy xuất'), findsOneWidget);
    expect(find.textContaining('tem'), findsNothing);
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

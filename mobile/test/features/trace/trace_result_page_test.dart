import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/features/trace/trace_repository.dart';
import 'package:crabshare_mobile/features/trace/trace_result_page.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/trace_fixtures.dart';

class _Repository implements TraceRepository {
  _Repository({this.missing = false});
  final bool missing;
  final codes = <String>[];

  @override
  Future<OrderTrace> lookup(String traceCode) async {
    codes.add(traceCode);
    if (missing) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(requestOptions: RequestOptions(), statusCode: 404, data: {'detail': 'Không tìm thấy mã QR đơn.'}),
      );
    }
    return OrderTrace.fromJson(orderTraceJson());
  }
}

Widget _app(_Repository repository) => ProviderScope(
  overrides: [traceRepositoryProvider.overrideWithValue(repository)],
  child: MaterialApp(theme: buildAppTheme(), home: const TraceResultPage(traceCode: 'QR7K2M9XQ4TB')),
);

void main() {
  testWidgets('shows batch, farm, source lots, specs and deliveries of the order', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final repository = _Repository();

    await tester.pumpWidget(_app(repository));
    await tester.pumpAndSettle();

    expect(repository.codes, ['QR7K2M9XQ4TB']);
    expect(find.text('Cua thịt thu mua Năm Căn'), findsOneWidget);
    expect(find.text('Lô CS-2611-T1 · Cua thịt vỗ béo'), findsOneWidget);
    expect(find.text('HTX Cua Năm Căn'), findsOneWidget);
    expect(find.text('Cua thịt size M Cấp 1'), findsOneWidget);
    expect(find.text('20 con'), findsOneWidget);
    expect(find.text('30 con'), findsOneWidget);

    await tester.scrollUntilVisible(find.textContaining('T/SCFA 0014-2024'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Năm Căn, Cà Mau'), findsOneWidget);
    expect(find.text('Thu ngày 20/10/2026 · Scylla paramamosain'), findsOneWidget);
    expect(find.text('Chưa khai vùng xuất xứ'), findsOneWidget);
    expect(find.text('10/11/2026'), findsOneWidget);
    // Ghi chú của API hiện nguyên câu nhưng không kèm mã quy tắc.
    expect(find.textContaining('BR-'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('unknown trace code shows the server message with a retry', (tester) async {
    await tester.pumpWidget(_app(_Repository(missing: true)));
    await tester.pumpAndSettle();

    expect(find.text('Không tìm thấy mã QR đơn.'), findsOneWidget);
    expect(find.text('Thử lại'), findsOneWidget);
    expect(find.text('Truy xuất nguồn gốc'), findsOneWidget);
  });
}

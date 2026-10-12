import 'package:crabshare_mobile/shared/widgets/segmented_gauge.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('đồng hồ hiển thị phần chữ ở giữa', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: Center(child: SegmentedGauge(value: 0.6, center: Text('3 / 5 việc')))),
    ));
    await tester.pumpAndSettle();
    expect(find.text('3 / 5 việc'), findsOneWidget);
  });
}

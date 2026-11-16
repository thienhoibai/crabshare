import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/features/operator/data/alert_repository.dart';
import 'package:crabshare_mobile/shared/widgets/app_parts.dart';
import 'package:crabshare_mobile/shared/widgets/app_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

void main() {
  setUpAll(loadAppFonts);

  test('repository gọi đúng endpoint và nhận cả loại cảnh báo mới của BR v1.5', () async {
    final server = FarmServer()..alerts = [alertJson(), alertJson(id: 38, type: 'LoạiChưaBiết', status: 'Resolved')];
    final repo = ApiAlertRepository(server.dio());

    final alerts = await repo.list();
    expect(alerts.map((a) => (a.type, a.isOpen, a.canAcknowledge)), [('DeviceOffline', true, true), ('LoạiChưaBiết', false, false)]);
    expect(alerts.first.severity, 'High');

    final acknowledged = await repo.acknowledge(37, 'Đã khởi động lại thiết bị');
    expect((acknowledged.status, acknowledged.responseNote), ('Acknowledged', 'Đã khởi động lại thiết bị'));
    expect(server.calls, ['GET /api/operators/me/alerts', 'POST /api/alerts/37/acknowledge']);
    expect(server.requests.last.data, {'responseNote': 'Đã khởi động lại thiết bị'});
  });

  testWidgets('phản hồi bắt buộc ghi cách xử lý; gửi xong cảnh báo chuyển vào khối đã phản hồi', (tester) async {
    final server = FarmServer()..alerts = [alertJson()];
    await pumpFarmApp(tester, server, location: Routes.operatorAlerts);

    // Màn con có nút quay lại.
    expect(find.byType(SubPageHeader), findsOneWidget);
    expect(find.text('Thiết bị mất kết nối'), findsOneWidget);
    expect(find.text('Thiết bị WS-NC-01 không gửi dữ liệu quá 15 phút.'), findsOneWidget);

    await tester.tap(find.text('Phản hồi'));
    await tester.settle();
    expect(find.text('Phản hồi cảnh báo'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Gửi phản hồi')).onPressed, isNull);
    await tester.enterText(find.byType(TextField), 'Đã khởi động lại thiết bị');
    await tester.pump();
    await tester.tap(find.text('Gửi phản hồi'));
    await tester.settle();

    expect(server.sent('POST', '/api/alerts/37/acknowledge').single.data, {'responseNote': 'Đã khởi động lại thiết bị'});
    expect(find.text('Đã gửi phản hồi.'), findsOneWidget);
    expect(find.text('Không có cảnh báo đang mở'), findsOneWidget);
    expect(find.text('Phản hồi'), findsNothing);
    await tester.tap(find.text('Đã phản hồi (1)'));
    await tester.settle();
    expect(find.text('Phản hồi: Đã khởi động lại thiết bị'), findsOneWidget);
    expect(find.widgetWithText(StatusPill, 'Đã ghi nhận'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('lỗi máy chủ khi phản hồi được báo ra và cảnh báo vẫn mở', (tester) async {
    final server = FarmServer()
      ..alerts = [alertJson()]
      ..failures['POST /api/alerts/37/acknowledge'] = (409, 'Trạng thái đã thay đổi.');
    await pumpFarmApp(tester, server, location: Routes.operatorAlerts);

    await tester.tap(find.text('Phản hồi'));
    await tester.settle();
    await tester.enterText(find.byType(TextField), 'Đã thay nước');
    await tester.pump();
    await tester.tap(find.text('Gửi phản hồi'));
    await tester.settle();

    expect(find.text('Trạng thái đã thay đổi.'), findsOneWidget);
    expect(find.text('Phản hồi'), findsOneWidget);
    expect(find.textContaining('Phản hồi: '), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('cảnh báo ảnh bị gắn cờ dẫn tới danh sách ảnh cần giải trình', (tester) async {
    final server = FarmServer()..alerts = [alertJson(type: 'EvidenceFlag')];
    final router = await pumpFarmApp(tester, server, location: Routes.operatorAlerts);

    expect(find.text('Bằng chứng bị gắn cờ'), findsOneWidget);
    await tester.tap(find.text('Xem ảnh'));
    await tester.settle();
    expect(router.state.uri.path, Routes.flaggedEvidence);
    expect(find.text('Không có ảnh nào bị gắn cờ'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

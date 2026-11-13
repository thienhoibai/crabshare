import 'package:crabshare_mobile/app/routes.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

/// Điện thoại nhỏ (360 × 640) với dữ liệu dài: không màn nào của nhóm lõi bị tràn chữ hay tràn khung.
void main() {
  setUpAll(loadAppFonts);

  const small = Size(360, 640);
  const longTitle = 'Cua thịt vỗ béo hộp RAS Năm Căn — đợt tháng 11, giao trước Tết cho khách đặt trước';

  FarmServer busyFarm() => FarmServer()
    ..batches = [
      farmBatchJson(title: longTitle),
      farmBatchJson(code: 'CS-2611-T1', status: 'Selling', hasHolding: false, title: longTitle),
      farmBatchJson(code: 'CS-2610-02', status: 'PendingApproval', title: longTitle),
    ]
    ..careBatches = [careBatchJson(title: longTitle), careBatchJson(code: 'CS-2609-04', status: 'Harvesting', title: longTitle)]
    ..alerts = [
      alertJson(),
      alertJson(id: 38, type: 'EvidenceFlag'),
      alertJson(id: 39, status: 'Acknowledged', note: 'Đã thay nước và kiểm tra lại toàn bộ dàn hộp', acknowledgedAt: '2026-11-12T04:00:00Z'),
    ]
    ..captureRequests = [
      for (var i = 1; i <= 6; i++)
        captureRequestJson(
          id: i,
          slot: '170$i',
          dueIn: Duration(minutes: 20 * i),
        ),
    ]
    ..flagged = [flaggedJson(), flaggedJson(id: 58, explanation: 'Hộp sát tường nên góc chụp giống nhau giữa hai ngày liên tiếp')]
    ..logs = [
      for (var i = 1; i <= 5; i++) careLogJson(id: i, flag: 'OutOfRange', source: 'Device', note: 'Mưa lớn, đã thay nước một phần và kiểm tra hộp'),
    ]
    ..water = [
      {'measuredAt': '2026-11-12T06:05:00Z', 'temperatureC': 27.64, 'salinityPpt': 15.25, 'ph': 7.98, 'quality': 'Calibrated', 'deviceCode': 'WS'},
    ];

  for (final location in [
    Routes.operatorToday,
    Routes.operatorBatches,
    Routes.operatorBatch('CS-P1'),
    Routes.operatorAlerts,
    Routes.operatorLogs,
    Routes.dailyLogFor('CS-P1'),
    Routes.capture,
    Routes.captureBox('1701'),
    Routes.flaggedEvidence,
    Routes.evidenceExplanation(58),
  ]) {
    testWidgets('không tràn trên màn nhỏ: $location', (tester) async {
      await pumpFarmApp(tester, busyFarm(), location: location, size: small);
      expect(tester.takeException(), isNull);
      // Mở các khối gấp đang thấy để kiểm cả phần chi tiết.
      for (final more in find.byType(ExpansionTile).evaluate().toList()) {
        await tester.ensureVisible(find.byWidget(more.widget));
        await tester.tap(find.byWidget(more.widget));
        await tester.settle();
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('không tràn trên màn nhỏ: các phiếu mở từ sơ đồ hộp', (tester) async {
    await pumpFarmApp(tester, busyFarm(), location: Routes.operatorBatch('CS-P1'), size: small);

    Future<void> open(String slot) async {
      await tester.ensureVisible(find.text(slot));
      await tester.tap(find.text(slot));
      await tester.settle();
      expect(tester.takeException(), isNull, reason: 'phiếu của hộp $slot');
    }

    Future<void> close(String label) async {
      await tester.ensureVisible(find.text(label));
      await tester.tap(find.text(label));
      await tester.settle();
    }

    // Phiếu con cua, kèm lịch sử và nguồn cua.
    await open('1701');
    await tester.tap(find.text('Lịch sử'));
    await tester.settle();
    await tester.ensureVisible(find.text('Nguồn cua'));
    await tester.tap(find.text('Nguồn cua'));
    await tester.settle();
    expect(tester.takeException(), isNull);

    // Bước báo chết, có ảnh.
    await tester.ensureVisible(find.text('Báo chết'));
    await tester.tap(find.text('Báo chết'));
    await tester.settle();
    await tester.tap(find.text('Chụp hộp 1701'));
    await tester.settle();
    expect(tester.takeException(), isNull);
    await close('Quay lại');

    // Bước chuyển hộp.
    await tester.ensureVisible(find.text('Chuyển hộp'));
    await tester.tap(find.text('Chuyển hộp'));
    await tester.settle();
    expect(tester.takeException(), isNull);
    await close('Quay lại');
    Navigator.of(tester.element(find.text('Hộp 1701'))).pop();
    await tester.settle();

    // Phiếu thả bù, có ảnh.
    await open('1703');
    await tester.tap(find.text('Chụp hộp đã có cua'));
    await tester.settle();
    expect(tester.takeException(), isNull);
  });
}

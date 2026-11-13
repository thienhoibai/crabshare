import 'package:crabshare_mobile/features/operator/measure/measure_models.dart';
import 'package:crabshare_mobile/features/operator/measure/measure_page.dart';
import 'package:crabshare_mobile/features/operator/measure/measure_repository.dart';
import 'package:crabshare_mobile/features/operator/measure/work_common.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/work_fakes.dart';

void main() {
  group('ApiMeasureRepository', () {
    test('reads the batch, its numbers, decisions, waiting crabs and stations', () async {
      final (dio, requests) = recordingDio((o) {
        if (o.path.endsWith('/grading')) return gradingJson();
        if (o.path.endsWith('/grade-decisions')) return [decisionJson(status: 'Approved', holdReasons: [])];
        if (o.path.endsWith('/crab-units')) return [crabJson('CU2611P103', '1703')];
        if (o.path.endsWith('/devices')) {
          return [deviceJson(), deviceJson(code: 'RC-NC-R02', type: 'RailCamera'), deviceJson(code: 'ST-OLD', status: 'Removed')];
        }
        return workBatchJson(status: 'InProduction');
      });
      final repo = ApiMeasureRepository(dio);

      final batch = await repo.batch('CS-2611-P1');
      expect(batch.canStartHarvest, isTrue);
      expect(batch.canMeasure, isFalse);
      final summary = await repo.summary('CS-2611-P1');
      expect((summary.notMeasured, summary.waitingQc, summary.approved, summary.rejected), (37, 2, 2, 0));
      final decision = (await repo.decisions('CS-2611-P1')).single;
      expect((decision.size, decision.grade, decision.weightG), ('L', 'G1', 318.6));
      final crab = (await repo.waitingCrabs('CS-2611-P1', 'Holding')).single;
      expect((crab.crabCode, crab.slotCode), ('CU2611P103', '1703'));
      expect((await repo.stations()).map((s) => s.code), ['ST-NC-01']);

      expect(requests.map((r) => r.path), [
        '/api/operators/me/batches/CS-2611-P1',
        '/api/batches/CS-2611-P1/grading',
        '/api/batches/CS-2611-P1/grade-decisions',
        '/api/batches/CS-2611-P1/crab-units',
        '/api/operators/me/devices',
      ]);
      expect(requests[3].queryParameters, {'status': 'Holding'});
      expect(requests.every((r) => r.method == 'GET'), isTrue);
    });

    test('opens, follows, completes and cancels a measurement session', () async {
      final (dio, requests) = recordingDio((o) {
        if (o.path.endsWith('/measurements') || o.path.endsWith('/values') || o.path.endsWith('/process')) {
          return sessionDetailJson(status: 'Measured', decided: true, images: true);
        }
        if (o.path == '/api/measurement-sessions') return sessionJson();
        return {'status': 'Harvesting'};
      });
      final repo = ApiMeasureRepository(dio);

      await repo.startHarvest('CS-2611-P1');
      final opened = await repo.openSession(crabCode: 'CU2611P103', stationCode: 'ST-NC-01');
      expect((opened.sessionNo, opened.isWaitingStation), ('MS1', true));
      await repo.openSession(crabCode: 'CU2611P104');
      final detail = await repo.session('MS1');
      expect(detail.session.hasWhiteImage, isTrue);
      expect(detail.session.apiPath, '/api/measurement-sessions/MS1');
      expect(detail.decision!.holdReasons, ['NearThreshold']);
      expect(detail.values.first.metric, 'WeightG');
      expect(detail.readings.single.isSimulated, isTrue);
      await repo.recordValues('MS1', const ManualValues(carapaceLengthCm: 8.1));
      await repo.reprocess('MS1');
      await repo.cancelSession('MS1');

      expect(requests.map((r) => '${r.method} ${r.path}'), [
        'POST /api/batches/CS-2611-P1/start-harvest',
        'POST /api/measurement-sessions',
        'POST /api/measurement-sessions',
        'GET /api/measurement-sessions/MS1/measurements',
        'POST /api/measurement-sessions/MS1/values',
        'POST /api/measurement-sessions/MS1/process',
        'POST /api/measurement-sessions/MS1/cancel',
      ]);
      expect(requests[1].data, {'crabCode': 'CU2611P103', 'procedure': 'Station', 'stationCode': 'ST-NC-01'});
      expect(requests[2].data, {'crabCode': 'CU2611P104', 'procedure': 'Manual', 'stationCode': null});
      expect(requests[4].data, {'weightG': null, 'carapaceLengthCm': 8.1, 'carapaceWidthCm': null, 'edgeBandMm': null});
    });
  });

  test('helpers read decimals with a comma and name specifications', () {
    expect(parseDecimal('12,5'), 12.5);
    expect(parseDecimal(' 8.25 '), 8.25);
    expect(parseDecimal(''), isNull);
    expect(formatNumber(318.6, 'g'), '318,6 g');
    expect(specLabel('FAT-XL-G1'), 'Size XL · Cấp 1');
    expect(specLabel('SUBSTANDARD'), 'Dưới chuẩn');
    expect(specLabel('LE'), 'LE');
    expect(compareCodes('99', '100'), lessThan(0));
    expect(compareCodes('A2', 'A10'), greaterThan(0));
    expect(WorkBatch.fromJson(workBatchJson(status: 'Sourcing', hasHolding: false)).waitingCrabStatus, 'Received');
    final busy = DioException(
      requestOptions: RequestOptions(),
      response: Response(
        requestOptions: RequestOptions(),
        statusCode: 409,
        data: {'detail': 'Trạm đo đang có lượt đo khác mở; đo xong hoặc huỷ lượt đó trước (BR-224).'},
      ),
    );
    expect(workError(busy), 'Trạm đo đang có lượt đo khác mở; đo xong hoặc huỷ lượt đó trước.');
  });

  testWidgets('a batch still in holding only offers to start the harvest, behind a confirmation', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeMeasureRepository(batchValue: WorkBatch.fromJson(workBatchJson(status: 'InProduction')));
    await tester.pumpWidget(workApp(const MeasurePage(batchCode: 'CS-2611-P1'), measure: repo));
    await tester.pumpAndSettle();

    expect(find.text('Chọn cua cần đo'), findsNothing);
    await tester.tap(find.widgetWithText(FilledButton, 'Bắt đầu thu hoạch'));
    await tester.pumpAndSettle();
    expect(find.textContaining('không quay lại được'), findsOneWidget);
    expect(repo.calls, isEmpty);
    await tester.tap(find.widgetWithText(FilledButton, 'Bắt đầu thu hoạch').last);
    await tester.pumpAndSettle();

    expect(repo.calls, contains('start:CS-2611-P1'));
    expect(find.text('Chọn cua cần đo'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pick a crab by box number, open a session and watch it turn into a result', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeMeasureRepository(batchValue: WorkBatch.fromJson(workBatchJson()))
      ..sessionAnswers = [sessionDetailJson(), sessionDetailJson(status: 'Measured', decided: true, images: true)];
    await tester.pumpWidget(workApp(const MeasurePage(batchCode: 'CS-2611-P1'), measure: repo));
    await tester.pumpAndSettle();

    // Bốn con số nhỏ và danh sách chọn theo số hộp.
    for (final label in ['Chờ đo', 'Chờ duyệt', 'Đã duyệt', 'Loại bỏ']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('37'), findsOneWidget);
    expect(find.text('Hộp 1703'), findsOneWidget);
    expect(find.text('Trạm ST-NC-01'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Mở lượt đo')).onPressed, isNull);

    await tester.enterText(find.byType(TextField).first, '1704');
    await tester.pumpAndSettle();
    expect(find.text('Hộp 1703'), findsNothing);
    await tester.tap(find.text('Hộp 1704'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Mở lượt đo · hộp 1704'));
    await tester.pumpAndSettle();

    expect(repo.calls, contains('open:CU2611P104:ST-NC-01'));
    expect(find.text('Đặt cua lên trạm ST-NC-01'), findsOneWidget);
    expect(find.text('Huỷ lượt đo'), findsOneWidget);
    expect(find.text('Chọn cua cần đo'), findsNothing);

    // Sau vài giây thẻ lượt đo tự hỏi lại và hiện kết quả.
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(repo.sessionReads, 2);
    expect(find.text('318,6 g'), findsOneWidget);
    expect(find.text('Size L'), findsOneWidget);
    expect(find.text('Cấp 1'), findsOneWidget);
    expect(find.text('Số đo sát ngưỡng'), findsOneWidget);
    expect(find.text('Đèn trắng'), findsOneWidget);
    expect(find.text('Soi đỏ'), findsOneWidget);
    expect(find.text('Số đo chi tiết'), findsOneWidget);
    expect(find.text('Chỉ số C'), findsNothing);

    await tester.tap(find.widgetWithText(FilledButton, 'Đo con tiếp theo'));
    await tester.pumpAndSettle();
    expect(find.text('Chọn cua cần đo'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('cancelling an open session asks first and returns to the picker', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeMeasureRepository(batchValue: WorkBatch.fromJson(workBatchJson()));
    await tester.pumpWidget(workApp(const MeasurePage(batchCode: 'CS-2611-P1'), measure: repo));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hộp 1703'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Mở lượt đo · hộp 1703'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Huỷ lượt đo'));
    await tester.pumpAndSettle();
    expect(repo.calls.where((c) => c.startsWith('cancel')), isEmpty);
    await tester.tap(find.widgetWithText(FilledButton, 'Huỷ lượt đo'));
    await tester.pumpAndSettle();

    expect(repo.calls, contains('cancel:MS1'));
    expect(find.text('Chọn cua cần đo'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('leaving the page with an open session and coming back shows that session again', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeMeasureRepository(batchValue: WorkBatch.fromJson(workBatchJson()));
    await tester.pumpWidget(workApp(const MeasurePage(batchCode: 'CS-2611-P1'), measure: repo));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hộp 1703'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Mở lượt đo · hộp 1703'));
    await tester.pumpAndSettle();
    expect(find.text('Đặt cua lên trạm ST-NC-01'), findsOneWidget);

    await tester.pumpWidget(workApp(const SizedBox(), measure: repo));
    await tester.pumpAndSettle();
    expect(find.text('Đặt cua lên trạm ST-NC-01'), findsNothing);
    await tester.pumpWidget(workApp(const MeasurePage(batchCode: 'CS-2611-P1'), measure: repo));
    await tester.pumpAndSettle();

    expect(find.text('Đặt cua lên trạm ST-NC-01'), findsOneWidget);
    expect(find.text('Hộp 1703'), findsOneWidget);
    expect(find.text('Chọn cua cần đo'), findsNothing);
    expect(repo.calls.where((c) => c.startsWith('open')), hasLength(1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('without a station the farmer measures by hand and enters the values', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeMeasureRepository(batchValue: WorkBatch.fromJson(workBatchJson()), devices: [])
      ..sessionAnswers = [sessionDetailJson(procedure: 'Manual')];
    await tester.pumpWidget(workApp(const MeasurePage(batchCode: 'CS-2611-P1'), measure: repo));
    await tester.pumpAndSettle();

    expect(find.text('Đo tay bằng cân và thước kẹp'), findsOneWidget);
    await tester.tap(find.text('Hộp 1705'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Mở lượt đo tay · hộp 1705'));
    await tester.pumpAndSettle();
    expect(repo.calls, contains('open:CU2611P105:manual'));

    final save = find.widgetWithText(FilledButton, 'Ghi số đo');
    expect(tester.widget<FilledButton>(save).onPressed, isNull);
    await tester.enterText(find.widgetWithText(TextField, 'Khối lượng cân tay'), '318,6');
    await tester.enterText(find.widgetWithText(TextField, 'Chiều dài mai'), '7.98');
    await tester.pumpAndSettle();
    await tester.tap(save);
    await tester.pumpAndSettle();

    expect(repo.recorded!.weightG, 318.6);
    expect(repo.recorded!.carapaceLengthCm, 7.98);
    expect(repo.recorded!.edgeBandMm, isNull);
    expect(find.text('318,6 g'), findsOneWidget);
    expect(find.text('Sửa số đo tay'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('today\'s results are listed and a batch that is not measuring shows no picker', (tester) async {
    usePhoneScreen(tester);
    final now = DateTime.now().toUtc().toIso8601String();
    final repo = FakeMeasureRepository(batchValue: WorkBatch.fromJson(workBatchJson(status: 'Selling')))
      ..decisionList = [
        decisionJson(decisionNo: 'GD1', crabCode: 'CU2611P101', status: 'Approved', holdReasons: [], createdAt: now),
        decisionJson(decisionNo: 'GD0', crabCode: 'CU2611P100', status: 'Approved', holdReasons: [], createdAt: '2026-01-02T03:00:00Z'),
      ]
      ..sessionAnswers = [sessionDetailJson(status: 'Measured', decided: true)];
    await tester.pumpWidget(workApp(const MeasurePage(batchCode: 'CS-2611-P1'), measure: repo));
    await tester.pumpAndSettle();

    expect(find.text('Chọn cua cần đo'), findsNothing);
    expect(find.text('Hôm nay'), findsOneWidget);
    expect(find.text('CU2611P101'), findsOneWidget);
    expect(find.text('Các ngày trước (1)'), findsOneWidget);
    expect(find.text('CU2611P100'), findsNothing);

    await tester.tap(find.text('CU2611P101'));
    await tester.pumpAndSettle();
    expect(find.text('318,6 g'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Đóng'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

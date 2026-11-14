import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/features/operator/delivery/deliveries_page.dart';
import 'package:crabshare_mobile/features/operator/delivery/delivery_models.dart';
import 'package:crabshare_mobile/features/operator/delivery/delivery_repository.dart';
import 'package:crabshare_mobile/features/operator/delivery/shipment_flow.dart';
import 'package:crabshare_mobile/features/operator/delivery/shipment_page.dart';
import 'package:crabshare_mobile/features/operator/operator_work_routes.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/work_fakes.dart';

void main() {
  group('ApiDeliveryRepository', () {
    test('reads batches, tranches, a shipment and the crabs shipped with it', () async {
      final (dio, requests) = recordingDio((o) {
        if (o.path == '/api/operators/me/batches') {
          return {
            'items': [workBatchJson(code: 'CS-2611-T1', status: 'Sourcing', hasHolding: false), workBatchJson(code: 'CS-2611-01', status: 'Draft')],
            'total': 2,
          };
        }
        if (o.path.endsWith('/delivery-tranches')) return [trancheJson(allocatedM: 12, shipmentNo: 'CG1', shipmentStatus: 'Scheduled')];
        if (o.path.endsWith('/allocations')) {
          return [
            {'crabCode': 'CU1', 'orderNo': 'OD438SQFC6YG3', 'trancheSeq': 1, 'lineSpecCode': 'FAT-M-G1', 'crabSpecCode': 'FAT-M-SPECIAL', 'status': 'Shipped'},
            {'crabCode': 'CU2', 'orderNo': 'OD438SQFC6YG3', 'trancheSeq': 2, 'lineSpecCode': 'FAT-M-G1', 'crabSpecCode': null, 'status': 'Shipped'},
            {'crabCode': 'CU3', 'orderNo': 'OD438SQFC6YG3', 'trancheSeq': 1, 'lineSpecCode': 'FAT-M-G1', 'crabSpecCode': null, 'status': 'Returned'},
          ];
        }
        return shipmentJson(status: 'Dispatched', acceptance: acceptanceJson(status: 'Confirmed'));
      });
      final repo = ApiDeliveryRepository(dio);

      final batches = await repo.batches();
      expect(batches.map((b) => (b.code, b.isOpened)), [('CS-2611-T1', true), ('CS-2611-01', false)]);
      final tranche = (await repo.tranches('CS-2611-T1')).single;
      expect((tranche.batchCode, tranche.trancheId, tranche.toDispatch, tranche.needsShipment), ('CS-2611-T1', 1, true, false));
      expect((tranche.orderedCrabs, tranche.allocatedCrabs, tranche.lines.first.specCode), (30, 12, 'FAT-M-G1'));
      expect(tranche.dueDate, DateTime(2026, 10, 31));
      final shipment = await repo.shipment('CG1');
      expect((shipment.status, shipment.traceCode, shipment.balanceStatus), ('Dispatched', 'QRABC', 'Pending'));
      expect((shipment.acceptance!.acceptedCrabs, shipment.acceptance!.balanceDue, shipment.canRecordReceipt), (28, 3560000, false));
      expect(shipment.lines.first.dispatchedKg, 8.2);
      expect(await repo.shippedCrabs('CS-2611-T1', orderNo: 'OD438SQFC6YG3', trancheSeq: 1), [('CU1', 'FAT-M-SPECIAL')]);

      expect(requests.map((r) => r.path), [
        '/api/operators/me/batches',
        '/api/batches/CS-2611-T1/delivery-tranches',
        '/api/shipments/CG1',
        '/api/batches/CS-2611-T1/allocations',
      ]);
      expect(requests.first.queryParameters, {'pageSize': 100});
      expect(requests.every((r) => r.method == 'GET'), isTrue);
    });

    test('creates a shipment and sends both weighings', () async {
      final (dio, requests) = recordingDio((o) => shipmentJson());
      final repo = ApiDeliveryRepository(dio);

      await repo.createShipment(7, scheduledAt: DateTime.utc(2026, 11, 12, 8, 30), transportCondition: '  ', allowSubstitution: false);
      await repo.dispatch('CG1', const [
        DispatchLine(lineId: 1, crabs: 20, kg: 8.2),
        DispatchLine(lineId: 2, crabs: 0, kg: 0),
      ], transportCondition: 'Xe lạnh');
      await repo.recordReceipt(
        'CG1',
        const [ReceiptLine(lineId: 1, receivedCrabs: 20, receivedKg: 8, acceptedCrabs: 18, acceptedKg: 7.2)],
        rejectedCrabCodes: ['CU1', 'CU2'],
        discrepancyReason: 'Hai con yếu',
      );
      await repo.recordReceipt('CG1', const [ReceiptLine(lineId: 1, receivedCrabs: 20, receivedKg: 8, acceptedCrabs: 20, acceptedKg: 8)]);

      expect(requests.map((r) => '${r.method} ${r.path}'), [
        'POST /api/delivery-tranches/7/shipments',
        'POST /api/shipments/CG1/dispatch',
        'POST /api/shipments/CG1/receipt',
        'POST /api/shipments/CG1/receipt',
      ]);
      expect(requests[0].data, {'scheduledAt': '2026-11-12T08:30:00.000Z', 'transportCondition': null, 'allowSubstitution': false});
      expect(requests[1].data, {
        'lines': [
          {'lineId': 1, 'dispatchedCrabs': 20, 'dispatchedKg': 8.2},
          {'lineId': 2, 'dispatchedCrabs': 0, 'dispatchedKg': 0.0},
        ],
        'transportCondition': 'Xe lạnh',
      });
      expect(requests[2].data, {
        'lines': [
          {'lineId': 1, 'receivedCrabs': 20, 'receivedKg': 8.0, 'acceptedCrabs': 18, 'acceptedKg': 7.2},
        ],
        'rejectedCrabCodes': ['CU1', 'CU2'],
        'discrepancyReason': 'Hai con yếu',
      });
      expect((requests[3].data as Map)['rejectedCrabCodes'], isNull);
      expect((requests[3].data as Map)['discrepancyReason'], isNull);
    });
  });

  test('the board splits the farmer\'s work from what waits on the customer', () async {
    final repo = FakeDeliveryRepository()
      ..batchList = [
        workBatchJson(code: 'CS-2611-T1', status: 'Selling', hasHolding: false),
        workBatchJson(code: 'CS-2611-01', status: 'PendingApproval'),
      ]
      ..trancheMap = {
        'CS-2611-T1': [
          trancheJson(trancheId: 4, seq: 4, dueDate: '2099-01-01'),
          trancheJson(trancheId: 3, seq: 3, status: 'Dispatched', shipmentNo: 'CG3', shipmentStatus: 'Dispatched'),
          trancheJson(trancheId: 2, seq: 2, status: 'Dispatched', shipmentNo: 'CG2', shipmentStatus: 'Dispatched'),
          trancheJson(trancheId: 1, seq: 1, dueDate: '2026-10-01'),
          trancheJson(trancheId: 5, seq: 5, status: 'Allocated', shipmentNo: 'CG5', shipmentStatus: 'Scheduled'),
          trancheJson(trancheId: 6, seq: 6, status: 'Accepted', shipmentNo: 'CG6', shipmentStatus: 'Accepted'),
        ],
      }
      ..shipmentMap = {
        'CG2': shipmentJson(shipmentNo: 'CG2', status: 'Dispatched'),
        'CG3': shipmentJson(shipmentNo: 'CG3', status: 'Dispatched', acceptance: acceptanceJson()),
      };
    final container = ProviderContainer(overrides: [deliveryRepositoryProvider.overrideWithValue(repo)]);
    addTearDown(container.dispose);
    final sub = container.listen(deliveryBoardProvider, (_, _) {});
    addTearDown(sub.close);

    final board = await container.read(deliveryBoardProvider.future);
    final now = DateTime(2026, 11, 12);
    expect(repo.calls, ['tranches:CS-2611-T1']);
    expect(board.toDispatch.map((t) => t.shipmentNo), ['CG5']);
    expect(board.toReceive.map((t) => t.shipmentNo), ['CG2']);
    expect(board.waitingCustomer.map((t) => t.shipmentNo), ['CG3']);
    expect(board.dueNow(now).map((t) => t.trancheId), [1]);
    expect(board.dueNow(now).single.overdue(now), isTrue);
    expect(board.later(now).map((t) => t.trancheId), [4]);
    expect(board.finished.map((t) => t.shipmentNo), ['CG6']);
  });

  test('a shipment finds its tranche in the known batch, or by looking through the open batches', () async {
    final repo = FakeDeliveryRepository()
      ..batchList = [
        workBatchJson(code: 'CS-2611-P1', status: 'Selling'),
        workBatchJson(code: 'CS-2611-T1', status: 'Selling', hasHolding: false),
        workBatchJson(code: 'CS-2611-01', status: 'Draft'),
      ]
      ..trancheMap = {
        'CS-2611-T1': [
          trancheJson(trancheId: 2, seq: 2),
          trancheJson(trancheId: 1, seq: 1, allocatedM: 20, status: 'Dispatched', shipmentNo: 'CG1', shipmentStatus: 'Dispatched'),
        ],
      }
      ..shipmentMap = {'CG1': shipmentJson(status: 'Dispatched')};
    final container = ProviderContainer(overrides: [deliveryRepositoryProvider.overrideWithValue(repo)]);
    addTearDown(container.dispose);

    final known = shipmentViewProvider((shipmentNo: 'CG1', batchCode: 'CS-2611-T1'));
    final first = container.listen(known, (_, _) {});
    addTearDown(first.close);
    final view = await container.read(known.future);
    expect(repo.calls, ['tranches:CS-2611-T1']);
    expect((view.batchCode, view.tranche!.trancheId, view.allocatedOf(1), view.allocatedOf(9)), ('CS-2611-T1', 1, 20, 0));
    expect(view.shippedCrabs, hasLength(2));

    repo.calls.clear();
    final unknown = shipmentViewProvider((shipmentNo: 'CG1', batchCode: null));
    final second = container.listen(unknown, (_, _) {});
    addTearDown(second.close);
    final found = await container.read(unknown.future);
    expect(repo.calls, ['tranches:CS-2611-P1', 'tranches:CS-2611-T1']);
    expect((found.batchCode, found.tranche!.trancheId), ('CS-2611-T1', 1));
  });

  test('the status flow follows the shipment', () {
    List<FlowState> states(Map<String, dynamic> json) => [for (final s in shipmentSteps(Shipment.fromJson(json))) s.state];
    expect(states(shipmentJson()), [FlowState.now, FlowState.todo, FlowState.todo, FlowState.todo]);
    expect(states(shipmentJson(status: 'Dispatched')), [FlowState.done, FlowState.now, FlowState.todo, FlowState.todo]);
    expect(states(shipmentJson(status: 'Dispatched', acceptance: acceptanceJson())), [
      FlowState.done,
      FlowState.done,
      FlowState.now,
      FlowState.todo,
    ]);
    expect(states(shipmentJson(status: 'Accepted', acceptance: acceptanceJson(status: 'Confirmed'))), [
      FlowState.done,
      FlowState.done,
      FlowState.done,
      FlowState.now,
    ]);
    expect(states(shipmentJson(status: 'Refused'))[2], FlowState.bad);
  });

  testWidgets('the deliveries tab leads with shipments to act on, then due tranches, and creates a shipment', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeDeliveryRepository()
      ..trancheMap = {
        'CS-2611-T1': [
          trancheJson(trancheId: 1, seq: 1, dueDate: '2020-10-01', allocatedM: 12),
          trancheJson(trancheId: 2, seq: 2, status: 'Dispatched', shipmentNo: 'CG2', shipmentStatus: 'Dispatched'),
          trancheJson(trancheId: 5, seq: 5, status: 'Allocated', shipmentNo: 'CG5', shipmentStatus: 'Scheduled'),
        ],
      }
      ..shipmentMap = {'CG2': shipmentJson(shipmentNo: 'CG2', status: 'Dispatched')};
    final router = GoRouter(
      initialLocation: '/o/deliveries',
      routes: [
        GoRoute(path: '/o/deliveries', builder: (context, state) => const DeliveriesPage()),
        GoRoute(path: '/o/shipments/:no', builder: (context, state) => Text('chuyến ${state.pathParameters['no']}')),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [deliveryRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp.router(theme: buildAppTheme(), routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Cần làm ngay'), findsOneWidget);
    expect(find.text('Ghi cân lần hai'), findsOneWidget);
    expect(find.text('Xuất hàng'), findsOneWidget);
    expect(find.text('Đợt đến hạn'), findsOneWidget);
    expect(find.text('Size M · Cấp 1'), findsOneWidget);
    expect(find.text('12/20 con'), findsOneWidget);
    expect(find.text('Hạn 01/10'), findsOneWidget);
    expect(find.text('Chưa có việc giao hàng'), findsNothing);

    await tester.tap(find.widgetWithText(FilledButton, 'Lập chuyến'));
    await tester.pumpAndSettle();
    expect(find.text('Lập chuyến giao'), findsOneWidget);
    expect(find.text('Dự kiến xuất hàng'), findsOneWidget);
    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Lập chuyến').last);
    await tester.pumpAndSettle();

    expect(repo.calls, contains('create:1'));
    expect(repo.substitution, isFalse);
    expect(find.text('chuyến CG1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('an empty deliveries tab shows one empty state and a failed creation keeps the sheet open', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeDeliveryRepository();
    await tester.pumpWidget(workApp(const DeliveriesPage(), delivery: repo));
    await tester.pumpAndSettle();
    expect(find.text('Chưa có việc giao hàng'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);

    // Kéo xuống để tải lại: lần này có một đợt đến hạn nhưng máy chủ từ chối lập chuyến.
    repo
      ..trancheMap = {
        'CS-2611-T1': [trancheJson(dueDate: '2020-10-31')],
      }
      ..failCreate = true;
    await tester.drag(find.byType(ListView), const Offset(0, 1200));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Lập chuyến'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Lập chuyến').last);
    await tester.pumpAndSettle();

    expect(find.text('Chưa có con cua nào đã duyệt hạng được phân bổ cho đợt này.'), findsOneWidget);
    expect(find.text('Lập chuyến giao'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a scheduled shipment asks for the first weighing, then for the second one', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeDeliveryRepository()
      ..trancheMap = {
        'CS-2611-T1': [trancheJson(allocatedM: 20, allocatedXl: 10, status: 'Allocated', shipmentNo: 'CG1', shipmentStatus: 'Scheduled')],
      }
      ..shipmentMap = {'CG1': shipmentJson()};
    await tester.pumpWidget(workApp(const ShipmentPage(shipmentNo: 'CG1'), delivery: repo));
    await tester.pumpAndSettle();

    for (final step in ['Giao tới khách', 'Khách xác nhận', 'Thu tiền']) {
      expect(find.text(step), findsOneWidget);
    }
    expect(find.text('Võ Khách Hàng'), findsOneWidget);
    expect(find.text('Đợt 1 · Lô CS-2611-T1'), findsOneWidget);
    expect(find.text('Cân lần một'), findsOneWidget);
    expect(find.text('20 con'), findsOneWidget);
    expect(find.text('Mở trang truy xuất'), findsOneWidget);
    final send = find.widgetWithText(FilledButton, 'Xuất hàng');
    expect(tester.widget<FilledButton>(send).onPressed, isNull);

    await tester.enterText(find.widgetWithText(TextField, 'Cân').at(0), '8,2');
    await tester.enterText(find.widgetWithText(TextField, 'Cân').at(1), '4.3');
    await tester.pumpAndSettle();
    await tester.tap(send);
    await tester.pumpAndSettle();
    expect(find.textContaining('30 con · 12,5 kg'), findsOneWidget);
    expect(repo.dispatched, isNull);
    await tester.tap(find.widgetWithText(FilledButton, 'Xuất hàng').last);
    await tester.pumpAndSettle();

    expect(repo.dispatched!.map((l) => (l.lineId, l.crabs, l.kg)), [(1, 20, 8.2), (2, 10, 4.3)]);
    expect(find.text('Cân lần hai'), findsOneWidget);
    expect(find.text('Cân lần một'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('second weighing: full acceptance needs only the weights; a partial one needs a reason', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeDeliveryRepository()
      ..trancheMap = {
        'CS-2611-T1': [trancheJson(status: 'Dispatched', shipmentNo: 'CG1', shipmentStatus: 'Dispatched')],
      }
      ..shipmentMap = {'CG1': shipmentJson(status: 'Dispatched')};
    await tester.pumpWidget(workApp(const ShipmentPage(shipmentNo: 'CG1'), delivery: repo));
    await tester.pumpAndSettle();

    final record = find.widgetWithText(FilledButton, 'Lập biên bản nghiệm thu');
    expect(find.text('Lý do chênh lệch'), findsNothing);
    expect(tester.widget<FilledButton>(record).onPressed, isNull);
    await tester.enterText(find.widgetWithText(TextField, 'Cân').at(0), '8');
    await tester.enterText(find.widgetWithText(TextField, 'Cân').at(1), '4,2');
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(record).onPressed, isNotNull);

    // Khách từ chối hai con của dòng đầu: phải có kg chấp nhận và lý do.
    await tester.tap(find.text('Thiếu hoặc khách từ chối một phần'));
    await tester.pumpAndSettle();
    expect(find.text('Mã cua khách từ chối'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Con chấp nhận').at(0), '18');
    await tester.enterText(find.widgetWithText(TextField, 'Kg chấp nhận').at(0), '7,2');
    await tester.enterText(find.widgetWithText(TextField, 'Kg chấp nhận').at(1), '4,2');
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(record).onPressed, isNull);
    await tester.tap(find.widgetWithText(FilterChip, 'CU1'));
    await tester.enterText(find.widgetWithText(TextField, 'Lý do chênh lệch'), 'Hai con yếu');
    await tester.pumpAndSettle();
    await tester.tap(record);
    await tester.pumpAndSettle();
    expect(find.textContaining('Khách chấp nhận 28 con · 11,4 kg · từ chối 1 con'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Lập biên bản'));
    await tester.pumpAndSettle();

    expect(repo.received!.map((l) => (l.lineId, l.receivedCrabs, l.receivedKg, l.acceptedCrabs, l.acceptedKg)), [
      (1, 20, 8.0, 18, 7.2),
      (2, 10, 4.2, 10, 4.2),
    ]);
    expect(repo.rejected, ['CU1']);
    expect(repo.reason, 'Hai con yếu');
    // Sau khi lập biên bản: trạng thái chờ khách, form ghi lại nằm trong phần gấp.
    expect(find.text('Chờ khách xác nhận'), findsOneWidget);
    expect(find.text('Ghi lại cân lần hai'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Lập biên bản nghiệm thu'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('after the customer confirms, the page shows the recorded money and no form', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeDeliveryRepository()
      ..trancheMap = {
        'CS-2611-T1': [trancheJson(status: 'Accepted', shipmentNo: 'CG1', shipmentStatus: 'Accepted')],
      }
      ..shipmentMap = {'CG1': shipmentJson(status: 'Accepted', acceptance: acceptanceJson(status: 'Confirmed'))};
    await tester.pumpWidget(workApp(const ShipmentPage(shipmentNo: 'CG1'), delivery: repo));
    await tester.pumpAndSettle();

    expect(find.text('Khách đã xác nhận'), findsOneWidget);
    expect(find.text('28 con · 11,4 kg'), findsOneWidget);
    expect(find.text('4.560.000 đ'), findsOneWidget);
    expect(find.text('3.560.000 đ'), findsOneWidget);
    expect(find.text('Chờ chuyển khoản'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
    expect(find.text('Hàng trong chuyến'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('work routes serve the measuring and shipment paths', () {
    final paths = [for (final r in operatorWorkRoutes()) (r as GoRoute).path];
    expect(paths, ['/o/measure/:batch', '/o/shipments/:no']);
    expect(Routes.operatorMeasure('CS-2611-P1'), '/o/measure/CS-2611-P1');
    expect(ShipmentPage.location('CG1'), Routes.operatorShipment('CG1'));
    expect(ShipmentPage.location('CG1', batchCode: 'CS-2611-T1'), '/o/shipments/CG1?batch=CS-2611-T1');
  });

  testWidgets('the shipment route reads the batch from the link and opens the page', (tester) async {
    usePhoneScreen(tester);
    final repo = FakeDeliveryRepository()
      ..batchList = []
      ..trancheMap = {
        'CS-2611-T1': [trancheJson(status: 'Accepted', shipmentNo: 'CG1', shipmentStatus: 'Accepted')],
      }
      ..shipmentMap = {'CG1': shipmentJson(status: 'Accepted', acceptance: acceptanceJson(status: 'Confirmed'))};
    final router = GoRouter(
      initialLocation: ShipmentPage.location('CG1', batchCode: 'CS-2611-T1'),
      routes: operatorWorkRoutes(),
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [deliveryRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp.router(theme: buildAppTheme(), routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Chuyến giao'), findsOneWidget);
    expect(find.text('Đợt 1 · Lô CS-2611-T1'), findsOneWidget);
    expect(repo.calls, ['tranches:CS-2611-T1']);
    expect(tester.takeException(), isNull);
  });
}

import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/features/operator/data/holding_models.dart';
import 'package:crabshare_mobile/features/operator/data/holding_repository.dart';
import 'package:crabshare_mobile/features/operator/data/operator_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/operator_core_fixtures.dart';

void main() {
  test('đọc hộp, cua, đợt lưu nuôi của Lô và hộp trống của trại', () async {
    final server = FarmServer();
    final repo = ApiHoldingRepository(server.dio());

    final boxes = await repo.boxes('CS-P1');
    expect(boxes.map((b) => b.slotCode), ['1701', '1702', '1703', '1704']);
    expect(boxes.first.crabCode, 'CU01');
    expect(boxes.first.place, 'Dàn 2 · tầng 1 · cột 1');
    expect(boxes[1].crabCondition, 'Molting');
    expect(boxes[2].hasCrab, isFalse);

    final crabs = await repo.crabs('CS-P1');
    expect(crabs.map((c) => c.inventoryStatus), ['Holding', 'Holding', 'Dead', 'Received']);
    expect(crabs[2].lastSlotCode, '1703');
    expect(crabs.first.events.map((e) => e.type), ['Received', 'Boxed']);
    expect(crabs.first.receivedWeightG, 294);

    final holding = await repo.holding('CS-P1');
    expect((holding!.boxed, holding.dead, holding.restocked, holding.maxRestock), (2, 1, 0, 4));

    expect((await repo.crab('CU01')).currentSlotCode, '1701');

    final free = await repo.freeBoxes(search: '008');
    expect(free.single.slotCode, '0080');
    expect(free.single.slotStatus, 'Available');

    expect(server.calls, [
      'GET /api/batches/CS-P1/boxes',
      'GET /api/batches/CS-P1/crab-units',
      'GET /api/batches/CS-P1/holding',
      'GET /api/crab-units/CU01',
      'GET /api/boxes',
    ]);
    expect(server.requests.last.queryParameters, {'status': 'Available', 'search': '008', 'page': 1, 'pageSize': 60});
  });

  test('Lô chưa thả con nào thì không có đợt lưu nuôi; lỗi khác vẫn báo ra', () async {
    final server = FarmServer()..holding = null;
    final repo = ApiHoldingRepository(server.dio());
    expect(await repo.holding('CS-P1'), isNull);
    server.failures['GET /api/batches/CS-P1/holding'] = (403, 'Không có quyền.');
    await expectLater(repo.holding('CS-P1'), throwsA(isA<DioException>()));
  });

  test('xếp hộp, ghi sự kiện và chuyển hộp gửi đúng đường dẫn và nội dung', () async {
    final server = FarmServer();
    final repo = ApiHoldingRepository(server.dio());

    final boxed = await repo.assign(batchCode: 'CS-P1', crabCode: 'CU04', slotCode: '1703', evidenceId: 501, replacesCrabCode: 'CU03');
    expect(boxed.inventoryStatus, 'Holding');
    expect(server.requests.last.path, '/api/batches/CS-P1/box-assignments');
    expect(server.requests.last.data, {'crabCode': 'CU04', 'slotCode': '1703', 'evidenceId': 501, 'replacesCrabCode': 'CU03'});

    await repo.recordEvent('CU01', eventType: 'Molted', note: '  ');
    expect(server.requests.last.path, '/api/crab-units/CU01/events');
    expect(server.requests.last.data, {'eventType': 'Molted', 'evidenceId': null, 'note': null});

    final dead = await repo.recordEvent('CU02', eventType: 'Died', evidenceId: 502, note: 'Chết sau khi lột');
    expect(dead.isDead, isTrue);
    expect(server.requests.last.data, {'eventType': 'Died', 'evidenceId': 502, 'note': 'Chết sau khi lột'});

    await repo.move('CU01', slotCode: '1704', reason: 'Hộp rò nước');
    expect(server.requests.last.path, '/api/crab-units/CU01/move');
    expect(server.requests.last.data, {'slotCode': '1704', 'reason': 'Hộp rò nước'});
  });

  test('hộp cần thả bù là hộp cuối của con đã chết mà chưa có con nào thay', () {
    final crabs = [
      CrabUnit.fromJson(crabJson('CU01', slot: '1701')),
      CrabUnit.fromJson(crabJson('CU03', status: 'Dead', lastSlot: '1703')),
      CrabUnit.fromJson(crabJson('CU05', status: 'Dead', lastSlot: '1705')),
      CrabUnit.fromJson(crabJson('CU06', slot: '1705', replaces: 'CU05')),
      CrabUnit.fromJson(crabJson('CU07', status: 'Dead')),
    ];
    expect(restockSlots(crabs), {'1703': 'CU03'});
  });

  ProviderContainer container(FarmServer server) {
    final c = ProviderContainer(retry: (count, error) => null, overrides: [dioProvider.overrideWithValue(server.dio())]);
    addTearDown(c.dispose);
    return c;
  }

  test('thả bù gửi ảnh hộp trống trước rồi mới xếp hộp, và tải lại sơ đồ hộp', () async {
    final server = FarmServer();
    final c = container(server);
    final sub = c.listen(batchBoxesProvider('CS-P1'), (_, _) {});
    expect((await c.read(batchBoxesProvider('CS-P1').future))[2].hasCrab, isFalse);

    await c.read(boxActionsProvider).assign(batchCode: 'CS-P1', crabCode: 'CU04', slotCode: '1703', photo: testPhoto(), replacesCrabCode: 'CU03');

    final upload = server.sent('POST', '/api/evidence').single.data as FormData;
    final fields = {for (final f in upload.fields) f.key: f.value};
    expect(fields['BatchCode'], 'CS-P1');
    expect(fields['SlotCode'], '1703');
    expect(fields['SlotEventType'], 'Boxed');
    expect(server.sent('POST', '/api/batches/CS-P1/box-assignments').single.data, {
      'crabCode': 'CU04',
      'slotCode': '1703',
      'evidenceId': 500,
      'replacesCrabCode': 'CU03',
    });
    expect((await c.read(batchBoxesProvider('CS-P1').future))[2].crabCode, 'CU04');
    sub.close();
  });

  test('bước ghi lỗi rồi bấm lại với cùng ảnh thì không gửi ảnh lần hai', () async {
    final server = FarmServer()..failures['POST /api/crab-units/CU01/events'] = (422, 'Con cua đã ra khỏi tồn.');
    final actions = container(server).read(boxActionsProvider);
    final photo = testPhoto();

    await expectLater(
      actions.reportDead(batchCode: 'CS-P1', crabCode: 'CU01', slotCode: '1701', photo: photo, note: 'Chết'),
      throwsA(isA<DioException>()),
    );
    server.failures.clear();
    await actions.reportDead(batchCode: 'CS-P1', crabCode: 'CU01', slotCode: '1701', photo: photo, note: 'Chết');

    final uploads = server.sent('POST', '/api/evidence').toList();
    expect(uploads, hasLength(1));
    // Ảnh hộp đang có cua: không gửi kèm loại sự kiện.
    expect((uploads.single.data as FormData).fields.map((f) => f.key), isNot(contains('SlotEventType')));
    expect(server.sent('POST', '/api/crab-units/CU01/events').last.data, {'eventType': 'Died', 'evidenceId': 500, 'note': 'Chết'});

    // Ảnh khác thì gửi lại.
    await actions.reportDead(batchCode: 'CS-P1', crabCode: 'CU02', slotCode: '1702', photo: testPhoto());
    expect(server.sent('POST', '/api/evidence'), hasLength(2));
  });

  test('danh sách Lô và tổng quan của hộ nuôi', () async {
    final server = FarmServer()
      ..batches = [
        farmBatchJson(),
        farmBatchJson(code: 'CS-T1', status: 'Selling', hasHolding: false),
        farmBatchJson(code: 'CS-F1', status: 'Funding'),
      ]
      ..careBatches = [careBatchJson(), careBatchJson(code: 'CS-H1', status: 'Harvesting')];
    final repo = ApiOperatorRepository(server.dio());

    final batches = await repo.batches();
    expect(batches.map((b) => (b.code, b.onFarm, b.canBox)), [('CS-P1', true, true), ('CS-T1', true, false), ('CS-F1', false, false)]);
    expect(server.requests.last.queryParameters, {'page': 1, 'pageSize': 100});
    expect((await repo.batch('CS-T1')).hasHolding, isFalse);
    expect(server.requests.last.path, '/api/operators/me/batches/CS-T1');

    final dashboard = await repo.dashboard();
    expect(dashboard.farmName, 'HTX Nuôi cua Năm Căn');
    // Chỉ Lô đang lưu nuôi mới bị nhắc ghi nhật ký; Lô đang thu hoạch thì không.
    expect(dashboard.logsDue.map((b) => b.code), ['CS-P1']);
  });
}

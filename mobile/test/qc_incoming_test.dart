import 'package:crabshare_mobile/features/qc/data/incoming_repository.dart';
import 'package:crabshare_mobile/features/qc/data/qc_repository.dart';
import 'package:crabshare_mobile/features/qc/incoming/crab_form.dart';
import 'package:crabshare_mobile/features/qc/incoming/receipt_page.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/qc_fakes.dart';

const _page = IncomingReceiptPage(receiptNo: 'GR0000000001', batchCode: 'CS-2611-P1');

List<Override> _overrides(FakeIncomingRepository repo, {String crabType = 'RoeCrab'}) => [
  qcTaskRepositoryProvider.overrideWithValue(FakeTaskRepository(const [], crabType: crabType)),
  incomingRepositoryProvider.overrideWithValue(repo),
];

void main() {
  test('repository: receipt endpoints, the inspection body and the parsed result', () async {
    final adapter = QcAdapter((o) {
      if (o.path.endsWith('/inspections')) {
        return {'inspectionNo': 'QC1', 'conclusion': 'Accepted', 'rejectReason': null, 'crabCode': 'CU00000009', 'weightG': 412.5};
      }
      if (o.path.endsWith('/goods-receipts')) return [receiptJson()];
      if (o.path.endsWith('/crab-units')) return [crabJson()];
      return receiptJson(status: o.path.endsWith('/complete') ? 'Completed' : 'Inspecting');
    });
    final repo = ApiIncomingRepository(qcDio(adapter));

    expect((await repo.receiptsOfBatch('CS-2611-P1')).single.receiptNo, 'GR0000000001');
    final receipt = await repo.receipt('GR0000000001');
    expect((receipt.inspected, receipt.left, receipt.qcUserId, receipt.isOpen), (1, 2, qcUserId, true));
    expect(receipt.harvestedOn, DateTime(2026, 11, 10));

    final result = await repo.inspect(
      'GR0000000001',
      const InspectionInput(
        species: 'Scylla paramamosain',
        sex: 'Female',
        maturity: 'Mature',
        speciesOk: true,
        alive: true,
        healthy: false,
        twoClaws: true,
        foodSafe: true,
        weightG: 412.5,
      ),
    );
    expect((result.accepted, result.crabCode, result.weightG), (true, 'CU00000009', 412.5));
    expect((await repo.complete('GR0000000001')).isOpen, isFalse);
    expect((await repo.crabsOfBatch('CS-2611-P1')).single.crabCode, 'CU00000001');

    expect(adapter.requests.map((r) => '${r.method} ${r.path}'), [
      'GET /api/batches/CS-2611-P1/goods-receipts',
      'GET /api/goods-receipts/GR0000000001',
      'POST /api/goods-receipts/GR0000000001/inspections',
      'POST /api/goods-receipts/GR0000000001/complete',
      'GET /api/batches/CS-2611-P1/crab-units',
    ]);
    expect(adapter.requests[2].data, {
      'species': 'Scylla paramamosain',
      'sex': 'Female',
      'maturity': 'Mature',
      'speciesOk': true,
      'alive': true,
      'healthy': false,
      'twoClaws': true,
      'foodSafe': true,
      'weightG': 412.5,
      'note': null,
    });
  });

  test('sex and maturity default from the crab type of the batch', () {
    expect(expectedFor('RoeCrab'), (sex: 'Female', maturity: 'Mature', strict: true));
    expect(expectedFor('YoungFemaleCrab'), (sex: 'Female', maturity: 'Immature', strict: true));
    expect(expectedFor('FatteningMudCrab'), (sex: 'Male', maturity: 'Mature', strict: false));
  });

  testWidgets('fast form: weight then Ghi saves with the batch defaults and clears for the next crab', (tester) async {
    final repo = FakeIncomingRepository(GoodsReceipt.fromJson(receiptJson()));
    await pumpQc(tester, _page, _overrides(repo));

    expect(find.text('Đã kiểm 1 / 3 con'), findsOneWidget);
    expect(find.text('Con thứ 2'), findsOneWidget);
    // Chưa nhập khối lượng thì chưa ghi được.
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Ghi · đạt')).onPressed, isNull);

    await tester.enterText(find.widgetWithText(TextField, 'Khối lượng'), '412,5');
    await tester.pump();
    await tester.tap(find.text('Ghi · đạt'));
    await tester.pumpAndSettle();

    final sent = repo.inspected.single;
    expect((sent.weightG, sent.sex, sent.maturity, sent.species), (412.5, 'Female', 'Mature', 'Scylla paramamosain'));
    expect([sent.speciesOk, sent.alive, sent.healthy, sent.twoClaws, sent.foodSafe], everyElement(isTrue));
    expect(find.text('Đã kiểm 2 / 3 con'), findsOneWidget);
    expect(find.text('Con thứ 3'), findsOneWidget);
    expect(find.text('Đạt · 412,5 g · CU00000001'), findsOneWidget);
    expect(tester.widget<TextField>(find.widgetWithText(TextField, 'Khối lượng')).controller!.text, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a failed condition asks first, then records the rejected crab; the picked sex sticks', (tester) async {
    final repo = FakeIncomingRepository(GoodsReceipt.fromJson(receiptJson(declared: 5)));
    await pumpQc(tester, _page, _overrides(repo, crabType: 'FatteningMudCrab'));

    await tester.tap(find.text('Cái'));
    await tester.enterText(find.widgetWithText(TextField, 'Khối lượng'), '380');
    await tester.tap(find.text('Khoẻ'));
    await tester.pump();
    expect(find.text('Yếu'), findsOneWidget);
    await tester.tap(find.text('Ghi · loại'));
    await tester.pumpAndSettle();

    expect(find.text('Loại con cua này?'), findsOneWidget);
    expect(find.text('Không đạt: yếu. Ghi rồi không sửa được.'), findsOneWidget);
    expect(repo.inspected, isEmpty);
    await tester.tap(find.text('Ghi: loại'));
    await tester.pumpAndSettle();

    expect((repo.inspected.single.healthy, repo.inspected.single.sex), (false, 'Female'));
    expect(find.textContaining('Loại 1', findRichText: true), findsOneWidget);
    expect(find.text('Loại · 380 g · Không đạt: yếu'), findsOneWidget);
    // Các ô điều kiện trở về "đạt", giới tính giữ nguyên cho con sau.
    expect(find.text('Khoẻ'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Khối lượng'), '400');
    await tester.pump();
    await tester.tap(find.text('Ghi · đạt'));
    await tester.pumpAndSettle();
    expect(repo.inspected.last.sex, 'Female');
  });

  testWidgets('a server refusal stays on the form', (tester) async {
    final repo = FakeIncomingRepository(GoodsReceipt.fromJson(receiptJson()))..failInspect = apiError('Bạn không được phân công kiểm việc này (BR-017).', 403);
    await pumpQc(tester, _page, _overrides(repo));
    await tester.enterText(find.widgetWithText(TextField, 'Khối lượng'), '400');
    await tester.pump();
    await tester.tap(find.text('Ghi · đạt'));
    await tester.pumpAndSettle();
    expect(find.text('Bạn không được phân công kiểm việc này.'), findsOneWidget);
    expect(find.text('Đã kiểm 1 / 3 con'), findsOneWidget);
  });

  testWidgets('complete goes through the confirm sheet', (tester) async {
    final repo = FakeIncomingRepository(GoodsReceipt.fromJson(receiptJson(accepted: 2, rejected: 1)));
    await pumpQc(tester, _page, _overrides(repo));

    // Đã kiểm đủ: không còn ô nhập, nút chính là hoàn tất.
    expect(find.text('Khối lượng'), findsNothing);
    await tester.tap(find.text('Hoàn tất phiếu'));
    await tester.pumpAndSettle();
    expect(find.text('Đạt 2 · Loại 1 · Chưa kiểm 0.'), findsOneWidget);
    expect(repo.completed, 0);
    await tester.tap(find.text('Hoàn tất'));
    await tester.pumpAndSettle();

    expect(repo.completed, 1);
    expect(find.text('Đã kiểm xong'), findsOneWidget);
    expect(find.text('Hoàn tất phiếu'), findsNothing);
    expect(find.text('Cua đã đạt · 2'), findsOneWidget);
  });

  testWidgets('small phone: the form and its optional fields lay out without overflow', (tester) async {
    final repo = FakeIncomingRepository(GoodsReceipt.fromJson(receiptJson(declared: 400, accepted: 120, rejected: 13)));
    await pumpQc(tester, _page, _overrides(repo), size: smallPhone);
    await tester.tap(find.text('An toàn thực phẩm'));
    await tester.pump();
    expect(find.text('Mất an toàn thực phẩm'), findsOneWidget);
    for (final label in ['Tuỳ chọn thêm', 'Cua đã đạt · 120', 'Lô nguồn']) {
      await tester.ensureVisible(find.text(label));
      await tester.pumpAndSettle();
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
    }
    expect(find.text('Độ trưởng thành'), findsOneWidget);
    expect(find.text('CU00000001'), findsOneWidget);
    expect(find.text('Năm Căn, Cà Mau'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a receipt assigned to someone else has no form', (tester) async {
    final repo = FakeIncomingRepository(GoodsReceipt.fromJson(receiptJson(qcUser: 99)));
    await pumpQc(tester, _page, _overrides(repo));
    expect(find.text('Phiếu này phân cho người kiểm khác.'), findsOneWidget);
    expect(find.byType(CrabForm), findsNothing);
    expect(find.text('Hoàn tất phiếu'), findsNothing);
  });
}

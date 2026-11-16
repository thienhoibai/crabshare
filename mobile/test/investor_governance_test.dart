import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/features/investor/contracts/contracts_page.dart';
import 'package:crabshare_mobile/features/investor/data/contract_repository.dart';
import 'package:crabshare_mobile/features/investor/data/decision_repository.dart';
import 'package:crabshare_mobile/features/investor/data/device_repository.dart';
import 'package:crabshare_mobile/features/investor/data/settlement_repository.dart';
import 'package:crabshare_mobile/features/investor/home/investor_todos.dart';
import 'package:crabshare_mobile/features/investor/investor_routes.dart';
import 'package:crabshare_mobile/features/investor/settlement/settlement_statement_page.dart';
import 'package:crabshare_mobile/features/investor/settlement/settlements_page.dart';
import 'package:crabshare_mobile/features/investor/votes/decision_card.dart';
import 'package:crabshare_mobile/features/investor/votes/votes_page.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/investor_fixtures.dart';

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));

  test('decision repository lists a batch and posts a weighted vote', () async {
    final requests = <String>[];
    final repo = ApiDecisionRepository(discoveryDio((request) {
      requests.add('${request.method} ${request.path}');
      if (request.method == 'POST') {
        expect(request.data, {'choice': 'No'});
        return jsonResponse(decisionJson(canVote: false, myChoice: 'No'));
      }
      return jsonResponse([decisionJson(), decisionJson(no: 'QD0002', status: 'Passed', canVote: false, yes: 10200000)]);
    }));
    final list = await repo.list('CS-P1');
    expect(list.first.isOpen, isTrue);
    expect(list.first.canVote, isTrue);
    expect(list.first.closesAt, DateTime.utc(2099, 11, 13, 2));
    expect(list.last.yesCapital, 10200000);
    expect(list.last.yesPct, 60);
    expect(list.last.decidedAt, isNotNull);
    final voted = await repo.vote('QD0001', 'No');
    expect(voted.myChoice, 'No');
    expect(requests, ['GET /api/batches/CS-P1/decisions', 'POST /api/decisions/QD0001/votes']);
  });

  test('settlement repository reads the six conditions, my statements and one statement', () async {
    final paths = <String>[];
    final repo = ApiSettlementRepository(discoveryDio((request) {
      paths.add(request.path);
      return jsonResponse(switch (request.path) {
        '/api/batches/CS-P1/settlement-readiness' => readinessJson(),
        '/api/me/settlements' => [settlementSummaryJson()],
        _ => settlementJson(),
      });
    }));
    final readiness = await repo.readiness('CS-P1');
    expect(readiness.ready, isFalse);
    expect(readiness.conditions, hasLength(6));
    expect(readiness.missing, 1);
    expect(readiness.conditions.first.pending, 40);
    final mine = await repo.mine();
    expect(mine.single.id, 7);
    expect(mine.single.myNetPayout, 11400000);
    expect(mine.single.feedbackOpen, isTrue);
    final statement = await repo.statement(7);
    expect(statement.mine!.netPayout, 11400000);
    expect(statement.mine!.taxWithheld, 72000);
    expect(statement.platformFee, 1500000);
    expect(statement.platformFeeRatePct, 5);
    expect(statement.distributable, 9200000);
    expect(statement.disbursedTotal, 15000000);
    expect(statement.feedbackOpen(), isTrue);
    expect(statement.feedbackOpen(DateTime.utc(2100)), isFalse);
    expect(paths, ['/api/batches/CS-P1/settlement-readiness', '/api/me/settlements', '/api/settlements/7']);
  });

  test('contract repository knows when it is my turn to sign', () async {
    final repo = ApiContractRepository(discoveryDio((request) {
      expect(request.path, '/api/me/contracts');
      return jsonResponse([
        contractJson(),
        contractJson(id: 16, nextSigner: 'Operator', status: 'Draft'),
        contractJson(id: 17, nextSigner: 'Investor', status: 'Void'),
      ]);
    }));
    final contracts = await repo.mine();
    expect(contracts.map((c) => c.waitsForMe), [true, false, false]);
    expect(contracts.first.amount, 5000000);
    expect(contracts.first.contractNo, 'HD-15');
  });

  test('device repository keeps the newest image of each box', () async {
    final repo = ApiDeviceRepository(discoveryDio((request) {
      expect(request.path, '/api/batches/CS-P1/device-images');
      return jsonResponse([deviceImageJson(9, '1702'), deviceImageJson(8, '1701'), deviceImageJson(7, '1702')]);
    }));
    final images = await repo.latestBoxImages('CS-P1');
    expect(images.map((i) => (i.slotCode, i.id)), [('1701', 8), ('1702', 9)]);
    expect(images.first.filePath, '/api/device-images/8/file');
  });

  test('to-do list skips a source that fails and never asks about batches that are not frozen', () async {
    final api = FakeApi()
      ..get('/api/investor/portfolio', portfolioPage([portfolioItem(), portfolioItem(code: 'CS-F1', frozen: false)]))
      ..get('/api/batches/CS-P1/decisions', [decisionJson()])
      ..get('/api/me/kyc', {'verificationStatus': 'Verified', 'verifiedAt': null, 'lastCheck': null})
      ..get('/api/me/contracts', [contractJson(nextSigner: 'Operator')])
      ..get('/api/me/settlements', [settlementSummaryJson(feedbackOpen: false)]);
    final container = ProviderContainer(overrides: [
      sessionProvider.overrideWith(TestSession.new),
      dioProvider.overrideWithValue(api.dio),
    ]);
    addTearDown(container.dispose);
    final todos = await container.read(investorTodosProvider.future);
    expect(todos.map((t) => t.kind), [TodoKind.vote]);
    expect(todos.single.batchCode, 'CS-P1');
    expect(api.paths('GET'), isNot(contains('/api/batches/CS-F1/decisions')));
  });

  testWidgets('statement shows my four numbers, the batch table, and sends feedback to the web', (tester) async {
    final api = FakeApi()..get('/api/settlements/7', settlementJson());
    final opened = await pumpInvestor(tester, api, home: const SettlementStatementPage(id: 7));

    expect(find.text('Quyết toán Lô CS-P1'), findsOneWidget);
    expect(find.text('Đang lấy góp ý'), findsOneWidget);
    expect(find.text('Vốn hoàn'), findsOneWidget);
    expect(find.text('10.200.000 đ'), findsOneWidget);
    expect(find.text('1.272.000 đ'), findsOneWidget);
    expect(find.text('11.400.000 đ'), findsOneWidget);
    expect(find.text('Chưa chi'), findsOneWidget);
    expect(find.text('Phí nền tảng (5%)'), findsOneWidget);
    expect(find.text('-1.500.000 đ'), findsOneWidget);
    expect(find.text('Thù lao người nuôi (20%)'), findsOneWidget);
    expect(find.text('9.200.000 đ'), findsOneWidget);
    expectNoProjection();

    await tester.scrollUntilVisible(find.text('Gửi góp ý trên web'), 200);
    await tester.tap(find.text('Gửi góp ý trên web'));
    await settle(tester);
    expect(opened.single.toString(), 'http://localhost:5173/nha-dau-tu/quyet-toan/7');
    expect(tester.takeException(), isNull);
  });

  testWidgets('an approved statement has no feedback button and shows the payout status', (tester) async {
    final statement = settlementJson(status: 'PaidOut');
    ((statement['lines'] as List).single as Map<String, dynamic>)['payoutStatus'] = 'Succeeded';
    final api = FakeApi()..get('/api/settlements/7', statement);
    await pumpInvestor(tester, api, home: const SettlementStatementPage(id: 7));
    expect(find.text('Đã chi trả'), findsOneWidget);
    expect(find.text('Thành công'), findsOneWidget);
    expect(find.text('Gửi góp ý trên web'), findsNothing);
  });

  testWidgets('statement list opens a statement; an empty list says so once', (tester) async {
    final api = FakeApi()
      ..get('/api/me/settlements', [settlementSummaryJson()])
      ..get('/api/settlements/7', settlementJson());
    await pumpInvestor(tester, api, location: InvestorRoutes.settlements);
    expect(find.text('Cua thịt hộp CS-P1'), findsOneWidget);
    expect(find.text('Tôi thực nhận'), findsOneWidget);
    await tester.tap(find.text('Cua thịt hộp CS-P1'));
    await settle(tester);
    expect(find.byType(SettlementStatementPage), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await pumpInvestor(tester, FakeApi()..get('/api/me/settlements', []), home: const SettlementsPage());
    expect(find.text('Chưa có bảng quyết toán nào được công bố'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('contracts list leads with signing on the web when it is my turn', (tester) async {
    final api = FakeApi()..get('/api/me/contracts', [contractJson(), contractJson(id: 11, nextSigner: null, status: 'FullySigned')]);
    final opened = await pumpInvestor(tester, api, home: const ContractsPage());
    expect(find.text('HD-15'), findsOneWidget);
    expect(find.text('Tới lượt bạn ký'), findsOneWidget);
    expect(find.text('Đủ chữ ký'), findsOneWidget);
    await tester.tap(find.text('Ký hợp đồng trên web'));
    await settle(tester);
    expect(opened.single.toString(), 'http://localhost:5173/nha-dau-tu/hop-dong');

    await tester.pumpWidget(const SizedBox());
    final signed = FakeApi()..get('/api/me/contracts', [contractJson(id: 11, nextSigner: null, status: 'FullySigned')]);
    await pumpInvestor(tester, signed, home: const ContractsPage());
    expect(find.byType(FilledButton), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('votes page puts open votes first, folds finished ones and reloads after my vote', (tester) async {
    var voted = false;
    final api = FakeApi()
      ..get('/api/investor/portfolio', portfolioPage([portfolioItem(), portfolioItem(code: 'CS-F1', frozen: false)]))
      ..routes['GET /api/batches/CS-P1/decisions'] = ((_) => [
        decisionJson(no: 'QD0000', status: 'Rejected', canVote: false),
        voted ? decisionJson(canVote: false, myChoice: 'No') : decisionJson(),
      ])
      ..routes['POST /api/decisions/QD0001/votes'] = ((request) {
        expect(request.data, {'choice': 'No'});
        voted = true;
        return decisionJson(canVote: false, myChoice: 'No');
      });
    await pumpInvestor(tester, api, home: const VotesPage());

    expect(find.byType(DecisionCard), findsOneWidget);
    expect(find.text('Thanh lý sớm · Lô CS-P1'), findsOneWidget);
    expect(find.text('Đã kết thúc (1)'), findsOneWidget);
    expect(api.paths('GET'), isNot(contains('/api/batches/CS-F1/decisions')));

    await tester.tap(find.widgetWithText(OutlinedButton, 'Không đồng ý'));
    await settle(tester);
    expect(find.textContaining('Nếu thông qua: Lô thanh lý sớm'), findsOneWidget);
    await tester.tap(find.text('Gửi phiếu không đồng ý'));
    await settle(tester);
    expect(api.paths('POST'), ['/api/decisions/QD0001/votes']);
    expect(find.textContaining('Bạn đã chọn: Không đồng ý'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Không đồng ý'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

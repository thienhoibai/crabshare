import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/contracts/contracts_page.dart';
import 'package:crabshare_mobile/features/investor/data/portfolio_repository.dart';
import 'package:crabshare_mobile/features/investor/home/investor_home_page.dart';
import 'package:crabshare_mobile/features/investor/investor_routes.dart';
import 'package:crabshare_mobile/features/investor/portfolio/portfolio_detail_page.dart';
import 'package:crabshare_mobile/features/investor/settlement/settlement_statement_page.dart';
import 'package:crabshare_mobile/features/investor/votes/decision_card.dart';
import 'package:crabshare_mobile/features/investor/widgets/investor_ui.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/investor_fixtures.dart';

/// Nhà đầu tư có một Lô đã chốt vốn (CS-P1) và một Lô còn gọi vốn (CS-F1), kèm mỗi loại việc cần làm một việc.
FakeApi _investorApi() => FakeApi()
  ..get('/api/investor/portfolio', portfolioPage([
    portfolioItem(alerts: 2),
    portfolioItem(code: 'CS-F1', frozen: false, status: 'Funding', amount: 5000000),
  ]))
  ..get('/api/investor/portfolio/CS-P1', portfolioDetail(portfolioItem(alerts: 2)))
  ..get('/api/investor/portfolio/CS-F1', portfolioDetail(portfolioItem(code: 'CS-F1', frozen: false, status: 'Funding', amount: 5000000)))
  ..get('/api/batches/CS-P1/money-summary', moneySummary())
  ..get('/api/batches/CS-P1/progress', progressJson())
  ..get('/api/batches/CS-P1/decisions', [decisionJson(no: 'QD0000', status: 'Rejected', canVote: false), decisionJson()])
  ..get('/api/batches/CS-P1/settlement-readiness', readinessJson())
  ..get('/api/batches/CS-P1/device-images', [deviceImageJson(3, '1702'), deviceImageJson(2, '1701'), deviceImageJson(1, '1701')])
  ..get('/api/batches/CS-P1/timeline', {'batchCode': 'CS-P1', 'timeZone': 'Asia/Ho_Chi_Minh', 'groups': [], 'hasMore': false, 'nextBefore': null})
  ..routes['GET /api/device-images/3/file'] = ((_) => ResponseBody.fromBytes(onePixelPng, 200))
  ..routes['GET /api/device-images/2/file'] = ((_) => ResponseBody.fromBytes(onePixelPng, 200))
  ..get('/api/me/kyc', {'verificationStatus': 'Unverified', 'verifiedAt': null, 'lastCheck': null})
  ..get('/api/me/contributions', [myContributionJson(), myContributionJson(status: 'Confirmed')])
  ..get('/api/me/contracts', [contractJson(), contractJson(id: 11, nextSigner: null, status: 'FullySigned')])
  ..get('/api/me/settlements', [settlementSummaryJson()])
  ..get('/api/settlements/7', settlementJson());

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));

  test('repository reads every portfolio page and maps the frozen capital basis', () async {
    final pages = <Object?>[];
    final repo = ApiPortfolioRepository(discoveryDio((request) {
      expect(request.path, '/api/investor/portfolio');
      expect(request.queryParameters['pageSize'], 100);
      pages.add(request.queryParameters['page']);
      final page = portfolioPage([portfolioItem(), portfolioItem(code: 'CS-F1', frozen: false)]);
      return jsonResponse({...page, 'total': 101});
    }));
    final items = await repo.list();
    expect(pages, [1, 2]);
    expect(items, hasLength(4));
    expect(items.first.frozen, isTrue);
    expect(items.first.capitalRatio, 0.6);
    expect(items.first.confirmedAmount, 10200000);
    expect(items[1].frozen, isFalse);
    expect(items.first.batch.openAlerts, 0);
    expect(items.first.settlement, isNull);
  });

  test('repository reads detail, the three money numbers and my contributions from their endpoints', () async {
    final paths = <String>[];
    final repo = ApiPortfolioRepository(discoveryDio((request) {
      paths.add(request.path);
      return jsonResponse(switch (request.path) {
        '/api/investor/portfolio/CS-P1' => portfolioDetail(portfolioItem(
          settlement: {'status': 'Approved', 'capitalReturn': 10200000, 'profitShare': 1272000, 'taxWithheld': 72000, 'netPayout': 11400000, 'inKindQtyKg': 0},
        )),
        '/api/batches/CS-P1/money-summary' => moneySummary(),
        _ => [myContributionJson(), myContributionJson(status: 'Expired')],
      });
    }));
    final detail = await repo.detail('CS-P1');
    expect(detail.contributions.single.contractNo, 'HD-P1-005');
    expect(detail.contributions.single.confirmedAt, DateTime.utc(2026, 10, 9, 12, 5, 47));
    expect(detail.position.settlement!.netPayout, 11400000);
    final money = await repo.money('CS-P1');
    expect(money.mine!.contributed, 10200000);
    expect(money.mine!.disbursed, 4200000);
    expect(money.mine!.held, 6000000);
    expect(money.batch.held, 10000000);
    final contributions = await repo.contributions();
    expect(contributions.first.waitingForPayment(), isTrue);
    expect(contributions.last.waitingForPayment(), isFalse);
    expect(paths, ['/api/investor/portfolio/CS-P1', '/api/batches/CS-P1/money-summary', '/api/me/contributions']);
  });

  test('overview sums recorded money of frozen batches only and needs the investor role', () async {
    final api = _investorApi()..get('/api/investor/portfolio', portfolioPage([
      portfolioItem(),
      portfolioItem(code: 'CS-P2'),
      portfolioItem(code: 'CS-F1', frozen: false, amount: 5000000),
    ]));
    final container = ProviderContainer(overrides: [
      sessionProvider.overrideWith(TestSession.new),
      dioProvider.overrideWithValue(api.dio),
    ]);
    addTearDown(container.dispose);
    final money = await container.read(overviewMoneyProvider.future);
    expect(money.figures.contributed, 10200000);
    expect(money.figures.disbursed, 4200000);
    expect(money.figures.held, 6000000);
    expect(money.frozenBatches, 2);
    expect(money.missing, 1); // CS-P2 chưa lấy được số tiền
    expect(money.waitingAmount, 5000000);
    expect(api.paths('GET'), isNot(contains('/api/batches/CS-F1/money-summary')));

    final customer = ProviderContainer(overrides: [
      sessionProvider.overrideWith(() => TestSession(testSession(roles: [Roles.customer]))),
      dioProvider.overrideWithValue(api.dio),
    ]);
    addTearDown(customer.dispose);
    await expectLater(customer.read(portfolioProvider.future), throwsStateError);
  });

  testWidgets('Tổng quan leads with recorded money, lists what to do next, then my batches', (tester) async {
    final api = _investorApi();
    final opened = await pumpInvestor(tester, api, location: Routes.investorHome);

    expect(find.text('Tôi đã góp'), findsOneWidget);
    expect(find.text('10.200.000 đ'), findsWidgets); // số lớn (và thẻ của Lô CS-P1 khi đã dựng)
    expect(find.text('Đã giải ngân'), findsOneWidget);
    expect(find.text('4.200.000 đ'), findsOneWidget);
    expect(find.text('6.000.000 đ'), findsOneWidget);
    expect(find.text('1 Lô đã chốt vốn · thêm 5.000.000 đ chờ chốt vốn'), findsOneWidget);

    expect(find.text('Việc cần làm'), findsOneWidget);
    expect(find.text('Xác minh danh tính'), findsOneWidget);
    expect(find.text('Chuyển khoản cho Lô CS-F1'), findsOneWidget);
    expect(find.text('Ký hợp đồng HD-15'), findsOneWidget);
    expect(find.text('Biểu quyết: Thanh lý sớm'), findsOneWidget);
    expect(find.text('Xem bảng quyết toán Lô CS-P1'), findsOneWidget);

    await tapVisible(tester, find.text('Chuyển khoản cho Lô CS-F1'));
    expect(opened.single.toString(), 'http://localhost:5173/nha-dau-tu/gop-von/CS-F1');

    await tester.scrollUntilVisible(find.text('Cua thịt hộp CS-F1'), 200);
    expect(find.text('Lô của tôi'), findsOneWidget);
    expect(find.text('2 cảnh báo'), findsOneWidget);
    expect(find.textContaining('60% vốn Lô'), findsNWidgets(2));
    expectNoProjection();

    await tester.drag(find.byType(ListView), const Offset(0, 3000));
    await settle(tester);
    await tapVisible(tester, find.text('Ký hợp đồng HD-15'));
    expect(find.byType(ContractsPage), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a new investor sees one empty state with the next step', (tester) async {
    final api = FakeApi()
      ..get('/api/investor/portfolio', portfolioPage([]))
      ..get('/api/me/kyc', {'verificationStatus': 'Verified', 'verifiedAt': null, 'lastCheck': null})
      ..get('/api/me/contributions', [])
      ..get('/api/me/contracts', [])
      ..get('/api/me/settlements', []);
    await pumpInvestor(tester, api, home: const InvestorHomePage());
    expect(find.text('Bạn chưa góp vốn vào Lô nào'), findsOneWidget);
    expect(find.text('Xem Lô đang gọi vốn'), findsOneWidget);
    expect(find.text('Việc cần làm'), findsNothing);
    expect(find.text('Tôi đã góp'), findsNothing);
    expect(find.text('Lô của tôi'), findsNothing);
  });

  testWidgets('my batch shows three money numbers and progress, then one section at a time', (tester) async {
    final api = _investorApi();
    await pumpInvestor(tester, api, location: Routes.portfolioBatch('CS-P1'));

    expect(find.text('Tôi đã góp vào Lô này'), findsOneWidget);
    expect(find.text('10.200.000 đ'), findsNWidgets(2)); // số lớn và dòng khoản góp
    expect(find.text('4.200.000 đ'), findsOneWidget);
    expect(find.text('60% vốn của Lô'), findsOneWidget);
    expect(find.textContaining('con đang nuôi'), findsOneWidget);
    expect(find.text('HD-P1-005'), findsOneWidget);
    expect(find.text('Đủ chữ ký'), findsOneWidget);
    expect(find.text('Điều kiện quyết toán'), findsNothing);
    expectNoProjection();

    await tapVisible(tester, find.text('Thiết bị'));
    expect(find.text('Hộp 1701'), findsOneWidget); // chỉ ảnh mới nhất của mỗi hộp
    expect(find.text('Hộp 1702'), findsOneWidget);
    expect(api.paths('GET'), isNot(contains('/api/device-images/1/file')));
    expect(find.text('HD-P1-005'), findsNothing);

    await tapVisible(tester, find.text('Nhật trình'));
    expect(find.text('Chưa có ghi nhận nào'), findsOneWidget);

    await tapVisible(tester, find.text('Quyết toán'));
    expect(find.text('Còn 1 điều kiện'), findsOneWidget);
    expect(find.text('Còn 40 mục'), findsOneWidget);
    expect(find.text('11.400.000 đ'), findsOneWidget);
    await tapVisible(tester, find.text('Bảng quyết toán'));
    expect(find.byType(SettlementStatementPage), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('voting asks for confirmation, posts the choice and shows my recorded vote', (tester) async {
    final api = _investorApi()
      ..routes['POST /api/decisions/QD0001/votes'] = ((request) {
        expect(request.data, {'choice': 'Yes'});
        return decisionJson(status: 'Passed', canVote: false, myChoice: 'Yes', yes: 10200000);
      });
    await pumpInvestor(tester, api, location: InvestorRoutes.portfolioTab('CS-P1', 'bieu-quyet'));

    expect(find.byType(DecisionCard), findsNWidgets(2));
    expect(find.text('Đồng ý'), findsNWidgets(3)); // hai nhãn thanh vốn và một nút
    await tapVisible(tester, find.widgetWithText(FilledButton, 'Đồng ý'));
    expect(find.text('Biểu quyết: Đồng ý'), findsOneWidget);
    expect(find.textContaining('không đổi lại được'), findsOneWidget);
    expect(api.paths('POST'), isEmpty);

    await tester.tap(find.text('Gửi phiếu đồng ý'));
    await settle(tester);
    expect(api.paths('POST'), ['/api/decisions/QD0001/votes']);
    expect(find.text('Đã ghi nhận phiếu của bạn.'), findsOneWidget);
    expect(find.textContaining('Bạn đã chọn: Đồng ý'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Đồng ý'), findsNothing);
    expect(find.text('Thông qua'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a refused vote keeps the buttons and shows the server message', (tester) async {
    final api = _investorApi()
      ..routes['POST /api/decisions/QD0001/votes'] = ((_) => jsonResponse({'detail': 'Cuộc biểu quyết đã kết thúc.'}, 422));
    await pumpInvestor(tester, api, location: InvestorRoutes.portfolioTab('CS-P1', 'bieu-quyet'));
    await tapVisible(tester, find.widgetWithText(OutlinedButton, 'Không đồng ý'));
    await tester.tap(find.text('Gửi phiếu không đồng ý'));
    await settle(tester);
    expect(find.text('Cuộc biểu quyết đã kết thúc.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Đồng ý'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a batch whose capital is not closed shows only what I contributed', (tester) async {
    final api = _investorApi();
    await pumpInvestor(tester, api, home: const PortfolioDetailPage(code: 'CS-F1', initialTab: 'bieu-quyet'));
    expect(find.text('60% vốn của Lô · Lô chưa chốt vốn'), findsOneWidget);
    expect(find.text('Đã giải ngân'), findsNothing);
    expect(find.text('Lô chưa chốt vốn nên chưa có biểu quyết'), findsOneWidget);
    expect(api.paths('GET'), isNot(contains('/api/batches/CS-F1/money-summary')));
    expect(api.paths('GET'), isNot(contains('/api/batches/CS-F1/decisions')));
    expect(find.byType(MoneyCard), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

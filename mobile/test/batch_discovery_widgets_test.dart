import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_detail_page.dart';
import 'package:crabshare_mobile/features/investor/batches/batch_explore_page.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/investor_fixtures.dart';

Map<String, dynamic> _tradeBatch() => exploreBatch(
  code: 'CS-T1',
  mode: 'T',
  status: 'Sourcing',
  crabType: 'FatteningMudCrab',
  preorderDeadline: '2099-12-20T00:00:00Z',
  offers: [exploreOffer(code: 'FAT-XL-G1', price: 520000), exploreOffer(price: 380000)],
);

Map<String, dynamic> _availability({bool accepting = true}) => {
  'batchCode': 'CS-T1', 'acceptingPreorders': accepting, 'sellableCrabs': 300, 'committedCrabs': 30, 'remainingCrabs': 270,
  'specs': [
    {'specCode': 'FAT-XL-G1', 'specName': 'Cua thịt FAT-XL-G1', 'pricePerKg': 520000, 'conversionWeightG': 420, 'offeredQuantity': 75, 'committed': 10, 'remaining': 65},
  ],
  'minOrderCrabs': 10, 'depositRatePct': 20.0, 'holdMinutes': 15,
};

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));

  testWidgets('Lô tab lists open batches and filters by purpose and crab type', (tester) async {
    final api = FakeApi()
      ..get('/api/batches', {'items': [exploreBatch(), _tradeBatch()], 'page': 1, 'pageSize': 100, 'total': 2});
    await pumpInvestor(tester, api, home: const BatchExplorePage());

    expect(find.byType(BatchCard), findsNWidgets(2));
    expect(find.text('30 triệu / 60 triệu'), findsOneWidget);
    expect(find.text('380.000 đ – 520.000 đ / kg'), findsOneWidget);
    expect(find.text('Lô P · góp vốn'), findsOneWidget);
    expect(api.requests.single.queryParameters['scope'], 'open');

    await tester.tap(find.text('Gọi vốn'));
    await settle(tester);
    expect(find.byType(BatchCard), findsOneWidget);
    expect(find.text('Lô CS42 đã công bố'), findsOneWidget);

    await tester.tap(find.text('Đặt trước'));
    await settle(tester);
    expect(find.text('Lô CS-T1 đã công bố'), findsOneWidget);
    expect(find.text('Lô CS42 đã công bố'), findsNothing);

    await tester.tap(find.text('Cua gạch'));
    await settle(tester);
    expect(find.text('Không có Lô nào khớp bộ lọc'), findsOneWidget);
    expectNoProjection();
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lô tab with nothing open shows one empty state and no crab type row', (tester) async {
    final api = FakeApi()..get('/api/batches', {'items': [], 'page': 1, 'pageSize': 100, 'total': 0});
    await pumpInvestor(tester, api, home: const BatchExplorePage());
    expect(find.text('Chưa có Lô nào đang mở'), findsOneWidget);
    expect(find.text('Mọi loại cua'), findsNothing);
  });

  testWidgets('investor sees the funding block and opens the web contribution flow', (tester) async {
    final api = FakeApi()
      ..get('/api/batches/CS42', exploreBatch())
      ..get('/api/batches/CS42/progress', progressJson(participant: false))
      ..get('/api/batches/CS42/availability', {..._availability(), 'specs': [], 'remainingCrabs': 0});
    final opened = await pumpInvestor(tester, api, home: const BatchDetailPage(code: 'CS42'));

    expect(find.text('Lô CS42 đã công bố'), findsOneWidget);
    expect(find.text('30.000.000 đ'), findsNWidgets(2)); // đã xác nhận và còn nhận
    expect(find.text('/ 60.000.000 đ'), findsOneWidget);
    expect(find.text('Góp tối thiểu'), findsOneWidget);
    expect(find.text('38 con'), findsOneWidget);
    expect(find.text('Góp vốn có rủi ro, nền tảng không cam kết kết quả tài chính.'), findsOneWidget);
    expect(find.text('Đặt trước trên web'), findsNothing);
    expectNoProjection();

    await tester.tap(find.text('Góp vốn trên web'));
    await settle(tester);
    expect(opened.single.toString(), 'http://localhost:5173/nha-dau-tu/gop-von/CS42');
    expect(tester.takeException(), isNull);
  });

  testWidgets('customer without the investor role sees prices and opens the web pre-order flow', (tester) async {
    final api = FakeApi()
      ..get('/api/batches/CS-T1', _tradeBatch())
      ..get('/api/batches/CS-T1/progress', progressJson(participant: false))
      ..get('/api/batches/CS-T1/availability', _availability());
    final opened = await pumpInvestor(
      tester,
      api,
      home: const BatchDetailPage(code: 'CS-T1'),
      session: testSession(roles: [Roles.customer]),
    );

    expect(find.text('Bảng giá theo quy cách'), findsOneWidget);
    expect(find.text('520.000 đ/kg'), findsOneWidget);
    expect(find.text('khoảng 330 g/con · còn 65 con'), findsOneWidget);
    expect(find.text('khoảng 330 g/con'), findsOneWidget);
    expect(find.textContaining('Còn đặt được 270 con · đặt cọc 20%'), findsOneWidget);
    expect(find.text('Góp vốn trên web'), findsNothing);
    expect(find.text('Vốn đã xác nhận'), findsNothing);

    await tester.tap(find.text('Đặt trước trên web'));
    await settle(tester);
    expect(opened.single.toString(), 'http://localhost:5173/khach/dat-truoc/CS-T1');
    expect(tester.takeException(), isNull);
  });

  testWidgets('a batch that takes nothing has no action bar; an unpublished one says so', (tester) async {
    final api = FakeApi()
      ..get('/api/batches/CS-OLD', exploreBatch(code: 'CS-OLD', status: 'Closed'))
      ..get('/api/batches/DRAFT', {'batchCode': 'DRAFT', 'status': 'Draft'})
      ..get('/api/batches', {'items': [], 'page': 1, 'pageSize': 100, 'total': 0});
    await pumpInvestor(tester, api, home: const BatchDetailPage(code: 'CS-OLD'));
    expect(find.text('Lô này hiện không nhận góp vốn và đặt trước.'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);

    await tester.pumpWidget(const SizedBox());
    await pumpInvestor(tester, api, home: const BatchDetailPage(code: 'DRAFT'));
    expect(find.text('Lô này chưa được công bố'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a card on the Lô tab opens the public batch screen', (tester) async {
    final api = FakeApi()
      ..get('/api/batches', {'items': [exploreBatch()], 'page': 1, 'pageSize': 100, 'total': 1})
      ..get('/api/batches/CS42', exploreBatch())
      ..get('/api/investor/portfolio', portfolioPage([]));
    await pumpInvestor(tester, api, location: Routes.investorBatches);
    await tester.tap(find.byType(BatchCard));
    await settle(tester);
    expect(find.byType(BatchDetailPage), findsOneWidget);
    expect(find.text('Góp vốn trên web'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

import 'package:crabshare_mobile/features/customer/data/claim_memory.dart';
import 'package:crabshare_mobile/features/customer/data/customer_models.dart';
import 'package:crabshare_mobile/features/customer/data/customer_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/customer_fakes.dart';
import 'helpers/discovery_fakes.dart';

void main() {
  late List<RequestOptions> requests;
  late Object Function(RequestOptions) reply;
  late ApiCustomerRepository repo;

  setUp(() {
    requests = [];
    reply = (_) => <String, dynamic>{};
    repo = ApiCustomerRepository(
      discoveryDio((options) {
        requests.add(options);
        return jsonResponse(reply(options));
      }),
    );
  });

  String sent() => '${requests.last.method} ${requests.last.uri.path}';

  test('orders and order detail use the preorder endpoints and parse the lines, tranches and deposit', () async {
    reply = (_) => {
      'items': [orderJson(status: 'PendingDeposit', withDeposit: true)],
      'page': 1,
      'pageSize': 100,
      'total': 1,
    };
    final page = await repo.orders();
    expect(sent(), 'GET /api/preorders');
    expect(requests.last.queryParameters, {'page': 1, 'pageSize': 100});
    final o = page.items.single;
    expect(page.total, 1);
    expect(o.orderNo, 'OD1');
    expect(o.depositAmount, 832000);
    expect(o.depositState, 'Pending');
    expect(o.isOpen && o.isCancellable && !o.hasDeliveries, isTrue);
    expect(o.lines.map((l) => l.quantity), ['20 con', '4,2 kg']);
    expect(o.specName('FAT-XL-SPECIAL'), 'Cua thịt size XL Đặc cấp');
    expect(o.nextTranche?.seq, 1);
    expect(o.tranches.single.dueDate, DateTime(2026, 12, 20));
    expect(o.deposit?.referenceCode, 'CSDEP9');
    expect(o.deposit?.expiresAt, isNotNull);

    reply = (_) => orderJson(orderNo: 'OD/2', status: 'Delivered');
    final delivered = await repo.order('OD/2');
    expect(sent(), 'GET /api/preorders/OD%2F2');
    expect(delivered.depositState, 'Applied');
    expect(delivered.isDelivered, isTrue);
    expect(delivered.deposit, isNull);
  });

  test('deliveries parse shipments into the step the customer is at', () async {
    reply = (_) => deliveriesJson(
      shipments: [
        shipmentJson(shipmentNo: 'S1', stage: 'scheduled'),
        shipmentJson(shipmentNo: 'S2', stage: 'transit'),
        shipmentJson(shipmentNo: 'S3', stage: 'accept'),
        shipmentJson(shipmentNo: 'S4', stage: 'pay'),
        shipmentJson(shipmentNo: 'S5', stage: 'done'),
      ],
      withInvoice: true,
    );
    final d = await repo.deliveries('OD1');
    expect(sent(), 'GET /api/preorders/OD1/deliveries');
    expect(d.shipments.map((s) => s.stage), [
      ShipmentStage.scheduled,
      ShipmentStage.transit,
      ShipmentStage.accept,
      ShipmentStage.pay,
      ShipmentStage.done,
    ]);
    expect(d.depositCredit, 832000);
    expect(d.traceCode, 'QR7K2M9XQ4TB');
    expect(d.invoices.single.amount, 1900000);
    final waiting = d.shipments[2];
    expect(waiting.goodsValue, 1900000);
    expect(crabsAndKg(waiting.crabs, waiting.kg), '19 con · 5 kg');
    expect(waiting.acceptance?.rejectedCrabs, 1);
    expect(waiting.inReturnWindow(), isFalse);
    final toPay = d.shipments[3];
    expect(toPay.acceptance?.balanceDue, 1068000);
    expect(toPay.balance?.referenceCode, 'CSBAL12');
    expect(toPay.inReturnWindow(), isTrue);
  });

  test('acceptance, refusal and cancellation post to their endpoints', () async {
    reply = (_) => shipmentJson(stage: 'pay');
    expect((await repo.confirmAcceptance('SH1')).stage, ShipmentStage.pay);
    expect(sent(), 'POST /api/shipments/SH1/acceptance/confirm');
    expect(requests.last.data, isNull);

    await repo.refuseDelivery('SH1', '  Cua chết nhiều ');
    expect(sent(), 'POST /api/shipments/SH1/acceptance/refuse');
    expect(requests.last.data, {'reason': 'Cua chết nhiều'});

    reply = (_) => orderJson(status: 'Cancelled');
    expect((await repo.cancelOrder('OD1', reason: ' ')).status, 'Cancelled');
    expect(sent(), 'POST /api/preorders/OD1/cancel');
    expect(requests.last.data, {'reason': null});
    await repo.cancelOrder('OD1', reason: 'Đổi kế hoạch');
    expect(requests.last.data, {'reason': 'Đổi kế hoạch'});
  });

  test('a claim is sent as multipart with the DTO field names and the in-app photo', () async {
    reply = (_) => claimJson();
    final claim = await repo.createClaim(
      'OD1',
      ClaimDraft(
        shipmentNo: 'SH1',
        specCode: 'FAT-M-G1',
        claimType: 'Complaint',
        issueType: 'Dead',
        affectedCrabs: 2,
        affectedKg: 0.5,
        description: ' Hai con chết ',
        photo: fakePhoto(),
      ),
    );
    expect(sent(), 'POST /api/preorders/OD1/claims');
    final form = requests.last.data as FormData;
    expect(Map.fromEntries(form.fields), {
      'ShipmentNo': 'SH1',
      'SpecCode': 'FAT-M-G1',
      'ClaimType': 'Complaint',
      'IssueType': 'Dead',
      'AffectedCrabs': '2',
      'AffectedKg': '0.5',
      'Description': 'Hai con chết',
    });
    expect(form.files.single.key, 'Photo');
    expect(form.files.single.value.contentType.toString(), 'image/png');
    expect(claim.claimNo, 'KN1');
    expect(claim.affected, '2 con');
    expect(claim.awaitsMyReply, isFalse);
  });

  test('claim lookup, reply and rating use their endpoints', () async {
    reply = (_) => claimJson(status: 'OperatorAccepted', operatorResponse: 'Đồng ý hoàn 2 con');
    final claim = await repo.claim('KN1');
    expect(sent(), 'GET /api/claims/KN1');
    expect(claim.awaitsMyReply, isTrue);
    expect(claim.operatorResponse, 'Đồng ý hoàn 2 con');
    expect(claimPhotoPath('KN1'), '/api/claims/KN1/photo');

    reply = (_) => claimJson(status: 'Accepted');
    final closed = await repo.replyClaim('KN1', agree: true);
    expect(sent(), 'POST /api/claims/KN1/customer-reply');
    expect(requests.last.data, {'agree': true});
    expect(closed.refundAmount, 200000);

    reply = (_) => {'orderNo': 'OD1', 'stars': 5, 'comment': null, 'createdAt': '2026-12-21T00:00:00Z'};
    expect((await repo.rate('OD1', stars: 5, comment: '')).stars, 5);
    expect(sent(), 'POST /api/preorders/OD1/rating');
    expect(requests.last.data, {'stars': 5, 'comment': null});
  });

  test('open batches come from the explore endpoint; only those with offers in time take pre-orders', () async {
    reply = (_) => {
      'items': [
        openBatchJson(),
        openBatchJson(code: 'CS-FUND', withOffers: false),
        openBatchJson(code: 'CS-LATE', preorderDeadline: '2020-01-01T00:00:00Z'),
      ],
      'page': 1,
      'pageSize': 60,
      'total': 3,
    };
    final batches = await repo.openBatches();
    expect(sent(), 'GET /api/batches');
    expect(requests.last.queryParameters, {'scope': 'open', 'pageSize': 60});
    expect(batches.map((b) => b.takesPreorders()), [true, false, false]);
    expect(batches.first.remainingCrabs, 270);
    expect(batches.first.priceRange, '380.000 đ – 520.000 đ / kg');
    expect(batches[1].priceRange, isNull);
  });

  test('claim numbers and ratings are remembered per user on the device', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    FlutterSecureStorage.setMockInitialValues({});
    final first = SecureClaimMemory();
    await first.rememberClaim(7, 'OD1', 'KN1');
    await first.rememberClaim(7, 'OD1', 'KN1');
    await first.rememberClaim(7, 'OD1', 'KN2');
    await first.rememberRating(7, 'OD1', 4);

    final reopened = SecureClaimMemory();
    expect(await reopened.claims(7, 'OD1'), ['KN1', 'KN2']);
    expect(await reopened.claims(7, 'OD2'), isEmpty);
    expect(await reopened.claims(8, 'OD1'), isEmpty);
    expect(await reopened.rating(7, 'OD1'), 4);
    expect(await reopened.rating(8, 'OD1'), isNull);
  });
}

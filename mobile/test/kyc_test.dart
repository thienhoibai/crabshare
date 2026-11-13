import 'dart:convert';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/home/investor_home_page.dart';
import 'package:crabshare_mobile/features/investor/kyc/kyc_camera.dart';
import 'package:crabshare_mobile/features/investor/kyc/kyc_page.dart';
import 'package:crabshare_mobile/features/investor/kyc/kyc_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/investor_fixtures.dart';

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=',
);

class _Repository implements KycRepository {
  int submissions = 0;
  int reads = 0;
  KycVerification value = const KycVerification(status: KycStatus.unverified);
  @override
  Future<KycVerification> status() async {
    reads++;
    return value;
  }

  @override
  Future<KycVerification> verify({
    required List<KycImage> images,
    required bool consent,
  }) async {
    expect(consent, isTrue);
    expect(images, hasLength(3));
    expect(images.every((image) => image.contentType == 'image/png'), isTrue);
    submissions++;
    return value = const KycVerification(status: KycStatus.verified);
  }
}

class _Camera implements KycCamera {
  final List<bool> selfieRequests = [];
  bool deny = false;
  @override
  Future<KycImage?> capture({required bool selfie}) async {
    if (deny) throw PlatformException(code: 'camera_access_denied');
    selfieRequests.add(selfie);
    return KycImage.fromBytes(_png);
  }
}

class _Adapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];
  int responseStatus = 200;
  String payload =
      '{"verificationStatus":"Verified","verifiedAt":null,"lastCheck":null}';
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (requestStream != null) await requestStream.drain<void>();
    return ResponseBody.fromString(
      payload,
      responseStatus,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));

  test('API repository sends all photos, consent and maps Verified', () async {
    final adapter = _Adapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'))
      ..httpClientAdapter = adapter;
    final repository = ApiKycRepository(dio);
    final result = await repository.verify(
      images: List.filled(3, KycImage.fromBytes(_png)),
      consent: true,
    );
    expect(result.status, KycStatus.verified);
    final request = adapter.requests.single;
    expect(request.path, '/api/kyc/ekyc');
    final form = request.data as FormData;
    expect(form.fields.single.key, 'consent');
    expect(form.fields.single.value, 'true');
    expect(form.files.map((file) => file.key), [
      'idCardFront',
      'idCardBack',
      'selfie',
    ]);
    expect(
      form.files.every((file) => file.value.length == _png.length),
      isTrue,
    );
    expect((await repository.status()).status, KycStatus.verified);
    expect(adapter.requests.last.path, '/api/me/kyc');
  });

  test('status maps the failure reason and treats unknown codes as not verified', () {
    final rejected = KycVerification.fromJson({
      'verificationStatus': 'Rejected',
      'verifiedAt': null,
      'lastCheck': {'id': 1, 'result': 'Failed', 'failureReason': 'Ảnh khuôn mặt không khớp giấy tờ.'},
    });
    expect(rejected.status, KycStatus.rejected);
    expect(rejected.failureReason, 'Ảnh khuôn mặt không khớp giấy tờ.');
    expect(KycVerification.fromJson({'verificationStatus': 'Something'}).status, KycStatus.unverified);
    expect(KycVerification.fromJson({'verificationStatus': 'Pending'}).status, KycStatus.pending);
  });

  test('API validation failure propagates, never maps to Verified', () async {
    final adapter = _Adapter()
      ..responseStatus = 400
      ..payload = '{"errors":{"Consent":["Consent required"]}}';
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'))
      ..httpClientAdapter = adapter;
    await expectLater(
      ApiKycRepository(dio).verify(
        images: List.filled(3, KycImage.fromBytes(_png)),
        consent: false,
      ),
      throwsA(isA<DioException>()),
    );
    expect(
      (adapter.requests.single.data as FormData).fields.single.value,
      'false',
    );
  });

  test('status refreshes after changing accounts', () async {
    final repository = _Repository()
      ..value = const KycVerification(status: KycStatus.verified);
    final session = TestSession();
    final container = ProviderContainer(
      overrides: [
        sessionProvider.overrideWith(() => session),
        kycRepositoryProvider.overrideWithValue(repository),
      ],
    );
    addTearDown(container.dispose);
    expect(
      (await container.read(kycDetailsProvider.future)).status,
      KycStatus.verified,
    );
    repository.value = const KycVerification(status: KycStatus.unverified);
    session.change(2);
    expect(
      (await container.read(kycDetailsProvider.future)).status,
      KycStatus.unverified,
    );
    expect(repository.reads, 2);
  });

  Future<void> showPage(
    WidgetTester tester,
    _Repository repository,
    _Camera camera,
  ) async {
    tester.view.physicalSize = const Size(360, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith(TestSession.new),
          kycRepositoryProvider.overrideWithValue(repository),
          kycCameraProvider.overrideWithValue(camera),
        ],
        child: MaterialApp(theme: buildAppTheme(), home: const KycPage()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'camera flow requires consent and three photos, then displays success',
    (tester) async {
      final repository = _Repository();
      final camera = _Camera();
      await showPage(tester, repository, camera);
      expect(find.text('Chưa xác minh danh tính'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(find.byKey(const ValueKey('kyc-submit')))
            .onPressed,
        isNull,
      );
      // Chưa đồng ý thì bấm ô chụp không mở camera.
      await tester.tap(find.byKey(const ValueKey('kyc-capture-0')));
      await tester.pumpAndSettle();
      expect(camera.selfieRequests, isEmpty);

      await tester.tap(find.byKey(const ValueKey('kyc-consent')));
      await tester.pumpAndSettle();
      for (var i = 0; i < 3; i++) {
        final tile = find.byKey(ValueKey('kyc-capture-$i'));
        await tester.ensureVisible(tile);
        await tester.pumpAndSettle();
        await tester.tap(tile);
        await tester.pumpAndSettle();
      }
      expect(camera.selfieRequests, [false, false, true]);
      final submit = find.byKey(const ValueKey('kyc-submit'));
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(repository.submissions, 1);
      expect(find.text('Đã xác minh danh tính'), findsOneWidget);
      expect(find.byType(Image), findsNothing);
      expect(find.byKey(const ValueKey('kyc-submit')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('camera denial is displayed and does not submit', (tester) async {
    final repository = _Repository();
    await showPage(tester, repository, _Camera()..deny = true);
    await tester.tap(find.byKey(const ValueKey('kyc-consent')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('kyc-capture-0')));
    await tester.tap(find.byKey(const ValueKey('kyc-capture-0')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Chưa có quyền camera'), findsOneWidget);
    expect(repository.submissions, 0);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('kyc-submit')))
          .onPressed,
      isNull,
    );
  });

  testWidgets('a rejected check shows the reason and lets the investor try again', (tester) async {
    final repository = _Repository()
      ..value = const KycVerification(status: KycStatus.rejected, failureReason: 'Ảnh giấy tờ bị mờ.');
    await showPage(tester, repository, _Camera());
    expect(find.text('Xác minh chưa đạt, hãy thử lại'), findsOneWidget);
    expect(find.text('Ảnh giấy tờ bị mờ.'), findsOneWidget);
    expect(find.byKey(const ValueKey('kyc-submit')), findsOneWidget);
  });

  testWidgets('overview asks for identity verification only while the API says it is missing', (tester) async {
    Future<void> showHome(String status) => pumpInvestor(
      tester,
      FakeApi()
        ..get('/api/investor/portfolio', portfolioPage([]))
        ..get('/api/me/kyc', {'verificationStatus': status, 'verifiedAt': null, 'lastCheck': null}),
      home: const InvestorHomePage(),
    );
    await showHome('Unverified');
    expect(find.text('Xác minh danh tính'), findsOneWidget);
    expect(find.text('Cần có trước khi góp vốn'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await showHome('Verified');
    expect(find.text('Xác minh danh tính'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

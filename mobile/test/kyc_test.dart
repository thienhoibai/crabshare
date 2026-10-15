import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';

import 'helpers/notification_fakes.dart';

import 'package:crabshare_mobile/features/investor/data/portfolio_repository.dart';

import 'dart:convert';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/investor/data/investor_models.dart';
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

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=',
);
const _user = AppUser(
  userId: 1,
  email: 'test@local',
  fullName: 'KYC Test',
  roles: [Roles.investor],
);

class _Session extends SessionController {
  _Session() : super(const SessionState(token: 'test', user: _user));
  void changeUser() => state = const SessionState(
    token: 'other',
    user: AppUser(
      userId: 2,
      email: 'other@local',
      fullName: 'Other',
      roles: [Roles.investor],
    ),
  );
}

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
    final session = _Session();
    final container = ProviderContainer(
      overrides: [
        notificationPollIntervalProvider.overrideWithValue(null),
        notificationRepositoryProvider.overrideWithValue(
          EmptyNotificationRepository(),
        ),
        notificationReadStoreProvider.overrideWithValue(
          MemoryNotificationReadStore(),
        ),
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
    session.changeUser();
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
          notificationPollIntervalProvider.overrideWithValue(null),
          notificationRepositoryProvider.overrideWithValue(
            EmptyNotificationRepository(),
          ),
          notificationReadStoreProvider.overrideWithValue(
            MemoryNotificationReadStore(),
          ),
          sessionProvider.overrideWith(_Session.new),
          myContributionsProvider.overrideWith((ref) async => []),
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
      expect(
        tester
            .widget<FilledButton>(find.byKey(const ValueKey('kyc-submit')))
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<OutlinedButton>(find.byKey(const ValueKey('kyc-capture-0')))
            .onPressed,
        isNull,
      );
      await tester.tap(find.byKey(const ValueKey('kyc-consent')));
      await tester.pumpAndSettle();
      for (var i = 0; i < 3; i++) {
        final button = find.byKey(ValueKey('kyc-capture-$i'));
        await tester.ensureVisible(button);
        await tester.pumpAndSettle();
        await tester.tap(button);
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

  testWidgets('overview banner follows API status instead of mock KYC', (
    tester,
  ) async {
    final repository = _Repository()
      ..value = const KycVerification(status: KycStatus.verified);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          notificationPollIntervalProvider.overrideWithValue(null),
          notificationRepositoryProvider.overrideWithValue(
            EmptyNotificationRepository(),
          ),
          notificationReadStoreProvider.overrideWithValue(
            MemoryNotificationReadStore(),
          ),
          sessionProvider.overrideWith(_Session.new),
          myContributionsProvider.overrideWith((ref) async => []),
          kycRepositoryProvider.overrideWithValue(repository),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const InvestorHomePage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Xác minh danh tính để góp vốn'), findsNothing);
    expect(repository.reads, 1);
  });
}

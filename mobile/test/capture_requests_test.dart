import 'dart:convert';

import 'package:crabshare_mobile/app/router.dart';
import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/operator/data/operator_models.dart';
import 'package:crabshare_mobile/features/operator/data/operator_orders_repository.dart';
import 'package:crabshare_mobile/features/operator/evidence/capture_page.dart';
import 'package:crabshare_mobile/features/operator/evidence/capture_requests_repository.dart';
import 'package:crabshare_mobile/features/operator/evidence/capture_requests_section.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_camera.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

class _Requests implements CaptureRequestsRepository {
  bool fail = false;
  List<CaptureRequest> items = [
    CaptureRequest(
      id: 50,
      batchCode: 'CS50-TEST',
      slotCode: '0014',
      dueAt: DateTime.now().add(const Duration(hours: 2)),
    ),
  ];
  @override
  Future<List<CaptureRequest>> list({CancelToken? cancelToken}) async {
    if (fail) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 503,
          data: {'detail': 'Không tải được yêu cầu chụp.'},
        ),
      );
    }
    return items;
  }
}

class _Evidence implements EvidenceRepository {
  _Evidence(this.requests);
  final _Requests requests;
  int uploads = 0;
  @override
  Future<List<BoxSlot>> boxes({CancelToken? cancelToken}) async => [
    BoxSlot(
      slotCode: '0014',
      status: SlotStatus.occupied,
      batchCode: 'CS50-TEST',
      latestEvidence: BoxEvidenceSummary(
        id: 9,
        receivedAt: DateTime.now().subtract(const Duration(days: 1)),
        reviewStatus: 'Accepted',
      ),
    ),
    const BoxSlot(
      slotCode: '0015',
      status: SlotStatus.occupied,
      batchCode: 'CS50-TEST',
    ),
  ];
  @override
  Future<EvidenceResult> upload({
    required BoxSlot box,
    required EvidencePhoto photo,
    int? captureRequestId,
    String? slotEventType,
  }) async {
    uploads++;
    expect(captureRequestId, 50);
    expect(box.slotCode, '0014');
    expect(box.batchCode, 'CS50-TEST');
    requests.items = [];
    return EvidenceResult(
      id: 1,
      reviewStatus: 'Accepted',
      duplicateMatch: 'None',
      receivedAt: DateTime.now(),
      modelVersion: 'none',
      captureRequestStatus: 'Fulfilled',
    );
  }
}

class _Camera implements EvidenceCamera {
  @override
  Future<EvidencePhoto?> capture() async => EvidencePhoto(
    bytes: base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
    ),
    capturedAt: DateTime.now(),
    latitude: 10,
    longitude: 106,
  );
  @override
  Future<void> openSettings() async {}
}

class _Adapter implements HttpClientAdapter {
  final queries = <Map<String, dynamic>>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancelFuture,
  ) async {
    queries.add(options.queryParameters);
    return ResponseBody.fromString(
      jsonEncode({
        'total': 101,
        'items': [
          {
            'id': options.queryParameters['page'],
            'batchCode': 'CS50-TEST',
            'slotCode': '0014',
            'dueAt': '2026-10-21T05:00:00Z',
            'status': 'Open',
          },
        ],
      }),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('vi_VN');
    final loader = FontLoader('DM Sans');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      loader.addFont(rootBundle.load('assets/fonts/DMSans-$weight.ttf'));
    }
    await loader.load();
  });
  test(
    'API requests fetch every page with Open filter and preserve request IDs',
    () async {
      final adapter = _Adapter();
      final dio = Dio(BaseOptions(baseUrl: 'http://test.local'))
        ..httpClientAdapter = adapter;
      final requests = await ApiCaptureRequestsRepository(dio).list();
      expect(requests.map((r) => r.id), [1, 2]);
      expect(requests.first.status, 'Open');
      expect(adapter.queries.map((q) => q['page']), [1, 2]);
      expect(adapter.queries.every((q) => q['status'] == 'Open'), isTrue);
    },
  );
  testWidgets(
    'Today preserves packing routes and opens the exact capture request through fulfillment',
    (tester) async {
      final requests = _Requests();
      final evidence = _Evidence(requests);
      late GoRouter router;
      tester.view.physicalSize = const Size(360, 780);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      addTearDown(() => tester.pumpWidget(const SizedBox()));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionProvider.overrideWith(
              () => SessionController(
                const SessionState(
                  token: 'test',
                  user: AppUser(
                    userId: 1,
                    email: 'test@local',
                    fullName: 'Test',
                    roles: [Roles.operatorMember],
                    operatorId: 1,
                  ),
                ),
              ),
            ),
            captureRequestsRepositoryProvider.overrideWithValue(requests),
            evidenceRepositoryProvider.overrideWithValue(evidence),
            evidenceCameraProvider.overrideWithValue(_Camera()),
            operatorOrdersRepositoryProvider.overrideWithValue(
              MockOperatorOrdersRepository(),
            ),
          ],
          child: Consumer(
            builder: (context, ref, _) {
              router = ref.watch(routerProvider);
              return MaterialApp.router(
                theme: buildAppTheme(),
                routerConfig: router,
              );
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      // CS-50 and CS-53 both add entry points on Today: keep both flows usable.
      await tester.ensureVisible(find.text('Đóng gói đơn — quét tem'));
      await tester.tap(find.text('Đóng gói đơn — quét tem'));
      await tester.pumpAndSettle();
      expect(router.state.uri.path, Routes.operatorPack);
      await tester.tap(find.text('ODPACKDEMO01'));
      await tester.pumpAndSettle();
      expect(router.state.uri.path, Routes.operatorPackOrder('ODPACKDEMO01'));
      router.pop();
      await tester.pumpAndSettle();
      router.pop();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Hộp 0014'));
      await tester.tap(find.text('Hộp 0014'));
      await tester.pumpAndSettle();
      expect(router.state.uri.queryParameters['requestId'], '50');
      expect(router.state.uri.queryParameters['batch'], 'CS50-TEST');
      expect(find.text('0015'), findsNothing);
      expect(find.text('0014'), findsOneWidget);
      expect(find.text('Đã gửi'), findsNothing);
      await tester.tap(find.text('Chụp'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Gửi ảnh'));
      await tester.pumpAndSettle();
      expect(evidence.uploads, 1);
      expect(find.text('Yêu cầu chụp đã hoàn thành'), findsOneWidget);
      router.pop();
      await tester.pumpAndSettle();
      expect(find.text('Hộp 0014'), findsNothing);
      expect(find.text('Không có yêu cầu chụp đang chờ.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'API error shows retry without mock requests and expired capture disables the camera',
    (tester) async {
      final requests = _Requests()..fail = true;
      addTearDown(() => tester.pumpWidget(const SizedBox()));
      await tester.pumpWidget(
        ProviderScope(
          retry: (count, error) => null,
          overrides: [
            captureRequestsRepositoryProvider.overrideWithValue(requests),
          ],
          child: MaterialApp(
            theme: buildAppTheme(),
            home: const Scaffold(
              body: SingleChildScrollView(child: CaptureRequestsSection()),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Không tải được yêu cầu chụp.'), findsOneWidget);
      expect(find.text('Hộp 0014'), findsNothing);
      requests.fail = false;
      await tester.tap(find.text('Thử lại'));
      await tester.pumpAndSettle();
      expect(find.text('Hộp 0014'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            evidenceRepositoryProvider.overrideWithValue(_Evidence(requests)),
          ],
          child: MaterialApp(
            theme: buildAppTheme(),
            home: CapturePage(
              initialSlot: '0014',
              captureRequestId: 50,
              requestBatchCode: 'CS50-TEST',
              requestDueAt: DateTime.now().subtract(const Duration(seconds: 1)),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Yêu cầu chụp đã quá hạn. Vui lòng quay lại Hôm nay để cập nhật.',
        ),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Chụp'))
            .onPressed,
        isNull,
      );
      expect(tester.takeException(), isNull);
    },
  );
}

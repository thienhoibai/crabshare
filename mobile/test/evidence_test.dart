import 'dart:async';
import 'dart:convert';

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/features/operator/data/operator_models.dart';
import 'package:crabshare_mobile/features/operator/evidence/capture_page.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_camera.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
);
const _box = BoxSlot(
  slotCode: '0014',
  status: SlotStatus.occupied,
  batchCode: 'TEST-CS44',
);
EvidencePhoto _photo() => EvidencePhoto(
  bytes: _png,
  capturedAt: DateTime.utc(2026, 10, 13, 3),
  latitude: 10.123456,
  longitude: 106.654321,
);
Map<String, dynamic> _response({
  String status = 'Accepted',
  String match = 'None',
}) => {
  'id': 44,
  'reviewStatus': status,
  'duplicateMatch': match,
  'receivedAt': '2026-10-13T03:01:00Z',
  'detection': {
    'crabDetected': null,
    'confidence': null,
    'modelVersion': 'none',
  },
};

class _Camera implements EvidenceCamera {
  int captures = 0;
  bool deny = false;
  bool cancel = false;
  @override
  Future<EvidencePhoto?> capture() async {
    captures++;
    if (deny) {
      throw const EvidenceCaptureException(
        'Cần quyền vị trí để gửi bằng chứng.',
      );
    }
    return cancel ? null : _photo();
  }

  @override
  Future<void> openSettings() async {}
}

class _Repository implements EvidenceRepository {
  int uploads = 0;
  int reads = 0;
  bool failRead = false;
  bool failUpload = false;
  Completer<EvidenceResult>? pending;
  EvidenceResult result = EvidenceResult.fromJson(
    _response(status: 'Flagged', match: 'Exact'),
  );
  BoxEvidenceSummary? latest;
  @override
  Future<List<BoxSlot>> boxes({CancelToken? cancelToken}) async {
    reads++;
    if (failRead) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 503,
          data: {'detail': 'Không tải được hộp nuôi.'},
        ),
      );
    }
    return [
      BoxSlot(
        slotCode: _box.slotCode,
        status: _box.status,
        batchCode: _box.batchCode,
        latestEvidence: latest,
      ),
    ];
  }

  @override
  Future<EvidenceResult> upload({
    required BoxSlot box,
    required EvidencePhoto photo,
    int? captureRequestId,
  }) async {
    uploads++;
    expect(box.slotCode, '0014');
    expect(box.batchCode, 'TEST-CS44');
    expect(photo.latitude, 10.123456);
    expect(photo.longitude, 106.654321);
    if (failUpload) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 422,
          data: {'detail': 'Hộp không còn được gán cho lô này.'},
        ),
      );
    }
    final saved = pending == null ? result : await pending!.future;
    latest = BoxEvidenceSummary(
      id: saved.id,
      receivedAt: saved.receivedAt,
      reviewStatus: saved.reviewStatus,
    );
    return saved;
  }
}

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (requestStream != null) {
      await requestStream.drain<void>();
    }
    final dynamic json = options.method == 'POST'
        ? _response()
        : {
            'total': 101,
            'page': options.queryParameters['page'],
            'pageSize': 100,
            'items': options.queryParameters['page'] == 1
                ? [
                    {
                      'slotCode': '0014',
                      'status': 'Occupied',
                      'batchCode': 'TEST-CS44',
                      'latestEvidence': {
                        'id': 12,
                        'receivedAt': '2026-10-13T03:00:00Z',
                        'reviewStatus': 'Accepted',
                      },
                    },
                  ]
                : [
                    {
                      'slotCode': '0101',
                      'status': 'Occupied',
                      'batchCode': 'TEST-CS44',
                    },
                    {
                      'slotCode': '0999',
                      'status': 'Occupied',
                      'batchCode': null,
                    },
                  ],
          };
    return ResponseBody.fromString(
      jsonEncode(json),
      options.method == 'POST' ? 201 : 200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<void> _mount(
  WidgetTester tester,
  _Repository repo,
  _Camera camera,
) async {
  tester.view.physicalSize = const Size(360, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  addTearDown(() => tester.pumpWidget(const SizedBox()));
  await tester.pumpWidget(
    ProviderScope(
      retry: (retryCount, error) => null,
      overrides: [
        evidenceRepositoryProvider.overrideWithValue(repo),
        evidenceCameraProvider.overrideWithValue(camera),
      ],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const CapturePage(initialSlot: '0014'),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    final loader = FontLoader('DM Sans');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      loader.addFont(rootBundle.load('assets/fonts/DMSans-$weight.ttf'));
    }
    await loader.load();
  });
  test('API repository reads all pages of assigned boxes and sends original photo plus capture GPS/time', () async {
    final adapter = _Adapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'))
      ..httpClientAdapter = adapter;
    final repo = ApiEvidenceRepository(dio);
    final boxes = await repo.boxes();
    expect(boxes.map((b) => b.slotCode), ['0014', '0101']);
    expect(boxes.first.latestEvidence!.id, 12);
    expect(boxes.first.latestEvidence!.reviewStatus, 'Accepted');
    expect(boxes.last.latestEvidence, isNull);
    expect(adapter.requests.take(2).map((r) => r.path), [
      '/api/boxes',
      '/api/boxes',
    ]);
    expect(
      (await repo.upload(
        box: boxes.first,
        photo: _photo(),
        captureRequestId: 50,
      )).reviewStatus,
      'Accepted',
    );
    final request = adapter.requests.last;
    expect(request.path, '/api/evidence');
    final form = request.data as FormData;
    final fields = Map.fromEntries(form.fields);
    expect(fields['batchCode'], 'TEST-CS44');
    expect(fields['slotCode'], '0014');
    expect(fields['capturedAt'], '2026-10-13T03:00:00.000Z');
    expect(fields['latitude'], '10.123456');
    expect(fields['longitude'], '106.654321');
    expect(fields['captureRequestId'], '50');
    expect(form.files.single.key, 'image');
    expect(form.files.single.value.length, _png.length);
    expect(form.files.single.value.contentType.toString(), 'image/png');
  });

  testWidgets(
    'camera and GPS photo can be uploaded once and duplicate status comes from server',
    (tester) async {
      final repo = _Repository()..pending = Completer<EvidenceResult>();
      final camera = _Camera();
      await _mount(tester, repo, camera);
      await tester.tap(find.text('Chụp'));
      await tester.pumpAndSettle();
      expect(camera.captures, 1);
      expect(find.text('Đã lấy vị trí lúc chụp'), findsOneWidget);
      await tester.tap(find.text('Gửi ảnh'));
      await tester.pump();
      expect(repo.uploads, 1);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Đang gửi…'),
            )
            .onPressed,
        isNull,
      );
      repo.pending!.complete(repo.result);
      await tester.pumpAndSettle();
      expect(find.text('Ảnh cần thẩm định'), findsOneWidget);
      expect(find.text('Ảnh trùng với ảnh đã gửi trước đó.'), findsOneWidget);
      expect(find.text('Chưa có kết luận nhận diện cua.'), findsOneWidget);
      expect(find.text('Đã lưu bằng chứng'), findsNothing);
      expect(find.text('Cần kiểm tra'), findsOneWidget);
      expect(find.text('Đã gửi'), findsNothing);
      expect(repo.reads, 2);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'GPS permission denial and camera cancellation never send a photo',
    (tester) async {
      final repo = _Repository();
      final camera = _Camera()..deny = true;
      await _mount(tester, repo, camera);
      await tester.tap(find.text('Chụp'));
      await tester.pumpAndSettle();
      expect(find.text('Cần quyền vị trí để gửi bằng chứng.'), findsOneWidget);
      expect(find.text('Gửi ảnh'), findsNothing);
      expect(repo.uploads, 0);
      camera.deny = false;
      camera.cancel = true;
      await tester.tap(find.text('Chụp'));
      await tester.pumpAndSettle();
      expect(find.text('Gửi ảnh'), findsNothing);
      expect(repo.uploads, 0);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('upload errors retain the captured photo so the user can retry', (
    tester,
  ) async {
    final repo = _Repository()..failUpload = true;
    await _mount(tester, repo, _Camera());
    await tester.tap(find.text('Chụp'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gửi ảnh'));
    await tester.pumpAndSettle();
    expect(find.text('Hộp không còn được gán cho lô này.'), findsOneWidget);
    expect(find.text('Gửi ảnh'), findsOneWidget);
    expect(find.text('Chụp lại'), findsOneWidget);
    expect(find.text('Đã gửi'), findsNothing);
    expect(repo.reads, 1);
    repo.failUpload = false;
    await tester.tap(find.text('Gửi ảnh'));
    await tester.pumpAndSettle();
    expect(repo.uploads, 2);
    expect(find.text('Ảnh cần thẩm định'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'accepted upload marks the box from API and survives reopening the page',
    (tester) async {
      final repo = _Repository()..result = EvidenceResult.fromJson(_response());
      final camera = _Camera();
      await _mount(tester, repo, camera);
      expect(find.text('Đã gửi'), findsNothing);
      await tester.tap(find.text('Chụp'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Gửi ảnh'));
      await tester.pumpAndSettle();
      expect(find.text('Đã lưu bằng chứng'), findsOneWidget);
      expect(find.text('Đã gửi'), findsOneWidget);
      expect(repo.reads, 2);
      await tester.pumpWidget(const SizedBox());
      await _mount(tester, repo, camera);
      expect(find.text('Đã gửi'), findsOneWidget);
      expect(find.text('Đã lưu bằng chứng'), findsNothing);
      expect(repo.reads, 3);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('box API failure displays a retry instead of fake boxes', (
    tester,
  ) async {
    final repo = _Repository()..failRead = true;
    await _mount(tester, repo, _Camera());
    expect(find.text('Không tải được hộp nuôi.'), findsOneWidget);
    expect(find.text('0014'), findsNothing);
    repo.failRead = false;
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();
    expect(find.text('0014'), findsOneWidget);
    expect(repo.reads, 2);
    expect(tester.takeException(), isNull);
  });
}

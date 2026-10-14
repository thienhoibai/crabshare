import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crabshare_mobile/app/router.dart';
import 'package:crabshare_mobile/app/routes.dart';
import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/operator/data/alert_repository.dart';
import 'package:crabshare_mobile/features/operator/data/operator_models.dart';
import 'package:crabshare_mobile/features/operator/evidence/capture_requests_repository.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_explanation_page.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_explanation_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGN8AAAAASUVORK5CYII=',
);
Map<String, dynamic> _json({
  String? explanation,
  String status = 'Flagged',
  int id = 57,
}) => {
  'id': id,
  'batchCode': 'CS57-TEST',
  'slotCode': '0014',
  'mediaType': 'Photo',
  'reviewStatus': status,
  'riskScore': 100,
  'capturedAt': '2026-10-14T07:59:00Z',
  'receivedAt': '2026-10-14T08:00:00Z',
  'latitude': 10.1,
  'longitude': 106.1,
  'explanation': explanation,
  'explainedAt': explanation == null ? null : '2026-10-14T09:00:00Z',
  'canExplain': status == 'Flagged',
  'latestReview': {
    'verdict': 'NeedMoreEvidence',
    'note': 'Giải thích ảnh chụp cùng hộp',
    'reviewedAt': '2026-10-14T08:01:00Z',
  },
};
SessionState _session(int id) => SessionState(
  token: 'test',
  user: AppUser(
    userId: id,
    email: 'test@local',
    fullName: 'Test',
    roles: const [Roles.operatorMember],
    operatorId: id,
  ),
);

class _SwitchSession extends SessionController {
  _SwitchSession() : super(_session(1));
  void changeUser(int id) {
    state = _session(id);
  }
}

class _Repo implements EvidenceExplanationRepository {
  Map<String, dynamic> current = _json();
  bool failList = false, empty = false;
  int? failure;
  int writes = 0, reads = 0;
  String? sentText;
  Completer<void>? gate;
  @override
  Future<List<FlaggedEvidence>> list({CancelToken? cancelToken}) async {
    if (failList) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 503,
          data: {'detail': 'Không tải được bằng chứng.'},
        ),
      );
    }
    return empty ? [] : [FlaggedEvidence.fromJson(current)];
  }

  @override
  Future<FlaggedEvidence> get(int id, {CancelToken? cancelToken}) async {
    reads++;
    return FlaggedEvidence.fromJson(current);
  }

  @override
  Future<Uint8List> image(int id, {CancelToken? cancelToken}) async => _png;
  @override
  Future<FlaggedEvidence> explain(int id, String text) async {
    writes++;
    sentText = text;
    if (gate != null) await gate!.future;
    if (failure != null) {
      if (failure == 409) current = _json(status: 'Accepted');
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: failure,
          data: {'detail': 'Bằng chứng đã thay đổi.'},
        ),
      );
    }
    current = _json(explanation: text);
    return FlaggedEvidence.fromJson(current);
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
    if (requestStream != null) await requestStream.drain<void>();
    if (options.path.endsWith('/image')) {
      return ResponseBody.fromBytes(
        _png,
        200,
        headers: {
          Headers.contentTypeHeader: ['image/png'],
        },
      );
    }
    Object json;
    if (options.path == '/api/operators/me/evidence') {
      final page = options.queryParameters['page'] as int;
      json = {
        'items': page == 1
            ? [for (var i = 0; i < 100; i++) _json(id: 57 + i)]
            : [_json(id: 157)],
        'total': 101,
        'page': page,
        'pageSize': 100,
      };
    } else {
      json = _json(
        explanation: options.method == 'POST'
            ? (options.data as Map)['text'] as String
            : null,
      );
    }
    return ResponseBody.fromString(
      jsonEncode(json),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _Alerts implements AlertRepository {
  @override
  Future<List<AlertItem>> list() async => [];
  @override
  Future<AlertItem> acknowledge(int id, String note) =>
      throw UnimplementedError();
}

void main() {
  setUpAll(() => initializeDateFormatting('vi_VN'));
  test('repository uses every page, detail, private bytes and trimmed explanation API', () async {
    final adapter = _Adapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'))
      ..httpClientAdapter = adapter;
    final repo = ApiEvidenceExplanationRepository(dio);
    final list = await repo.list();
    expect(list.length, 101);
    expect(list.last.id, 157);
    expect(adapter.requests.take(2).map((r) => r.queryParameters['status']), [
      'Flagged',
      'Flagged',
    ]);
    expect((await repo.get(57)).reviewNote, 'Giải thích ảnh chụp cùng hộp');
    expect(await repo.image(57), _png);
    expect(
      (await repo.explain(57, '  Đã đối chiếu hộp 0014  ')).explanation,
      'Đã đối chiếu hộp 0014',
    );
    expect(adapter.requests.last.path, '/api/evidence/57/explanation');
    expect(adapter.requests.last.data, {'text': 'Đã đối chiếu hộp 0014'});
  });
  testWidgets(
    'Alerts opens flagged evidence then detail, blank text is rejected and save keeps Flagged',
    (tester) async {
      final repo = _Repo()..gate = Completer<void>();
      late GoRouter router;
      tester.view.physicalSize = const Size(360, 780);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      addTearDown(() => tester.pumpWidget(const SizedBox()));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionProvider.overrideWith(() => SessionController(_session(1))),
            evidenceExplanationRepositoryProvider.overrideWithValue(repo),
            alertRepositoryProvider.overrideWithValue(_Alerts()),
            captureRequestsProvider.overrideWith((ref) async => []),
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
      router.go(Routes.operatorAlerts);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bằng chứng bị gắn cờ'));
      await tester.pumpAndSettle();
      expect(router.state.uri.path, Routes.flaggedEvidence);
      await tester.tap(find.text('Hộp 0014 · #57'));
      await tester.pumpAndSettle();
      expect(router.state.uri.path, Routes.evidenceExplanation(57));
      expect(find.text('Giải thích ảnh chụp cùng hộp'), findsOneWidget);
      await tester.ensureVisible(find.text('Gửi giải trình'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Gửi giải trình'));
      await tester.pumpAndSettle();
      expect(find.text('Vui lòng nhập nội dung giải trình.'), findsOneWidget);
      expect(repo.writes, 0);
      await tester.enterText(
        find.byType(TextFormField),
        '  Đã đối chiếu hộp 0014  ',
      );
      await tester.ensureVisible(find.text('Gửi giải trình'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Gửi giải trình'));
      await tester.pump();
      expect(repo.writes, 1);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Đang gửi…'),
            )
            .onPressed,
        isNull,
      );
      repo.gate!.complete();
      await tester.pumpAndSettle();
      expect(repo.sentText, 'Đã đối chiếu hộp 0014');
      expect(
        find.text('Đã gửi giải trình. Bằng chứng đang chờ thẩm định.'),
        findsOneWidget,
      );
      expect(repo.current['reviewStatus'], 'Flagged');
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Gửi giải trình'),
            )
            .onPressed,
        isNull,
      );
      expect(tester.takeException(), isNull);
    },
  );
  for (final code in [400, 409]) {
    testWidgets(
      'HTTP $code keeps the draft and refreshes current eligibility',
      (tester) async {
        final repo = _Repo()..failure = code;
        addTearDown(() => tester.pumpWidget(const SizedBox()));
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              sessionProvider.overrideWith(
                () => SessionController(_session(1)),
              ),
              evidenceExplanationRepositoryProvider.overrideWithValue(repo),
            ],
            child: MaterialApp(
              theme: buildAppTheme(),
              home: const EvidenceExplanationPage(id: 57),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextFormField), 'Nội dung cần giữ');
        await tester.ensureVisible(find.text('Gửi giải trình'));
        await tester.tap(find.text('Gửi giải trình'));
        await tester.pumpAndSettle();
        expect(find.text('Bằng chứng đã thay đổi.'), findsOneWidget);
        expect(
          tester
              .widget<TextFormField>(find.byType(TextFormField))
              .controller!
              .text,
          'Nội dung cần giữ',
        );
        expect(
          tester
                  .widget<FilledButton>(
                    find.widgetWithText(FilledButton, 'Gửi giải trình'),
                  )
                  .onPressed ==
              null,
          code == 409,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('empty and failed lists show truthful retry states', (
    tester,
  ) async {
    final repo = _Repo()..failList = true;
    addTearDown(() => tester.pumpWidget(const SizedBox()));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          evidenceExplanationRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const FlaggedEvidencePage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Không tải được bằng chứng.'), findsOneWidget);
    repo.failList = false;
    repo.empty = true;
    await tester.tap(find.text('Thử lại'));
    await tester.pumpAndSettle();
    expect(find.text('Không có bằng chứng bị gắn cờ'), findsOneWidget);
    expect(find.text('Hộp 0014 · #57'), findsNothing);
  });
  testWidgets('switching users reloads evidence and clears the old draft', (
    tester,
  ) async {
    final repo = _Repo();
    final session = _SwitchSession();
    addTearDown(() => tester.pumpWidget(const SizedBox()));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionProvider.overrideWith(() => session),
          evidenceExplanationRepositoryProvider.overrideWithValue(repo),
        ],
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const EvidenceExplanationPage(id: 57),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'Bản nháp tài khoản cũ');
    session.changeUser(2);
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextFormField>(find.byType(TextFormField)).controller!.text,
      isEmpty,
    );
    expect(repo.reads, 2);
  });
}

import 'package:crabshare_mobile/core/api/api_client.dart';
import 'package:crabshare_mobile/core/auth/session.dart';
import 'package:crabshare_mobile/features/operator/data/api_operator_repository.dart';
import 'package:crabshare_mobile/features/operator/data/operator_models.dart';
import 'package:crabshare_mobile/features/operator/data/operator_repository.dart';
import 'package:crabshare_mobile/shared/models/batch_enums.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/discovery_fakes.dart';
import 'helpers/production_fakes.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'history maps exact precision, actor, source and immutable threshold version',
    () async {
      final repo = ApiOperatorRepository(
        discoveryDio((request) {
          expect(request.path, '/api/operators/me/production-logs');
          expect(request.queryParameters['from'], '2026-10-01');
          expect(request.queryParameters['to'], '2026-10-21');
          return jsonResponse(
            productionPage([
              productionLogJson(),
              productionLogJson(legacy: true),
            ], total: 2),
          );
        }),
      );
      final logs = await repo.logs(
        from: DateTime(2026, 10, 1),
        to: DateTime(2026, 10, 21),
      );
      expect(logs.first.logDate, DateTime(2026, 10, 21));
      expect(logs.first.feedKg, 1.234);
      expect(logs.first.salinityPpt, 17.3);
      expect(logs.first.recordedBy, 7);
      expect(logs.first.source, 'Manual');
      expect(logs.first.flag, PlausibilityFlag.outOfRange);
      expect(logs.first.thresholdVersion, 2);
      expect(logs.first.thresholdsApplied!.waterTempMinC, -2.5);
      expect(logs.last.flag, PlausibilityFlag.inconsistent);
      expect(logs.last.thresholdsApplied, isNull);
    },
  );

  test(
    'active batches loads every page and retains Harvesting for harvest callers',
    () async {
      final pages = <int>[];
      final repo = ApiOperatorRepository(
        discoveryDio((request) {
          final page = request.queryParameters['page'] as int;
          pages.add(page);
          return jsonResponse({
            'items': [
              productionBatchJson(status: page == 1 ? 'Stocked' : 'Harvesting'),
            ],
            'page': page,
            'pageSize': 1,
            'total': 2,
          });
        }),
      );
      final batches = await repo.activeBatches();
      expect(pages, [1, 2]);
      expect(batches.last.status, BatchStatus.harvesting);
      expect(batches.last.businessDate, DateTime(2026, 10, 21));
    },
  );

  test(
    'today progress counts real daily logs in both recording statuses',
    () async {
      final server = ProductionServer()
        ..batches = [
          productionBatchJson(status: 'Stocked', loggedToday: true),
          productionBatchJson(loggedToday: true),
          productionBatchJson(status: 'Harvesting', configured: false),
        ];
      final summary = await ApiOperatorRepository(server.dio()).todaySummary();
      expect(summary.done, 1);
      expect(summary.total, 2);
      expect(summary.businessDate, DateTime(2026, 10, 21));
    },
  );

  test(
    'submit sends only measurement contract and preserves server conflict',
    () async {
      final repo = ApiOperatorRepository(
        discoveryDio((request) {
          expect(request.method, 'POST');
          expect(request.path, '/api/batches/REAL-01/production-logs');
          expect(request.data, {
            'ph': 8.3,
            'waterTempC': -1.2,
            'salinityPpt': 17.3,
            'feedKg': 1.234,
            'note': null,
          });
          return jsonResponse({
            'code': 'production.log_exists',
            'detail': 'Đã ghi hôm nay.',
          }, 409);
        }),
      );
      await expectLater(
        repo.submitLog(
          const DailyLogInput(
            batchCode: 'REAL-01',
            ph: 8.3,
            waterTempC: -1.2,
            salinityPpt: 17.3,
            feedKg: 1.234,
          ),
        ),
        throwsA(
          isA<DioException>().having(
            (error) => error.response?.statusCode,
            'status',
            409,
          ),
        ),
      );
    },
  );

  test(
    'threshold contract uses server permissions and expected version without defaults',
    () async {
      final server = ProductionServer()..canConfigure = false;
      final repo = ApiOperatorRepository(server.dio());
      final config = await repo.thresholds('REAL-01');
      expect(config.canConfigure, isFalse);
      expect(config.businessDate, DateTime(2026, 10, 21));
      expect(config.current!.salinityMaxPpt, 17.3);
      await repo.saveThresholds(
        'REAL-01',
        const ProductionThresholdInput(
          expectedVersionNo: 2,
          phMin: 6.1,
          phMax: 8.2,
          waterTempMinC: -2.5,
          waterTempMaxC: 31.7,
          salinityMinPpt: 5.3,
          salinityMaxPpt: 17.3,
        ),
      );
      final put = server.requests.last;
      expect(put.method, 'PUT');
      expect(put.data, {
        'expectedVersionNo': 2,
        'phMin': 6.1,
        'phMax': 8.2,
        'waterTempMinC': -2.5,
        'waterTempMaxC': 31.7,
        'salinityMinPpt': 5.3,
        'salinityMaxPpt': 17.3,
      });
    },
  );

  test('failed daily API never falls back to sample records', () async {
    final repo = ApiOperatorRepository(
      discoveryDio((_) => jsonResponse({'detail': 'Unavailable'}, 503)),
    );
    await expectLater(repo.logs(), throwsA(isA<DioException>()));
    await expectLater(repo.activeBatches(), throwsA(isA<DioException>()));
  });

  test('account change reloads daily providers and thresholds', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final server = ProductionServer()..logs = [productionLogJson()];
    final container = ProviderContainer(
      overrides: [dioProvider.overrideWithValue(server.dio())],
    );
    addTearDown(container.dispose);
    final subscriptions = [
      container.listen(dailyLogsProvider, (_, _) {}),
      container.listen(activeBatchesProvider, (_, _) {}),
      container.listen(todaySummaryProvider, (_, _) {}),
      container.listen(productionThresholdsProvider('REAL-01'), (_, _) {}),
    ];
    addTearDown(() {
      for (final subscription in subscriptions) {
        subscription.close();
      }
    });
    await container.read(dailyLogsProvider.future);
    await container.read(activeBatchesProvider.future);
    await container.read(todaySummaryProvider.future);
    await container.read(productionThresholdsProvider('REAL-01').future);
    server.requests.clear();
    server.logs = [];
    await container
        .read(sessionProvider.notifier)
        .signIn(
          'another-token',
          const AppUser(
            userId: 22,
            email: 'b@test.local',
            fullName: 'B',
            roles: [Roles.operatorMember],
            operatorId: 2,
          ),
        );
    expect(await container.read(dailyLogsProvider.future), isEmpty);
    await container.read(activeBatchesProvider.future);
    await container.read(todaySummaryProvider.future);
    await container.read(productionThresholdsProvider('REAL-01').future);
    expect(
      server.requests.where((r) => r.path.endsWith('/production-logs')),
      hasLength(1),
    );
    expect(
      server.requests.where((r) => r.path.endsWith('/production-thresholds')),
      hasLength(1),
    );
  });
}

import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:crabshare_mobile/features/operator/slot_events/slot_event_repository.dart';
import 'package:crabshare_mobile/features/operator/slot_events/slot_events_page.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:dio/dio.dart';

import 'dart:convert';

import 'package:crabshare_mobile/features/operator/evidence/evidence_camera.dart';
import 'package:crabshare_mobile/features/operator/evidence/evidence_repository.dart';

import 'helpers/discovery_fakes.dart';

import 'helpers/slot_event_fixtures.dart';

Future<void> mount(
  WidgetTester tester, {
  bool vacant = false,
  bool configured = true,
  SlotEventRepository? repository,
  EvidenceCamera? camera,
  EvidenceRepository? evidence,
}) async {
  tester.view.physicalSize = const Size(360, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        if (camera != null) evidenceCameraProvider.overrideWithValue(camera),
        if (evidence != null)
          evidenceRepositoryProvider.overrideWithValue(evidence),
        slotEventRepositoryProvider.overrideWithValue(
          repository ??
              ApiSlotEventRepository(
                slotEventDio(vacant: vacant, configured: configured),
              ),
        ),
      ],
      child: MaterialApp(
        theme: buildAppTheme(),
        home: const SlotEventsPage(batchCode: 'VI09'),
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('source-slot')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('0014').last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'Mortality requires fresh in-app camera; Relocated exposes destination',
    (tester) async {
      await mount(tester);
      await tester.tap(find.text('Cua chết'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Chụp ảnh tại hộp'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Chụp ảnh tại hộp'), findsOneWidget);
      expect(find.byKey(const ValueKey('replacement-crab')), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Chuyển hộp'),
        -180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Chuyển hộp'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('destination-slot')), findsOneWidget);
      expect(find.text('Chụp ảnh tại hộp'), findsNothing);
    },
  );
  testWidgets(
    'Restocked selects explicit dead individual and shows farm formula/deadline',
    (tester) async {
      await mount(tester, vacant: true);
      await tester.tap(find.text('Thả bù'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('replacement-crab')), findsOneWidget);
      expect(find.textContaining('30/10/2026'), findsWidgets);
      expect(
        find.textContaining('4 ngày trước ngày dự kiến thu hoạch'),
        findsOneWidget,
      );
      expect(find.textContaining('12 con đang nuôi'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Chụp ảnh tại hộp'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Chụp ảnh tại hộp'), findsOneWidget);
    },
  );
  testWidgets(
    'missing farm policy explains web configuration and disables restock',
    (tester) async {
      await mount(tester, vacant: true, configured: false);
      await tester.tap(find.text('Thả bù'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Owner cấu hình trên web'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('save-slot-event')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      final save = tester.widget<FilledButton>(
        find.byKey(const ValueKey('save-slot-event')),
      );
      expect(save.onPressed, isNull);
    },
  );
  testWidgets(
    'lost response retries identical event even after occupant changes',
    (tester) async {
      final repository = _LostResponseRepository();
      await mount(tester, repository: repository);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('save-slot-event')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byKey(const ValueKey('save-slot-event')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xác nhận'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('save-slot-event')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester
            .widget<FilledButton>(find.byKey(const ValueKey('save-slot-event')))
            .onPressed,
        isNotNull,
      );
      await tester.tap(find.byKey(const ValueKey('save-slot-event')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Xác nhận'));
      await tester.pumpAndSettle();
      expect(repository.inputs.length, 2);
      expect(repository.inputs[0].toJson(), repository.inputs[1].toJson());
    },
  );
  testWidgets(
    'fresh camera photo uploads then restock posts returned evidence id and refreshes occupant',
    (tester) async {
      final camera = _Camera();
      final repository = _RestockedRepository();
      var uploads = 0;
      final evidence = ApiEvidenceRepository(
        discoveryDio((request) {
          uploads++;
          final fields = Map.fromEntries((request.data as FormData).fields);
          expect(fields['slotCode'], '0014');
          expect(fields['batchCode'], 'VI09');
          expect(fields['slotEventType'], 'Restocked');
          return jsonResponse({
            'id': 44,
            'reviewStatus': 'Pending',
            'duplicateMatch': 'None',
            'receivedAt': '2026-10-20T01:00:00Z',
            'detection': {'modelVersion': 'none'},
          }, 201);
        }),
      );
      await mount(
        tester,
        vacant: true,
        repository: repository,
        camera: camera,
        evidence: evidence,
      );
      await tester.tap(find.text('Thả bù'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('replacement-crab')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byKey(const ValueKey('replacement-crab')));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('dead-9').last);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Chụp ảnh tại hộp'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Chụp ảnh tại hộp'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('save-slot-event')),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byKey(const ValueKey('save-slot-event')));
      await tester.pumpAndSettle();
      expect(uploads, 0);
      await tester.tap(find.text('Xác nhận'));
      await tester.pumpAndSettle();
      expect(camera.captures, 1);
      expect(uploads, 1);
      expect(repository.saved?.eventType, SlotEventType.restocked);
      expect(repository.saved?.evidenceId, 44);
      expect(repository.saved?.replacesCrabItemId, 9);
      expect(tester.takeException(), isNull);
    },
  );
}

class _LostResponseRepository extends ApiSlotEventRepository {
  _LostResponseRepository() : super(slotEventDio());
  final inputs = <SlotEventInput>[];
  @override
  Future<SlotEventContext> context(String batchCode, String slotCode) async =>
      SlotEventContext.fromJson(slotContextJson(vacant: inputs.isNotEmpty));
  @override
  Future<SlotEvent> record(String batchCode, SlotEventInput input) async {
    inputs.add(input);
    if (inputs.length == 1) {
      throw DioException(
        requestOptions: RequestOptions(),
        type: DioExceptionType.receiveTimeout,
      );
    }
    return SlotEvent.fromJson(slotEventJson());
  }
}

class _Camera implements EvidenceCamera {
  int captures = 0;
  @override
  Future<EvidencePhoto?> capture() async {
    captures++;
    return EvidencePhoto(
      bytes: base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
      ),
      capturedAt: DateTime.now().toUtc(),
      latitude: 10,
      longitude: 106,
    );
  }

  @override
  Future<void> openSettings() async {}
}

class _RestockedRepository extends ApiSlotEventRepository {
  _RestockedRepository() : super(slotEventDio(vacant: true));
  SlotEventInput? saved;
  @override
  Future<SlotEventContext> context(String batchCode, String slotCode) async =>
      SlotEventContext.fromJson({
        ...slotContextJson(vacant: saved == null),
        if (saved != null) 'replacementCandidates': [],
      });
  @override
  Future<SlotEvent> record(String batchCode, SlotEventInput input) async {
    saved = input;
    return SlotEvent.fromJson({...slotEventJson(), 'eventType': 'Restocked'});
  }
}

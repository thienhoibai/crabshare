import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/capture/captured_photo.dart';
import 'grading_models.dart';
import 'qc_models.dart';
import 'qc_repository.dart';

abstract interface class GradingRepository {
  Future<GradingSummary> summary(String batchCode);

  /// Quyết định hiện hành của mọi con cua trong Lô.
  Future<List<GradeDecision>> decisions(String batchCode);

  /// Mọi phiên bản quyết định của một con cua, cũ trước.
  Future<List<GradeDecision>> crabHistory(String crabCode);
  Future<SessionMeasurements> measurements(String sessionNo);
  Future<CrabUnit> crab(String crabCode);
  Future<List<GradeRuleSet>> ruleSets();

  Future<GradeDecision> approve(String decisionNo, {String? finalGrade, String? sensoryNote, String? reason});
  Future<GradeDecision> hold(String decisionNo, String reason);
  Future<GradeDecision> confirmHold(String decisionNo);
  Future<GradeDecision> reject(
    String decisionNo, {
    required String liveStatus,
    required String foodSafety,
    required String reason,
    required CapturedPhoto photo,
  });
  Future<GradeDecision> revise(
    String decisionNo, {
    required String finalSize,
    required String finalGrade,
    required String reason,
    required CapturedPhoto photo,
  });

  /// Nhập số thước kẹp cho lượt đo; máy chủ tính lại đề xuất.
  Future<SessionMeasurements> caliper(String sessionNo, {double? lengthCm, double? widthCm, double? edgeBandMm});
}

class ApiGradingRepository implements GradingRepository {
  ApiGradingRepository(this.dio);
  final Dio dio;

  static String _batch(String code) => '/api/batches/${Uri.encodeComponent(code)}';
  static String _decision(String no) => '/api/grade-decisions/${Uri.encodeComponent(no)}';
  static String _session(String no) => '/api/measurement-sessions/${Uri.encodeComponent(no)}';
  static String _crab(String code) => '/api/crab-units/${Uri.encodeComponent(code)}';

  @override
  Future<GradingSummary> summary(String batchCode) async => GradingSummary.fromJson(await dio.getJson('${_batch(batchCode)}/grading'));

  @override
  Future<List<GradeDecision>> decisions(String batchCode) async =>
      [for (final j in await dio.getList('${_batch(batchCode)}/grade-decisions')) GradeDecision.fromJson(j)];

  @override
  Future<List<GradeDecision>> crabHistory(String crabCode) async =>
      [for (final j in await dio.getList('${_crab(crabCode)}/grade-decisions')) GradeDecision.fromJson(j)];

  @override
  Future<SessionMeasurements> measurements(String sessionNo) async =>
      SessionMeasurements.fromJson(await dio.getJson('${_session(sessionNo)}/measurements'));

  @override
  Future<CrabUnit> crab(String crabCode) async => CrabUnit.fromJson(await dio.getJson(_crab(crabCode)));

  @override
  Future<List<GradeRuleSet>> ruleSets() async => [
    for (final standard in await dio.getList('/api/grading/standards'))
      for (final set in asJsonList(standard['ruleSets'])) GradeRuleSet.fromJson(set),
  ];

  @override
  Future<GradeDecision> approve(String decisionNo, {String? finalGrade, String? sensoryNote, String? reason}) async => GradeDecision.fromJson(
    await dio.postJson('${_decision(decisionNo)}/approve', data: {'finalGrade': finalGrade, 'sensoryNote': sensoryNote, 'reason': reason}),
  );

  @override
  Future<GradeDecision> hold(String decisionNo, String reason) async =>
      GradeDecision.fromJson(await dio.postJson('${_decision(decisionNo)}/hold', data: {'reason': reason}));

  @override
  Future<GradeDecision> confirmHold(String decisionNo) async =>
      GradeDecision.fromJson(await dio.postJson('${_decision(decisionNo)}/confirm-hold'));

  @override
  Future<GradeDecision> reject(
    String decisionNo, {
    required String liveStatus,
    required String foodSafety,
    required String reason,
    required CapturedPhoto photo,
  }) async => GradeDecision.fromJson(
    await dio.postJson(
      '${_decision(decisionNo)}/reject',
      data: FormData.fromMap({'LiveStatus': liveStatus, 'FoodSafety': foodSafety, 'Reason': reason, 'Photo': photoPart(photo)}),
    ),
  );

  @override
  Future<GradeDecision> revise(
    String decisionNo, {
    required String finalSize,
    required String finalGrade,
    required String reason,
    required CapturedPhoto photo,
  }) async => GradeDecision.fromJson(
    await dio.postJson(
      '${_decision(decisionNo)}/revise',
      data: FormData.fromMap({'FinalSize': finalSize, 'FinalGrade': finalGrade, 'Reason': reason, 'Photo': photoPart(photo)}),
    ),
  );

  @override
  Future<SessionMeasurements> caliper(String sessionNo, {double? lengthCm, double? widthCm, double? edgeBandMm}) async =>
      SessionMeasurements.fromJson(
        await dio.postJson(
          '${_session(sessionNo)}/values',
          data: {'carapaceLengthCm': lengthCm, 'carapaceWidthCm': widthCm, 'edgeBandMm': edgeBandMm},
        ),
      );
}

final gradingRepositoryProvider = Provider<GradingRepository>((ref) => ApiGradingRepository(ref.watch(dioProvider)));

final gradingSummaryProvider = FutureProvider.autoDispose.family<GradingSummary, String>(
  (ref, batchCode) => ref.watch(gradingRepositoryProvider).summary(batchCode),
  retry: (_, _) => null,
);

final sessionMeasurementsProvider = FutureProvider.autoDispose.family<SessionMeasurements, String>(
  (ref, sessionNo) => ref.watch(gradingRepositoryProvider).measurements(sessionNo),
  retry: (_, _) => null,
);

final crabUnitProvider = FutureProvider.autoDispose.family<CrabUnit, String>(
  (ref, crabCode) => ref.watch(gradingRepositoryProvider).crab(crabCode),
  retry: (_, _) => null,
);

final crabHistoryProvider = FutureProvider.autoDispose.family<List<GradeDecision>, String>(
  (ref, crabCode) => ref.watch(gradingRepositoryProvider).crabHistory(crabCode),
  retry: (_, _) => null,
);

/// Chuẩn phân hạng ít đổi nên giữ suốt phiên làm việc.
final gradeRuleSetsProvider = FutureProvider<List<GradeRuleSet>>(
  (ref) => ref.watch(gradingRepositoryProvider).ruleSets(),
  retry: (_, _) => null,
);

/// Quyết định hiện hành của một Lô. Sau mỗi thao tác, kết quả máy chủ trả về được ghép ngay vào danh sách.
class GradeDecisionsController extends AsyncNotifier<List<GradeDecision>> {
  GradeDecisionsController(this.batchCode);
  final String batchCode;

  @override
  Future<List<GradeDecision>> build() => ref.watch(gradingRepositoryProvider).decisions(batchCode);

  /// Thay quyết định hiện hành của đúng con cua đó (đổi hạng và nhập thước kẹp tạo mã quyết định mới).
  void apply(GradeDecision updated) {
    final list = state.value;
    if (!ref.mounted || list == null) return;
    final found = list.any((d) => d.crabCode == updated.crabCode);
    state = AsyncData([
      for (final d in list) d.crabCode == updated.crabCode ? updated : d,
      if (!found) updated,
    ]);
  }
}

final gradeDecisionsProvider = AsyncNotifierProvider.autoDispose.family<GradeDecisionsController, List<GradeDecision>, String>(
  GradeDecisionsController.new,
  retry: (_, _) => null,
);

/// Ghép kết quả của một thao tác vào màn hình và làm mới các số liên quan.
void applyDecision(WidgetRef ref, String batchCode, GradeDecision updated) {
  ref.read(gradeDecisionsProvider(batchCode).notifier).apply(updated);
  ref.invalidate(gradingSummaryProvider(batchCode));
  ref.invalidate(crabHistoryProvider(updated.crabCode));
  ref.invalidate(qcTasksProvider);
}

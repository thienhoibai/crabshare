import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/auth/session.dart';
import 'measure_models.dart';
import 'work_common.dart';

/// Đo cua tại trạm: bắt đầu thu hoạch, mở lượt đo bằng mã cua, theo dõi kết quả, nhập số đo tay.
/// Người nuôi chỉ đo và xem; Nhân viên kiểm phẩm duyệt hạng cuối.
abstract interface class MeasureRepository {
  Future<WorkBatch> batch(String batchCode);
  Future<GradingSummary> summary(String batchCode);
  Future<List<GradeDecision>> decisions(String batchCode);

  /// Cua còn chờ đo: [inventoryStatus] là Holding (đang ở hộp) hoặc Received (Lô không lưu nuôi).
  Future<List<WaitingCrab>> waitingCrabs(String batchCode, String inventoryStatus);
  Future<List<Station>> stations();
  Future<void> startHarvest(String batchCode);

  /// Mở lượt đo trước khi đặt cua lên trạm. [stationCode] null thì đo tay bằng cân và thước kẹp.
  Future<MeasureSession> openSession({required String crabCode, String? stationCode});
  Future<SessionDetail> session(String sessionNo);
  Future<void> cancelSession(String sessionNo);
  Future<SessionDetail> recordValues(String sessionNo, ManualValues values);

  /// Chạy lại xử lý lượt đo đã nhận bản tin của trạm mà chưa có số đo.
  Future<SessionDetail> reprocess(String sessionNo);
}

final measureRepositoryProvider = Provider<MeasureRepository>((ref) => ApiMeasureRepository(ref.watch(dioProvider)));

class ApiMeasureRepository implements MeasureRepository {
  ApiMeasureRepository(this.dio);
  final Dio dio;

  static String _batch(String code) => '/api/batches/${Uri.encodeComponent(code)}';
  static String _session(String no) => '/api/measurement-sessions/${Uri.encodeComponent(no)}';

  @override
  Future<WorkBatch> batch(String batchCode) async =>
      WorkBatch.fromJson(await dio.getJson('/api/operators/me/batches/${Uri.encodeComponent(batchCode)}'));

  @override
  Future<GradingSummary> summary(String batchCode) async =>
      GradingSummary.fromJson(await dio.getJson('${_batch(batchCode)}/grading'));

  @override
  Future<List<GradeDecision>> decisions(String batchCode) async => [
    for (final j in await dio.getList('${_batch(batchCode)}/grade-decisions')) GradeDecision.fromJson(j),
  ];

  @override
  Future<List<WaitingCrab>> waitingCrabs(String batchCode, String inventoryStatus) async => [
    for (final j in await dio.getList('${_batch(batchCode)}/crab-units', query: {'status': inventoryStatus}))
      WaitingCrab.fromJson(j),
  ];

  @override
  Future<List<Station>> stations() async => [
    for (final j in await dio.getList('/api/operators/me/devices'))
      if (j['deviceType'] == 'Station' && j['status'] != 'Removed') Station.fromJson(j),
  ];

  @override
  Future<void> startHarvest(String batchCode) => dio.postJson('${_batch(batchCode)}/start-harvest');

  @override
  Future<MeasureSession> openSession({required String crabCode, String? stationCode}) async => MeasureSession.fromJson(
    await dio.postJson(
      '/api/measurement-sessions',
      data: {'crabCode': crabCode, 'procedure': stationCode == null ? 'Manual' : 'Station', 'stationCode': stationCode},
    ),
  );

  @override
  Future<SessionDetail> session(String sessionNo) async =>
      SessionDetail.fromJson(await dio.getJson('${_session(sessionNo)}/measurements'));

  @override
  Future<void> cancelSession(String sessionNo) => dio.postJson('${_session(sessionNo)}/cancel');

  @override
  Future<SessionDetail> recordValues(String sessionNo, ManualValues values) async =>
      SessionDetail.fromJson(await dio.postJson('${_session(sessionNo)}/values', data: values.toJson()));

  @override
  Future<SessionDetail> reprocess(String sessionNo) async =>
      SessionDetail.fromJson(await dio.postJson('${_session(sessionNo)}/process'));
}

/// Lượt đo đang xem của một Lô: mã lượt đo và hộp của con cua (nếu mở từ danh sách chọn cua).
typedef ActiveSession = ({String sessionNo, String? slotCode});

/// Giữ lượt đo đang xem của từng Lô trong suốt phiên chạy app. Máy chủ không có API tìm lượt đo đang mở của trạm,
/// nên rời màn đo cua rồi quay lại vẫn phải thấy lượt đang mở để đo tiếp hoặc huỷ.
class ActiveSessions extends Notifier<Map<String, ActiveSession>> {
  @override
  Map<String, ActiveSession> build() {
    ref.watch(sessionProvider.select((s) => s.user?.userId));
    return const {};
  }

  void show(String batchCode, String sessionNo, {String? slotCode}) =>
      state = {...state, batchCode: (sessionNo: sessionNo, slotCode: slotCode)};

  void close(String batchCode) => state = {...state}..remove(batchCode);
}

final activeSessionsProvider = NotifierProvider<ActiveSessions, Map<String, ActiveSession>>(ActiveSessions.new);

/// Dữ liệu của màn đo cua cho một Lô. Làm mới bằng `ref.invalidate(measureBoardProvider(code))`.
final measureBoardProvider = FutureProvider.autoDispose.family<MeasureBoard, String>((ref, batchCode) async {
  final repo = ref.watch(measureRepositoryProvider);
  final batch = await repo.batch(batchCode);
  final (summary, decisions, crabs, stations) = await (
    repo.summary(batchCode),
    repo.decisions(batchCode),
    batch.canMeasure ? repo.waitingCrabs(batchCode, batch.waitingCrabStatus) : Future.value(const <WaitingCrab>[]),
    batch.canMeasure ? repo.stations() : Future.value(const <Station>[]),
  ).wait;
  return MeasureBoard(batch: batch, summary: summary, decisions: decisions, crabs: crabs, stations: stations);
}, retry: (_, _) => null);

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/capture/captured_photo.dart';
import '../evidence/evidence_repository.dart';
import 'alert_repository.dart';
import 'holding_models.dart';
import 'operator_repository.dart';

/// Lưu nuôi trong hộp: sơ đồ hộp của Lô, từng con cua, xếp hộp, thả bù, sự kiện, chuyển hộp.
abstract interface class HoldingRepository {
  Future<List<BoxState>> boxes(String batchCode);
  Future<List<CrabUnit>> crabs(String batchCode);

  /// Đợt lưu nuôi của Lô; null khi Lô chưa thả con nào.
  Future<Holding?> holding(String batchCode);
  Future<CrabUnit> crab(String crabCode);

  /// Hộp trống của trại, lọc theo số hộp.
  Future<List<BoxState>> freeBoxes({String search = ''});

  /// Xếp một con vừa nhận vào hộp trống; [replacesCrabCode] khác null là thả bù thay con đã chết ở đúng hộp đó.
  Future<CrabUnit> assign({
    required String batchCode,
    required String crabCode,
    required String slotCode,
    required int evidenceId,
    String? replacesCrabCode,
  });

  /// [eventType]: Died (bắt buộc có [evidenceId]), Molted, AbnormalFeeding, Inspected.
  Future<CrabUnit> recordEvent(String crabCode, {required String eventType, int? evidenceId, String? note});
  Future<CrabUnit> move(String crabCode, {required String slotCode, String? reason});
}

class ApiHoldingRepository implements HoldingRepository {
  ApiHoldingRepository(this.dio);
  final Dio dio;

  static String _batch(String code) => '/api/batches/${Uri.encodeComponent(code)}';
  static String _crab(String code) => '/api/crab-units/${Uri.encodeComponent(code)}';

  @override
  Future<List<BoxState>> boxes(String batchCode) async => [for (final b in await dio.getList('${_batch(batchCode)}/boxes')) BoxState.fromJson(b)];

  @override
  Future<List<CrabUnit>> crabs(String batchCode) async => [
    for (final c in await dio.getList('${_batch(batchCode)}/crab-units')) CrabUnit.fromJson(c),
  ];

  @override
  Future<Holding?> holding(String batchCode) async {
    try {
      return Holding.fromJson(await dio.getJson('${_batch(batchCode)}/holding'));
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  @override
  Future<CrabUnit> crab(String crabCode) async => CrabUnit.fromJson(await dio.getJson(_crab(crabCode)));

  @override
  Future<List<BoxState>> freeBoxes({String search = ''}) async {
    final page = await dio.getJson('/api/boxes', query: {'status': 'Available', 'search': search.trim(), 'page': 1, 'pageSize': 60});
    return [for (final b in asJsonList(page['items'])) BoxState.fromJson(b)];
  }

  @override
  Future<CrabUnit> assign({
    required String batchCode,
    required String crabCode,
    required String slotCode,
    required int evidenceId,
    String? replacesCrabCode,
  }) async => CrabUnit.fromJson(
    await dio.postJson(
      '${_batch(batchCode)}/box-assignments',
      data: {'crabCode': crabCode, 'slotCode': slotCode, 'evidenceId': evidenceId, 'replacesCrabCode': replacesCrabCode},
    ),
  );

  @override
  Future<CrabUnit> recordEvent(String crabCode, {required String eventType, int? evidenceId, String? note}) async => CrabUnit.fromJson(
    await dio.postJson('${_crab(crabCode)}/events', data: {'eventType': eventType, 'evidenceId': evidenceId, 'note': _blankToNull(note)}),
  );

  @override
  Future<CrabUnit> move(String crabCode, {required String slotCode, String? reason}) async =>
      CrabUnit.fromJson(await dio.postJson('${_crab(crabCode)}/move', data: {'slotCode': slotCode, 'reason': _blankToNull(reason)}));

  static String? _blankToNull(String? text) => text == null || text.trim().isEmpty ? null : text.trim();
}

final holdingRepositoryProvider = Provider<HoldingRepository>((ref) => ApiHoldingRepository(ref.watch(dioProvider)));

final batchBoxesProvider = FutureProvider.autoDispose.family<List<BoxState>, String>((ref, code) {
  ref.watch(farmAccountProvider);
  return ref.watch(holdingRepositoryProvider).boxes(code);
}, retry: (_, _) => null);

final batchCrabsProvider = FutureProvider.autoDispose.family<List<CrabUnit>, String>((ref, code) {
  ref.watch(farmAccountProvider);
  return ref.watch(holdingRepositoryProvider).crabs(code);
}, retry: (_, _) => null);

final batchHoldingProvider = FutureProvider.autoDispose.family<Holding?, String>((ref, code) {
  ref.watch(farmAccountProvider);
  return ref.watch(holdingRepositoryProvider).holding(code);
}, retry: (_, _) => null);

final crabProvider = FutureProvider.autoDispose.family<CrabUnit, String>((ref, crabCode) {
  ref.watch(farmAccountProvider);
  return ref.watch(holdingRepositoryProvider).crab(crabCode);
}, retry: (_, _) => null);

final freeBoxesProvider = FutureProvider.autoDispose.family<List<BoxState>, String>((ref, search) {
  ref.watch(farmAccountProvider);
  return ref.watch(holdingRepositoryProvider).freeBoxes(search: search);
}, retry: (_, _) => null);

/// Thao tác tại hộp. Thao tác cần ảnh thì gửi ảnh trước để lấy mã bằng chứng rồi mới ghi; xong thì tải lại dữ liệu của Lô.
class BoxActions {
  BoxActions(this._ref);
  final Ref _ref;

  // Ảnh vừa gửi: bước ghi lỗi mà người dùng bấm lại với cùng ảnh, cùng hộp thì không gửi ảnh lần hai (ảnh trùng sẽ bị gắn cờ).
  (CapturedPhoto, String, int)? _lastUpload;

  Future<int> _photoId({required String batchCode, required String slotCode, required CapturedPhoto photo, required bool boxing}) async {
    final last = _lastUpload;
    if (last != null && identical(last.$1, photo) && last.$2 == slotCode) return last.$3;
    final evidence = await _ref.read(evidenceRepositoryProvider).upload(batchCode: batchCode, slotCode: slotCode, photo: photo, boxing: boxing);
    _lastUpload = (photo, slotCode, evidence.id);
    return evidence.id;
  }

  Future<void> assign({
    required String batchCode,
    required String crabCode,
    required String slotCode,
    required CapturedPhoto photo,
    String? replacesCrabCode,
  }) async {
    final evidenceId = await _photoId(batchCode: batchCode, slotCode: slotCode, photo: photo, boxing: true);
    await _ref
        .read(holdingRepositoryProvider)
        .assign(batchCode: batchCode, crabCode: crabCode, slotCode: slotCode, evidenceId: evidenceId, replacesCrabCode: replacesCrabCode);
    _refresh(batchCode);
  }

  Future<void> reportDead({
    required String batchCode,
    required String crabCode,
    required String slotCode,
    required CapturedPhoto photo,
    String? note,
  }) async {
    final evidenceId = await _photoId(batchCode: batchCode, slotCode: slotCode, photo: photo, boxing: false);
    await _ref.read(holdingRepositoryProvider).recordEvent(crabCode, eventType: 'Died', evidenceId: evidenceId, note: note);
    _refresh(batchCode);
  }

  /// [eventType]: Molted, AbnormalFeeding hoặc Inspected.
  Future<void> record({required String batchCode, required String crabCode, required String eventType, String? note}) async {
    await _ref.read(holdingRepositoryProvider).recordEvent(crabCode, eventType: eventType, note: note);
    _refresh(batchCode);
  }

  Future<void> move({required String batchCode, required String crabCode, required String slotCode, String? reason}) async {
    await _ref.read(holdingRepositoryProvider).move(crabCode, slotCode: slotCode, reason: reason);
    _refresh(batchCode);
  }

  void _refresh(String batchCode) {
    if (!_ref.mounted) return;
    _ref.invalidate(batchBoxesProvider(batchCode));
    _ref.invalidate(batchCrabsProvider(batchCode));
    _ref.invalidate(batchHoldingProvider(batchCode));
    _ref.invalidate(operatorBatchProvider(batchCode));
    _ref.invalidate(operatorBatchesProvider);
    _ref.invalidate(freeBoxesProvider);
    _ref.invalidate(crabProvider);
    // Cua chết nhiều có thể sinh cảnh báo mới.
    _ref.invalidate(alertsProvider);
    _ref.invalidate(operatorDashboardProvider);
  }
}

final boxActionsProvider = Provider<BoxActions>(BoxActions.new);

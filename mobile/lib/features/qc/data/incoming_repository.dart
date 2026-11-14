import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import 'qc_models.dart';
import 'qc_repository.dart';

/// Phiếu nhận hàng của một lô nguồn, kèm số con đã kiểm.
class GoodsReceipt {
  const GoodsReceipt({
    required this.receiptNo,
    required this.poNo,
    required this.lotCode,
    required this.originRegion,
    required this.declaredCount,
    required this.declaredWeightKg,
    required this.receivedAt,
    required this.status,
    required this.acceptedCount,
    required this.rejectedCount,
    this.harvestedOn,
    this.qcUserId,
  });
  final String receiptNo;
  final String poNo;
  final String lotCode;
  final String originRegion;
  final DateTime? harvestedOn;
  final int declaredCount;
  final double declaredWeightKg;
  final DateTime receivedAt;
  final String status;
  final int acceptedCount;
  final int rejectedCount;
  final int? qcUserId;

  int get inspected => acceptedCount + rejectedCount;
  int get left => max(declaredCount - inspected, 0);
  bool get isOpen => status == 'Inspecting';

  /// Phiếu sau khi ghi thêm một con, để màn hình cập nhật ngay mà không phải tải lại.
  GoodsReceipt counted({required bool accepted}) => GoodsReceipt(
    receiptNo: receiptNo,
    poNo: poNo,
    lotCode: lotCode,
    originRegion: originRegion,
    harvestedOn: harvestedOn,
    declaredCount: declaredCount,
    declaredWeightKg: declaredWeightKg,
    receivedAt: receivedAt,
    status: status,
    acceptedCount: acceptedCount + (accepted ? 1 : 0),
    rejectedCount: rejectedCount + (accepted ? 0 : 1),
    qcUserId: qcUserId,
  );

  factory GoodsReceipt.fromJson(Json j) => GoodsReceipt(
    receiptNo: str(j, 'receiptNo'),
    poNo: str(j, 'poNo'),
    lotCode: str(j, 'lotCode'),
    originRegion: str(j, 'originRegion'),
    harvestedOn: dateOrNull(j, 'harvestedOn'),
    declaredCount: intOf(j, 'declaredCount'),
    declaredWeightKg: doubleOf(j, 'declaredWeightKg'),
    receivedAt: dateOf(j, 'receivedAt'),
    status: str(j, 'status'),
    acceptedCount: intOf(j, 'acceptedCount'),
    rejectedCount: intOf(j, 'rejectedCount'),
    qcUserId: intOrNull(j, 'qcUserId'),
  );
}

/// Kết quả kiểm một con gửi lên máy chủ; kết luận đạt hay loại do máy chủ tính.
class InspectionInput {
  const InspectionInput({
    required this.species,
    required this.sex,
    required this.maturity,
    required this.speciesOk,
    required this.alive,
    required this.healthy,
    required this.twoClaws,
    required this.foodSafe,
    required this.weightG,
    this.note,
  });
  final String species;
  final String sex;
  final String maturity;
  final bool speciesOk;
  final bool alive;
  final bool healthy;
  final bool twoClaws;
  final bool foodSafe;
  final double weightG;
  final String? note;

  Json toJson() => {
    'species': species,
    'sex': sex,
    'maturity': maturity,
    'speciesOk': speciesOk,
    'alive': alive,
    'healthy': healthy,
    'twoClaws': twoClaws,
    'foodSafe': foodSafe,
    'weightG': weightG,
    'note': note,
  };
}

class InspectionResult {
  const InspectionResult({required this.inspectionNo, required this.conclusion, required this.weightG, this.rejectReason, this.crabCode});
  final String inspectionNo;
  final String conclusion;
  final String? rejectReason;
  final String? crabCode;
  final double weightG;
  bool get accepted => conclusion == 'Accepted';

  factory InspectionResult.fromJson(Json j) => InspectionResult(
    inspectionNo: str(j, 'inspectionNo'),
    conclusion: str(j, 'conclusion'),
    rejectReason: strOrNull(j, 'rejectReason'),
    crabCode: strOrNull(j, 'crabCode'),
    weightG: doubleOf(j, 'weightG'),
  );
}

/// Giới tính và độ trưởng thành thường gặp theo loại cua của Lô. strict: khác đi thì con cua bị loại.
({String sex, String maturity, bool strict}) expectedFor(String? crabType) => switch (crabType) {
  'RoeCrab' || 'OilRoeCrab' => (sex: 'Female', maturity: 'Mature', strict: true),
  'YoungFemaleCrab' => (sex: 'Female', maturity: 'Immature', strict: true),
  _ => (sex: 'Male', maturity: 'Mature', strict: false),
};

/// Một việc kiểm đầu vào kèm phiếu nhận của nó (null khi chưa tra được).
class ReceiptTask {
  const ReceiptTask(this.task, this.receipt);
  final QcTask task;
  final GoodsReceipt? receipt;
}

/// Việc kiểm đầu vào chỉ mang id của phiếu. Tra số phiếu qua danh sách phiếu của Lô: phiếu đang kiểm được phân cho tôi,
/// theo thứ tự lập, khớp lần lượt với việc xếp theo id phiếu.
List<ReceiptTask> matchReceipts(Iterable<QcTask> tasksOfBatch, List<GoodsReceipt> receipts, int? me) {
  final mine = [for (final r in receipts) if (r.isOpen && r.qcUserId == me) r];
  final sorted = [...tasksOfBatch]..sort((a, b) => a.targetId.compareTo(b.targetId));
  return [for (var i = 0; i < sorted.length; i++) ReceiptTask(sorted[i], i < mine.length ? mine[i] : null)];
}

abstract interface class IncomingRepository {
  Future<List<GoodsReceipt>> receiptsOfBatch(String batchCode);
  Future<GoodsReceipt> receipt(String receiptNo);
  Future<InspectionResult> inspect(String receiptNo, InspectionInput input);
  Future<GoodsReceipt> complete(String receiptNo);
  Future<List<CrabUnit>> crabsOfBatch(String batchCode);
}

class ApiIncomingRepository implements IncomingRepository {
  ApiIncomingRepository(this.dio);
  final Dio dio;

  static String _receipt(String receiptNo) => '/api/goods-receipts/${Uri.encodeComponent(receiptNo)}';
  static String _batch(String batchCode) => '/api/batches/${Uri.encodeComponent(batchCode)}';

  @override
  Future<List<GoodsReceipt>> receiptsOfBatch(String batchCode) async =>
      [for (final j in await dio.getList('${_batch(batchCode)}/goods-receipts')) GoodsReceipt.fromJson(j)];

  @override
  Future<GoodsReceipt> receipt(String receiptNo) async => GoodsReceipt.fromJson(await dio.getJson(_receipt(receiptNo)));

  @override
  Future<InspectionResult> inspect(String receiptNo, InspectionInput input) async =>
      InspectionResult.fromJson(await dio.postJson('${_receipt(receiptNo)}/inspections', data: input.toJson()));

  @override
  Future<GoodsReceipt> complete(String receiptNo) async =>
      GoodsReceipt.fromJson(await dio.postJson('${_receipt(receiptNo)}/complete'));

  @override
  Future<List<CrabUnit>> crabsOfBatch(String batchCode) async =>
      [for (final j in await dio.getList('${_batch(batchCode)}/crab-units')) CrabUnit.fromJson(j)];
}

final incomingRepositoryProvider = Provider<IncomingRepository>((ref) => ApiIncomingRepository(ref.watch(dioProvider)));

final batchReceiptsProvider = FutureProvider.autoDispose.family<List<GoodsReceipt>, String>(
  (ref, batchCode) => ref.watch(incomingRepositoryProvider).receiptsOfBatch(batchCode),
  retry: (_, _) => null,
);

/// Mã Lô của một phiếu khi màn hình được mở không kèm mã Lô: tìm qua các việc kiểm đầu vào của tôi.
final receiptBatchCodeProvider = FutureProvider.autoDispose.family<String?, String>((ref, receiptNo) async {
  final tasks = await ref.watch(qcTasksProvider.future);
  for (final code in {for (final t in tasks) if (t.kind == QcKinds.incoming) t.batchCode}) {
    final receipts = await ref.watch(batchReceiptsProvider(code).future);
    if (receipts.any((r) => r.receiptNo == receiptNo)) return code;
  }
  return null;
}, retry: (_, _) => null);

/// Cua đã đạt của một lô nguồn, mới nhất trước. Khoá: (mã Lô, mã lô nguồn).
final acceptedCrabsProvider = FutureProvider.autoDispose.family<List<CrabUnit>, (String, String)>((ref, key) async {
  final crabs = await ref.watch(incomingRepositoryProvider).crabsOfBatch(key.$1);
  return [for (final c in crabs) if (c.lotCode == key.$2) c]..sort((a, b) => b.receivedAt.compareTo(a.receivedAt));
}, retry: (_, _) => null);

/// Một phiếu nhận đang mở trên màn hình: ghi từng con và hoàn tất phiếu.
class ReceiptController extends AsyncNotifier<GoodsReceipt> {
  ReceiptController(this.receiptNo);
  final String receiptNo;

  @override
  Future<GoodsReceipt> build() => ref.watch(incomingRepositoryProvider).receipt(receiptNo);

  Future<InspectionResult> inspect(InspectionInput input) async {
    final result = await ref.read(incomingRepositoryProvider).inspect(receiptNo, input);
    final current = state.value;
    if (ref.mounted && current != null) state = AsyncData(current.counted(accepted: result.accepted));
    return result;
  }

  Future<GoodsReceipt> complete() async {
    final done = await ref.read(incomingRepositoryProvider).complete(receiptNo);
    if (ref.mounted) state = AsyncData(done);
    return done;
  }
}

final receiptProvider = AsyncNotifierProvider.autoDispose.family<ReceiptController, GoodsReceipt, String>(
  ReceiptController.new,
  retry: (_, _) => null,
);

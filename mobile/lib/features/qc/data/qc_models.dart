import 'package:dio/dio.dart';
import 'package:intl/intl.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/capture/captured_photo.dart';

/// Loại việc của Nhân viên kiểm phẩm, trùng với QcAssignmentKinds ở backend.
abstract final class QcKinds {
  static const incoming = 'IncomingInspection';
  static const grading = 'GradingSession';
  static const second = 'SecondReview';
  static const visit = 'SiteVisit';

  /// Các loại việc có màn làm việc trong ứng dụng, theo thứ tự hiển thị.
  static const work = [incoming, grading, second, visit];
}

/// Một việc đang chờ của tôi (GET /api/qc/tasks). Việc chỉ mang id của phiếu nhận hoặc con cua, không mang mã.
class QcTask {
  const QcTask({
    required this.assignmentId,
    required this.kind,
    required this.batchCode,
    required this.targetType,
    required this.targetId,
    required this.assignedAt,
  });
  final int assignmentId;
  final String kind;
  final String batchCode;
  final String targetType;
  final int targetId;
  final DateTime assignedAt;

  factory QcTask.fromJson(Json j) => QcTask(
    assignmentId: intOf(j, 'assignmentId'),
    kind: str(j, 'kind'),
    batchCode: str(j, 'batchCode'),
    targetType: str(j, 'targetType'),
    targetId: intOf(j, 'targetId'),
    assignedAt: dateOf(j, 'assignedAt'),
  );
}

List<QcTask> newestFirst(Iterable<QcTask> tasks) => [...tasks]..sort((a, b) => b.assignedAt.compareTo(a.assignedAt));

/// Thông tin chung của Lô (bản công khai của GET /api/batches/{code}).
class BatchHead {
  const BatchHead({required this.batchCode, required this.title, required this.crabType, required this.status, this.executorName});
  final String batchCode;
  final String title;
  final String crabType;
  final String status;
  final String? executorName;

  factory BatchHead.fromJson(Json j) => BatchHead(
    batchCode: str(j, 'batchCode'),
    title: str(j, 'title'),
    crabType: str(j, 'crabType'),
    status: str(j, 'status'),
    executorName: (strOrNull(j, 'executorName') ?? '').isEmpty ? null : str(j, 'executorName'),
  );
}

/// Một con cua đã nhận: mã cua nội bộ, lô nguồn, hộp đang ở.
class CrabUnit {
  const CrabUnit({
    required this.crabCode,
    required this.lotCode,
    required this.originRegion,
    required this.sex,
    required this.maturity,
    required this.receivedWeightG,
    required this.receivedAt,
    this.currentSlotCode,
  });
  final String crabCode;
  final String lotCode;
  final String originRegion;
  final String sex;
  final String maturity;
  final double receivedWeightG;
  final DateTime receivedAt;
  final String? currentSlotCode;

  factory CrabUnit.fromJson(Json j) => CrabUnit(
    crabCode: str(j, 'crabCode'),
    lotCode: str(j, 'lotCode'),
    originRegion: str(j, 'originRegion'),
    sex: str(j, 'sex'),
    maturity: str(j, 'maturity'),
    receivedWeightG: doubleOf(j, 'receivedWeightG'),
    receivedAt: dateOf(j, 'receivedAt'),
    currentSlotCode: strOrNull(j, 'currentSlotCode'),
  );
}

/// Số có dấu phẩy thập phân kiểu Việt Nam: 412,3. Chưa có số thì trả "—".
String formatNum(num? value, [int digits = 2]) {
  if (value == null) return '—';
  return (NumberFormat.decimalPattern('vi_VN')..maximumFractionDigits = digits).format(value);
}

/// Đọc số người dùng gõ, nhận cả dấu phẩy lẫn dấu chấm thập phân.
double? parseDecimal(String text) => double.tryParse(text.trim().replaceAll(',', '.'));

/// Câu báo lỗi của máy chủ, bỏ số quy tắc trong ngoặc ở cuối câu.
String qcErrorMessage(Object error) =>
    apiErrorMessage(error).replaceAll(RegExp(r'\s*\(BR-\d+(?:,\s*BR-\d+)*\)'), '');

/// Ảnh chụp trong ứng dụng thành một phần multipart.
MultipartFile photoPart(CapturedPhoto photo) {
  final type = photo.contentType;
  return MultipartFile.fromBytes(
    photo.bytes,
    filename: 'photo.${type == 'image/jpeg' ? 'jpg' : type.split('/').last}',
    contentType: DioMediaType.parse(type),
  );
}

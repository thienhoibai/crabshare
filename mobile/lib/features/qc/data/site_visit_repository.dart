import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/capture/captured_photo.dart';
import 'qc_models.dart';

/// Biên bản thăm trại giữa vụ đã lập.
class SiteVisitReport {
  const SiteVisitReport({
    required this.reportNo,
    required this.batchCode,
    required this.visitedAt,
    required this.boxCodes,
    required this.crabsSeen,
    required this.findings,
    this.distanceToFarmM,
  });
  final String reportNo;
  final String batchCode;
  final DateTime visitedAt;
  final int? distanceToFarmM;
  final List<String> boxCodes;
  final int crabsSeen;
  final String findings;

  factory SiteVisitReport.fromJson(Json j) => SiteVisitReport(
    reportNo: str(j, 'reportNo'),
    batchCode: str(j, 'batchCode'),
    visitedAt: dateOf(j, 'visitedAt'),
    distanceToFarmM: intOrNull(j, 'distanceToFarmM'),
    boxCodes: [for (final c in (j['boxCodes'] as List?) ?? const []) c.toString()],
    crabsSeen: intOf(j, 'crabsSeen'),
    findings: str(j, 'findings'),
  );
}

/// Một hộp của Lô và con cua đang ở trong hộp (nếu có).
class VisitBox {
  const VisitBox({required this.slotCode, this.crabCode});
  final String slotCode;
  final String? crabCode;
  bool get occupied => crabCode != null;
  factory VisitBox.fromJson(Json j) => VisitBox(slotCode: str(j, 'slotCode'), crabCode: strOrNull(j, 'crabCode'));
}

/// Số cua đang nuôi theo sổ và số ngày nuôi, để đối chiếu khi thăm trại.
class BatchProgress {
  const BatchProgress({required this.crabsAlive, this.daysRaised});
  final int crabsAlive;
  final int? daysRaised;
  factory BatchProgress.fromJson(Json j) => BatchProgress(crabsAlive: intOf(j, 'crabsAlive'), daysRaised: intOrNull(j, 'daysRaised'));
}

/// Dữ liệu của một biên bản trước khi gửi. Vị trí lấy từ ảnh chụp tại trại.
class SiteVisitInput {
  const SiteVisitInput({required this.photo, required this.boxCodes, required this.crabsSeen, required this.findings});
  final CapturedPhoto photo;
  final List<String> boxCodes;
  final int crabsSeen;
  final String findings;

  /// Máy chủ nhận chuỗi mã hộp cách nhau bằng dấu phẩy, dài 4 đến 400 ký tự.
  String get boxCodesText => boxCodes.join(',');
}

abstract interface class SiteVisitRepository {
  Future<List<VisitBox>> boxes(String batchCode);
  Future<BatchProgress> progress(String batchCode);
  Future<List<SiteVisitReport>> reports(String batchCode);
  Future<SiteVisitReport> submit(int assignmentId, SiteVisitInput input);
}

class ApiSiteVisitRepository implements SiteVisitRepository {
  ApiSiteVisitRepository(this.dio);
  final Dio dio;

  static String _batch(String code) => '/api/batches/${Uri.encodeComponent(code)}';

  @override
  Future<List<VisitBox>> boxes(String batchCode) async => [for (final j in await dio.getList('${_batch(batchCode)}/boxes')) VisitBox.fromJson(j)];

  @override
  Future<BatchProgress> progress(String batchCode) async => BatchProgress.fromJson(await dio.getJson('${_batch(batchCode)}/progress'));

  @override
  Future<List<SiteVisitReport>> reports(String batchCode) async =>
      [for (final j in await dio.getList('${_batch(batchCode)}/site-visits')) SiteVisitReport.fromJson(j)];

  /// Tên trường trùng với SiteVisitReportRequest ở backend.
  @override
  Future<SiteVisitReport> submit(int assignmentId, SiteVisitInput input) async => SiteVisitReport.fromJson(
    await dio.postJson(
      '/api/qc/site-visits/$assignmentId/report',
      data: FormData.fromMap({
        'Latitude': input.photo.latitude.toStringAsFixed(6),
        'Longitude': input.photo.longitude.toStringAsFixed(6),
        'BoxCodes': input.boxCodesText,
        'CrabsSeen': '${input.crabsSeen}',
        'Findings': input.findings,
        'Photo': photoPart(input.photo),
      }),
    ),
  );
}

final siteVisitRepositoryProvider = Provider<SiteVisitRepository>((ref) => ApiSiteVisitRepository(ref.watch(dioProvider)));

final visitBoxesProvider = FutureProvider.autoDispose.family<List<VisitBox>, String>(
  (ref, batchCode) => ref.watch(siteVisitRepositoryProvider).boxes(batchCode),
  retry: (_, _) => null,
);

final batchProgressProvider = FutureProvider.autoDispose.family<BatchProgress, String>(
  (ref, batchCode) => ref.watch(siteVisitRepositoryProvider).progress(batchCode),
  retry: (_, _) => null,
);

/// Biên bản trước của Lô, mới nhất trước.
final pastVisitsProvider = FutureProvider.autoDispose.family<List<SiteVisitReport>, String>(
  (ref, batchCode) async => (await ref.watch(siteVisitRepositoryProvider).reports(batchCode)).reversed.toList(),
  retry: (_, _) => null,
);

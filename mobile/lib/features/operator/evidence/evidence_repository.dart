import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/capture/captured_photo.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';

/// Kết quả máy chủ trả về sau khi nhận một ảnh chụp tại hộp.
class EvidenceResult {
  const EvidenceResult({required this.id, required this.reviewStatus, this.duplicateMatch = 'None', this.crabDetected, this.captureRequestStatus});
  final int id;

  /// Accepted, Watch, Flagged hoặc Rejected.
  final String reviewStatus;

  /// None, Exact hoặc Similar.
  final String duplicateMatch;
  final bool? crabDetected;
  final String? captureRequestStatus;

  factory EvidenceResult.fromJson(Json j) => EvidenceResult(
    id: intOf(j, 'id'),
    reviewStatus: str(j, 'reviewStatus'),
    duplicateMatch: str(j, 'duplicateMatch', 'None'),
    crabDetected: asJsonOrNull(j['detection'])?['crabDetected'] as bool?,
    captureRequestStatus: strOrNull(j, 'captureRequestStatus'),
  );
}

/// Một trang hộp đang có cua để chọn hộp cần chụp.
class BoxPage {
  const BoxPage({required this.items, required this.total, this.hasMore = false});
  final List<BoxSlot> items;

  /// Số hộp khớp trên máy chủ; [hasMore] là còn hộp chưa nằm trong trang này.
  final int total;
  final bool hasMore;
}

abstract interface class EvidenceRepository {
  /// Hộp đang có cua của trại, lọc theo số hộp. Chỉ trả hộp đang gán cho một Lô.
  Future<BoxPage> boxes({String search = '', CancelToken? cancelToken});

  /// Gửi ảnh chụp tại hộp. [boxing] là ảnh hộp trống chụp ngay trước khi xếp cua vào (thả lần đầu hoặc thả bù);
  /// [captureRequestId] là yêu cầu chụp đang trả lời.
  Future<EvidenceResult> upload({
    required String batchCode,
    required String slotCode,
    required CapturedPhoto photo,
    int? captureRequestId,
    bool boxing = false,
  });
}

class ApiEvidenceRepository implements EvidenceRepository {
  ApiEvidenceRepository(this.dio);
  final Dio dio;

  static const pageSize = 60;

  @override
  Future<BoxPage> boxes({String search = '', CancelToken? cancelToken}) async {
    final response = await dio.get<dynamic>(
      '/api/boxes',
      queryParameters: {'status': 'Occupied', if (search.trim().isNotEmpty) 'search': search.trim(), 'page': 1, 'pageSize': pageSize},
      cancelToken: cancelToken,
    );
    final page = asJson(response.data);
    final rows = asJsonList(page['items']);
    final total = intOf(page, 'total');
    return BoxPage(
      items: [
        for (final b in rows)
          if (b['batchCode'] != null) BoxSlot.fromJson(b),
      ],
      total: total,
      hasMore: total > rows.length,
    );
  }

  @override
  Future<EvidenceResult> upload({
    required String batchCode,
    required String slotCode,
    required CapturedPhoto photo,
    int? captureRequestId,
    bool boxing = false,
  }) async {
    final type = photo.contentType;
    final form = FormData.fromMap({
      'BatchCode': batchCode,
      'SlotCode': slotCode,
      'CapturedAt': photo.capturedAt.toUtc().toIso8601String(),
      'Latitude': photo.latitude.toStringAsFixed(6),
      'Longitude': photo.longitude.toStringAsFixed(6),
      if (captureRequestId != null) 'CaptureRequestId': '$captureRequestId',
      if (boxing) 'SlotEventType': 'Boxed',
      'Image': MultipartFile.fromBytes(
        photo.bytes,
        filename: 'capture.${type == 'image/jpeg' ? 'jpg' : type.split('/').last}',
        contentType: DioMediaType.parse(type),
      ),
    });
    final response = await dio.post<dynamic>(
      '/api/evidence',
      data: form,
      options: Options(sendTimeout: const Duration(seconds: 60), receiveTimeout: const Duration(seconds: 90)),
    );
    return EvidenceResult.fromJson(asJson(response.data));
  }
}

final evidenceRepositoryProvider = Provider<EvidenceRepository>((ref) => ApiEvidenceRepository(ref.watch(dioProvider)));

/// Hộp đang có cua khớp với số hộp đang gõ ở màn chụp ảnh.
final captureBoxesProvider = FutureProvider.autoDispose.family<BoxPage, String>((ref, search) {
  ref.watch(farmAccountProvider);
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  return ref.watch(evidenceRepositoryProvider).boxes(search: search, cancelToken: cancel);
}, retry: (_, _) => null);

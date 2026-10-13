import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../data/operator_models.dart';

class EvidencePhoto {
  EvidencePhoto({
    required this.bytes,
    required this.capturedAt,
    required this.latitude,
    required this.longitude,
  }) {
    if (bytes.isEmpty || bytes.length > 5 * 1024 * 1024) {
      throw const FormatException(
        'Ảnh cần có dung lượng từ 1 byte đến 5 MB. Hãy chụp lại.',
      );
    }
    if (!latitude.isFinite ||
        !longitude.isFinite ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180) {
      throw const FormatException(
        'Chưa có vị trí hợp lệ. Hãy bật GPS và chụp lại.',
      );
    }
  }
  final Uint8List bytes;
  final DateTime capturedAt;
  final double latitude;
  final double longitude;
  String get contentType {
    if (bytes.length >= 3 &&
        bytes[0] == 255 &&
        bytes[1] == 216 &&
        bytes[2] == 255) {
      return 'image/jpeg';
    }
    if (bytes.length >= 8 &&
        [
          137,
          80,
          78,
          71,
          13,
          10,
          26,
          10,
        ].asMap().entries.every((e) => bytes[e.key] == e.value)) {
      return 'image/png';
    }
    if (bytes.length >= 12 &&
        String.fromCharCodes(bytes.take(4)) == 'RIFF' &&
        String.fromCharCodes(bytes.skip(8).take(4)) == 'WEBP') {
      return 'image/webp';
    }
    throw const FormatException(
      'Ảnh cần có định dạng JPEG, PNG hoặc WebP. Hãy chụp lại.',
    );
  }
}

class EvidenceResult {
  const EvidenceResult({
    required this.id,
    required this.reviewStatus,
    required this.duplicateMatch,
    required this.receivedAt,
    required this.modelVersion,
    this.crabDetected,
    this.confidence,
  });
  final int id;
  final String reviewStatus;
  final String duplicateMatch;
  final DateTime receivedAt;
  final String modelVersion;
  final bool? crabDetected;
  final double? confidence;
  factory EvidenceResult.fromJson(Map<String, dynamic> json) {
    final detection = Map<String, dynamic>.from(json['detection'] as Map);
    return EvidenceResult(
      id: json['id'] as int,
      reviewStatus: json['reviewStatus'] as String,
      duplicateMatch: json['duplicateMatch'] as String,
      receivedAt: DateTime.parse(json['receivedAt'] as String).toLocal(),
      modelVersion: detection['modelVersion'] as String,
      crabDetected: detection['crabDetected'] as bool?,
      confidence: (detection['confidence'] as num?)?.toDouble(),
    );
  }
}

abstract interface class EvidenceRepository {
  Future<List<BoxSlot>> boxes({CancelToken? cancelToken});
  Future<EvidenceResult> upload({
    required BoxSlot box,
    required EvidencePhoto photo,
    int? captureRequestId,
  });
}

class ApiEvidenceRepository implements EvidenceRepository {
  ApiEvidenceRepository(this.dio);
  final Dio dio;
  @override
  Future<List<BoxSlot>> boxes({CancelToken? cancelToken}) async {
    final list = <BoxSlot>[];
    for (var page = 1; ; page++) {
      final response = await dio.get<Map<String, dynamic>>(
        '/api/boxes',
        queryParameters: {'status': 'Occupied', 'page': page, 'pageSize': 100},
        cancelToken: cancelToken,
      );
      final json = response.data!;
      final items = json['items'] as List;
      for (final item in items) {
        final data = Map<String, dynamic>.from(item as Map);
        final batch = data['batchCode'] as String?;
        if (batch != null && data['status'] == 'Occupied') {
          list.add(
            BoxSlot(
              slotCode: data['slotCode'] as String,
              status: SlotStatus.occupied,
              batchCode: batch,
            ),
          );
        }
      }
      if (items.isEmpty || page * 100 >= (json['total'] as int)) break;
    }
    return list;
  }

  @override
  Future<EvidenceResult> upload({
    required BoxSlot box,
    required EvidencePhoto photo,
    int? captureRequestId,
  }) async {
    final type = photo.contentType;
    final form = FormData.fromMap({
      'batchCode': box.batchCode,
      'slotCode': box.slotCode,
      'capturedAt': photo.capturedAt.toUtc().toIso8601String(),
      'latitude': photo.latitude.toStringAsFixed(6),
      'longitude': photo.longitude.toStringAsFixed(6),
      if (captureRequestId != null)
        'captureRequestId': captureRequestId.toString(),
      'image': MultipartFile.fromBytes(
        photo.bytes,
        filename:
            'capture.${type == 'image/jpeg' ? 'jpg' : type.split('/').last}',
        contentType: DioMediaType.parse(type),
      ),
    });
    final response = await dio.post<Map<String, dynamic>>(
      '/api/evidence',
      data: form,
      options: Options(
        sendTimeout: const Duration(seconds: 60),
        receiveTimeout: const Duration(seconds: 90),
      ),
    );
    return EvidenceResult.fromJson(response.data!);
  }
}

final evidenceRepositoryProvider = Provider<EvidenceRepository>(
  (ref) => ApiEvidenceRepository(ref.watch(dioProvider)),
);
final captureBoxesProvider = FutureProvider.autoDispose<List<BoxSlot>>((ref) {
  ref.watch(sessionProvider.select((session) => session.user?.userId));
  final cancel = CancelToken();
  ref.onDispose(() => cancel.cancel());
  return ref.watch(evidenceRepositoryProvider).boxes(cancelToken: cancel);
});

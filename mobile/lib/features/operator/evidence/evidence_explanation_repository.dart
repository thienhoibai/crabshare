import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../data/operator_repository.dart';

/// Ảnh chụp tại hộp bị gắn cờ, chờ người nuôi giải trình và người thẩm định kết luận.
class FlaggedEvidence {
  const FlaggedEvidence({
    required this.id,
    required this.batchCode,
    required this.reviewStatus,
    required this.receivedAt,
    required this.canExplain,
    this.slotCode,
    this.mediaType = 'Photo',
    this.capturedAt,
    this.latitude,
    this.longitude,
    this.explanation,
    this.explainedAt,
    this.reviewNote,
    this.reviewedAt,
  });

  final int id;
  final String batchCode;
  final String reviewStatus;
  final String mediaType;
  final String? slotCode;
  final String? explanation;
  final String? reviewNote;
  final DateTime receivedAt;
  final DateTime? capturedAt;
  final DateTime? explainedAt;
  final DateTime? reviewedAt;
  final double? latitude;
  final double? longitude;
  final bool canExplain;

  /// Còn chờ người nuôi viết giải trình lần đầu.
  bool get needsExplanation => canExplain && explanation == null;

  factory FlaggedEvidence.fromJson(Json j) {
    final review = asJsonOrNull(j['latestReview']);
    return FlaggedEvidence(
      id: intOf(j, 'id'),
      batchCode: str(j, 'batchCode'),
      slotCode: strOrNull(j, 'slotCode'),
      mediaType: str(j, 'mediaType', 'Photo'),
      reviewStatus: str(j, 'reviewStatus'),
      receivedAt: dateOf(j, 'receivedAt'),
      capturedAt: dateOrNull(j, 'capturedAt'),
      latitude: doubleOrNull(j, 'latitude'),
      longitude: doubleOrNull(j, 'longitude'),
      explanation: strOrNull(j, 'explanation'),
      explainedAt: dateOrNull(j, 'explainedAt'),
      reviewNote: review == null ? null : strOrNull(review, 'note'),
      reviewedAt: review == null ? null : dateOrNull(review, 'reviewedAt'),
      canExplain: boolOf(j, 'canExplain'),
    );
  }
}

abstract interface class EvidenceExplanationRepository {
  Future<List<FlaggedEvidence>> list({CancelToken? cancelToken});
  Future<FlaggedEvidence> get(int id, {CancelToken? cancelToken});
  Future<Uint8List> image(int id, {CancelToken? cancelToken});
  Future<FlaggedEvidence> explain(int id, String text);
}

class ApiEvidenceExplanationRepository implements EvidenceExplanationRepository {
  ApiEvidenceExplanationRepository(this.dio);
  final Dio dio;

  @override
  Future<List<FlaggedEvidence>> list({CancelToken? cancelToken}) async {
    final items = <FlaggedEvidence>[];
    for (var page = 1; ; page++) {
      final response = await dio.get<dynamic>(
        '/api/operators/me/evidence',
        queryParameters: {'status': 'Flagged', 'page': page, 'pageSize': 100},
        cancelToken: cancelToken,
      );
      final data = asJson(response.data);
      final rows = asJsonList(data['items']);
      items.addAll(rows.map(FlaggedEvidence.fromJson));
      if (rows.isEmpty || page * 100 >= intOf(data, 'total')) break;
    }
    return items;
  }

  @override
  Future<FlaggedEvidence> get(int id, {CancelToken? cancelToken}) async =>
      FlaggedEvidence.fromJson(asJson((await dio.get<dynamic>('/api/operators/me/evidence/$id', cancelToken: cancelToken)).data));

  @override
  Future<Uint8List> image(int id, {CancelToken? cancelToken}) async => Uint8List.fromList(
    (await dio.get<List<int>>(
          '/api/operators/me/evidence/$id/image',
          options: Options(responseType: ResponseType.bytes),
          cancelToken: cancelToken,
        )).data ??
        const [],
  );

  @override
  Future<FlaggedEvidence> explain(int id, String text) async =>
      FlaggedEvidence.fromJson(await dio.postJson('/api/evidence/$id/explanation', data: {'text': text.trim()}));
}

final evidenceExplanationRepositoryProvider = Provider<EvidenceExplanationRepository>(
  (ref) => ApiEvidenceExplanationRepository(ref.watch(dioProvider)),
);

final flaggedEvidenceProvider = FutureProvider.autoDispose<List<FlaggedEvidence>>((ref) {
  ref.watch(farmAccountProvider);
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  return ref.watch(evidenceExplanationRepositoryProvider).list(cancelToken: cancel);
}, retry: (_, _) => null);

final operatorEvidenceProvider = FutureProvider.autoDispose.family<FlaggedEvidence, int>((ref, id) {
  ref.watch(farmAccountProvider);
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  return ref.watch(evidenceExplanationRepositoryProvider).get(id, cancelToken: cancel);
}, retry: (_, _) => null);

final operatorEvidenceImageProvider = FutureProvider.autoDispose.family<Uint8List, int>((ref, id) {
  ref.watch(farmAccountProvider);
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  return ref.watch(evidenceExplanationRepositoryProvider).image(id, cancelToken: cancel);
}, retry: (_, _) => null);

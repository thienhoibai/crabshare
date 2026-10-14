import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';

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
    this.riskScore,
    this.explanation,
    this.explainedAt,
    this.reviewNote,
    this.reviewedAt,
  });
  final int id;
  final String batchCode, reviewStatus, mediaType;
  final String? slotCode, explanation, reviewNote;
  final DateTime receivedAt;
  final DateTime? capturedAt, explainedAt, reviewedAt;
  final double? latitude, longitude, riskScore;
  final bool canExplain;
  factory FlaggedEvidence.fromJson(Map<String, dynamic> data) {
    final review = data['latestReview'] as Map?;
    DateTime? date(dynamic value) =>
        value is String ? DateTime.parse(value).toLocal() : null;
    return FlaggedEvidence(
      id: data['id'] as int,
      batchCode: data['batchCode'] as String,
      slotCode: data['slotCode'] as String?,
      mediaType: data['mediaType'] as String,
      reviewStatus: data['reviewStatus'] as String,
      receivedAt: date(data['receivedAt'])!,
      capturedAt: date(data['capturedAt']),
      latitude: (data['latitude'] as num?)?.toDouble(),
      longitude: (data['longitude'] as num?)?.toDouble(),
      riskScore: (data['riskScore'] as num?)?.toDouble(),
      explanation: data['explanation'] as String?,
      explainedAt: date(data['explainedAt']),
      reviewNote: review?['note'] as String?,
      reviewedAt: date(review?['reviewedAt']),
      canExplain: data['canExplain'] as bool,
    );
  }
}

abstract interface class EvidenceExplanationRepository {
  Future<List<FlaggedEvidence>> list({CancelToken? cancelToken});
  Future<FlaggedEvidence> get(int id, {CancelToken? cancelToken});
  Future<Uint8List> image(int id, {CancelToken? cancelToken});
  Future<FlaggedEvidence> explain(int id, String text);
}

class ApiEvidenceExplanationRepository
    implements EvidenceExplanationRepository {
  ApiEvidenceExplanationRepository(this.dio);
  final Dio dio;
  @override
  Future<List<FlaggedEvidence>> list({CancelToken? cancelToken}) async {
    final items = <FlaggedEvidence>[];
    for (var page = 1; ; page++) {
      final response = await dio.get<Map<String, dynamic>>(
        '/api/operators/me/evidence',
        queryParameters: {'status': 'Flagged', 'page': page, 'pageSize': 100},
        cancelToken: cancelToken,
      );
      final data = response.data!;
      final rows = data['items'] as List;
      items.addAll(
        rows.map(
          (row) =>
              FlaggedEvidence.fromJson(Map<String, dynamic>.from(row as Map)),
        ),
      );
      if (rows.isEmpty || page * 100 >= (data['total'] as int)) break;
    }
    return items;
  }

  @override
  Future<FlaggedEvidence> get(int id, {CancelToken? cancelToken}) async =>
      FlaggedEvidence.fromJson(
        (await dio.get<Map<String, dynamic>>(
          '/api/operators/me/evidence/$id',
          cancelToken: cancelToken,
        )).data!,
      );
  @override
  Future<Uint8List> image(int id, {CancelToken? cancelToken}) async =>
      Uint8List.fromList(
        (await dio.get<List<int>>(
          '/api/operators/me/evidence/$id/image',
          options: Options(responseType: ResponseType.bytes),
          cancelToken: cancelToken,
        )).data!,
      );
  @override
  Future<FlaggedEvidence> explain(int id, String text) async =>
      FlaggedEvidence.fromJson(
        (await dio.post<Map<String, dynamic>>(
          '/api/evidence/$id/explanation',
          data: {'text': text.trim()},
        )).data!,
      );
}

final evidenceExplanationRepositoryProvider =
    Provider<EvidenceExplanationRepository>(
      (ref) => ApiEvidenceExplanationRepository(ref.watch(dioProvider)),
    );

final flaggedEvidenceProvider =
    FutureProvider.autoDispose<List<FlaggedEvidence>>((ref) {
      ref.watch(sessionProvider.select((session) => session.user?.userId));
      final cancel = CancelToken();
      ref.onDispose(() => cancel.cancel());
      return ref
          .watch(evidenceExplanationRepositoryProvider)
          .list(cancelToken: cancel);
    }, retry: (count, error) => null);

final operatorEvidenceProvider = FutureProvider.autoDispose
    .family<FlaggedEvidence, int>((ref, id) {
      ref.watch(sessionProvider.select((session) => session.user?.userId));
      final cancel = CancelToken();
      ref.onDispose(() => cancel.cancel());
      return ref
          .watch(evidenceExplanationRepositoryProvider)
          .get(id, cancelToken: cancel);
    }, retry: (count, error) => null);

final operatorEvidenceImageProvider = FutureProvider.autoDispose
    .family<Uint8List, int>((ref, id) {
      ref.watch(sessionProvider.select((session) => session.user?.userId));
      final cancel = CancelToken();
      ref.onDispose(() => cancel.cancel());
      return ref
          .watch(evidenceExplanationRepositoryProvider)
          .image(id, cancelToken: cancel);
    }, retry: (count, error) => null);

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/auth/session.dart';
import 'batch_models.dart';

export 'batch_models.dart';

/// Lô đã công bố: danh sách đang mở, một Lô theo mã, tiến độ, số còn đặt được. Không cần vai nhà đầu tư.
abstract interface class BatchRepository {
  Future<List<ExploreBatch>> open();

  /// Trả null khi Lô chưa được công bố.
  Future<ExploreBatch?> byCode(String code);
  Future<BatchProgress> progress(String code);
  Future<BatchAvailability> availability(String code);
}

class ApiBatchRepository implements BatchRepository {
  ApiBatchRepository(this._dio);
  final Dio _dio;

  static String _path(String code) => '/api/batches/${Uri.encodeComponent(code)}';

  Future<List<ExploreBatch>> _list(String scope) async =>
      Paged.fromJson(await _dio.getJson('/api/batches', query: {'scope': scope, 'pageSize': 100}), ExploreBatch.fromJson).items;

  @override
  Future<List<ExploreBatch>> open() => _list('open');

  @override
  Future<ExploreBatch?> byCode(String code) async {
    final direct = await _dio.getJson(_path(code));
    if (direct.containsKey('executorName')) return ExploreBatch.fromJson(direct);
    // Người nuôi và quản trị nhận bản soạn thảo ở đường dẫn này: lấy bản công khai từ danh sách.
    for (final batch in await _list('all')) {
      if (batch.code == code) return batch;
    }
    return null;
  }

  @override
  Future<BatchProgress> progress(String code) async => BatchProgress.fromJson(await _dio.getJson('${_path(code)}/progress'));

  @override
  Future<BatchAvailability> availability(String code) async =>
      BatchAvailability.fromJson(await _dio.getJson('${_path(code)}/availability'));
}

final batchRepositoryProvider = Provider<BatchRepository>((ref) => ApiBatchRepository(ref.watch(dioProvider)));

/// Phần phụ của một màn: lỗi thì coi như chưa có, không chặn phần chính.
Future<T?> optional<T>(Future<T> future) async {
  try {
    return await future;
  } catch (_) {
    return null;
  }
}

/// Lô đang gọi vốn hoặc nhận đặt trước.
final openBatchesProvider = FutureProvider.autoDispose<List<ExploreBatch>>((ref) {
  ref.watch(sessionProvider.select((s) => s.user?.userId));
  return ref.watch(batchRepositoryProvider).open();
}, retry: (_, _) => null);

/// Màn Lô công khai; null khi Lô chưa được công bố.
final batchViewProvider = FutureProvider.autoDispose.family<BatchPublicView?, String>((ref, code) async {
  ref.watch(sessionProvider.select((s) => s.user?.userId));
  final repo = ref.watch(batchRepositoryProvider);
  final batch = await repo.byCode(code);
  if (batch == null) return null;
  final progress = optional(repo.progress(code));
  final availability = optional(repo.availability(code));
  return BatchPublicView(batch: batch, progress: await progress, availability: await availability);
}, retry: (_, _) => null);

/// Tiến độ của một Lô, dùng ở màn Lô tôi đã góp.
final batchProgressProvider = FutureProvider.autoDispose.family<BatchProgress, String>((ref, code) {
  ref.watch(sessionProvider.select((s) => s.user?.userId));
  return ref.watch(batchRepositoryProvider).progress(code);
}, retry: (_, _) => null);

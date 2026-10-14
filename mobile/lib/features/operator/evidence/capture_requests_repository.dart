import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../data/operator_models.dart';

abstract interface class CaptureRequestsRepository {
  Future<List<CaptureRequest>> list({CancelToken? cancelToken});
}

class ApiCaptureRequestsRepository implements CaptureRequestsRepository {
  ApiCaptureRequestsRepository(this.dio);
  final Dio dio;
  @override
  Future<List<CaptureRequest>> list({CancelToken? cancelToken}) async {
    final requests = <CaptureRequest>[];
    for (var page = 1; ; page++) {
      final response = await dio.get<Map<String, dynamic>>(
        '/api/operators/me/capture-requests',
        queryParameters: {'status': 'Open', 'page': page, 'pageSize': 100},
        cancelToken: cancelToken,
      );
      final data = response.data!;
      final items = data['items'] as List;
      requests.addAll(
        items.map(
          (item) =>
              CaptureRequest.fromJson(Map<String, dynamic>.from(item as Map)),
        ),
      );
      if (items.isEmpty || page * 100 >= (data['total'] as int)) break;
    }
    return requests;
  }
}

final captureRequestsRepositoryProvider = Provider<CaptureRequestsRepository>(
  (ref) => ApiCaptureRequestsRepository(ref.watch(dioProvider)),
);
final captureRequestsProvider =
    FutureProvider.autoDispose<List<CaptureRequest>>((ref) {
      ref.watch(sessionProvider.select((session) => session.user?.userId));
      final cancel = CancelToken();
      ref.onDispose(() => cancel.cancel());
      return ref
          .watch(captureRequestsRepositoryProvider)
          .list(cancelToken: cancel);
    });

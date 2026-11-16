import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../data/operator_models.dart';
import '../data/operator_repository.dart';

abstract interface class CaptureRequestsRepository {
  /// Yêu cầu chụp đang chờ của hộ nuôi, hạn gần nhất đứng trước.
  Future<List<CaptureRequest>> list({CancelToken? cancelToken});
}

class ApiCaptureRequestsRepository implements CaptureRequestsRepository {
  ApiCaptureRequestsRepository(this.dio);
  final Dio dio;

  @override
  Future<List<CaptureRequest>> list({CancelToken? cancelToken}) async {
    final requests = <CaptureRequest>[];
    for (var page = 1; ; page++) {
      final response = await dio.get<dynamic>(
        '/api/operators/me/capture-requests',
        queryParameters: {'status': 'Open', 'page': page, 'pageSize': 100},
        cancelToken: cancelToken,
      );
      final data = asJson(response.data);
      final items = asJsonList(data['items']);
      requests.addAll(items.map(CaptureRequest.fromJson));
      if (items.isEmpty || page * 100 >= intOf(data, 'total')) break;
    }
    return requests..sort((a, b) => a.dueAt.compareTo(b.dueAt));
  }
}

final captureRequestsRepositoryProvider = Provider<CaptureRequestsRepository>((ref) => ApiCaptureRequestsRepository(ref.watch(dioProvider)));

final captureRequestsProvider = FutureProvider.autoDispose<List<CaptureRequest>>((ref) {
  ref.watch(farmAccountProvider);
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  return ref.watch(captureRequestsRepositoryProvider).list(cancelToken: cancel);
}, retry: (_, _) => null);

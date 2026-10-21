import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import 'timeline_models.dart';
export 'timeline_models.dart';

abstract interface class TimelineRepository {
  Future<TimelinePage> timeline(String code, {String? before, CancelToken? cancelToken});
  Future<Uint8List> file(String code, String id, {CancelToken? cancelToken});
}

class ApiTimelineRepository implements TimelineRepository {
  ApiTimelineRepository(this.dio);
  final Dio dio;
  @override
  Future<TimelinePage> timeline(String code, {String? before, CancelToken? cancelToken}) async {
    final response = await dio.get<Map<String, dynamic>>(
      '/api/batches/${Uri.encodeComponent(code)}/timeline',
      queryParameters: {'days': 7, 'before': ?before},
      cancelToken: cancelToken,
    );
    final page = TimelinePage.fromJson(response.data!);
    if (page.batchCode != code) throw const FormatException('Lô trong nhật trình không khớp.');
    return page;
  }
  @override
  Future<Uint8List> file(String code, String id, {CancelToken? cancelToken}) async =>
    Uint8List.fromList((await dio.get<List<int>>(
      '/api/batches/${Uri.encodeComponent(code)}/timeline/evidence/${Uri.encodeComponent(id)}/file',
      options: Options(responseType: ResponseType.bytes), cancelToken: cancelToken,
    )).data!);
}

final timelineRepositoryProvider = Provider<TimelineRepository>(
  (ref) => ApiTimelineRepository(ref.watch(dioProvider)),
);
// Parent-page pull-to-refresh invalidates all visible timeline and image state.
final timelineRefreshProvider = NotifierProvider<TimelineRefresh, int>(TimelineRefresh.new);
class TimelineRefresh extends Notifier<int> {
  @override
  int build() => 0;
  void refresh() => state++;
}

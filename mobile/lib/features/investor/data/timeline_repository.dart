import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'timeline_models.dart';

export 'timeline_models.dart';

/// Nhật trình của một Lô, phân trang trọn nhóm ngày theo giờ Việt Nam.
abstract interface class TimelineRepository {
  /// [before] là mốc ngày (yyyy-MM-dd) của trang trước trả về để tải các ngày cũ hơn.
  Future<TimelinePage> timeline(String code, {String? before, CancelToken? cancelToken});
}

class ApiTimelineRepository implements TimelineRepository {
  ApiTimelineRepository(this._dio);
  final Dio _dio;

  @override
  Future<TimelinePage> timeline(String code, {String? before, CancelToken? cancelToken}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      timelinePath(code),
      queryParameters: {'days': 7, 'before': ?before},
      cancelToken: cancelToken,
    );
    final page = TimelinePage.fromJson(response.data!);
    if (page.batchCode != code) throw const FormatException('Lô trong nhật trình không khớp.');
    return page;
  }
}

String timelinePath(String code) => '/api/batches/${Uri.encodeComponent(code)}/timeline';

/// Đường dẫn tệp của một bằng chứng đã được chấp nhận; cần đăng nhập (dùng với AuthImage).
String timelineFilePath(String code, String evidenceId) => '${timelinePath(code)}/evidence/${Uri.encodeComponent(evidenceId)}/file';

final timelineRepositoryProvider = Provider<TimelineRepository>((ref) => ApiTimelineRepository(ref.watch(dioProvider)));

/// Kéo để tải lại ở màn cha tăng số này để nhật trình đang hiện tải lại từ đầu.
final timelineRefreshProvider = NotifierProvider<TimelineRefresh, int>(TimelineRefresh.new);

class TimelineRefresh extends Notifier<int> {
  @override
  int build() => 0;
  void refresh() => state++;
}

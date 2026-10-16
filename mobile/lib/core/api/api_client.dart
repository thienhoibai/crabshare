import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/session.dart';

/// Địa chỉ API. Mặc định localhost (chạy web/iOS simulator).
/// Máy ảo Android: flutter run --dart-define=API_URL=http://10.0.2.2:5233
/// Điện thoại thật: dùng IP LAN của máy chạy API, ví dụ http://192.168.1.10:5233
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://localhost:5233',
);

/// Địa chỉ web CrabShare: các luồng làm trên web (góp vốn, ký hợp đồng) mở bằng trình duyệt.
/// Máy ảo Android: --dart-define=WEB_URL=http://10.0.2.2:5173
const webUrl = String.fromEnvironment(
  'WEB_URL',
  defaultValue: 'http://localhost:5173',
);

/// Client HTTP dùng chung: tự gắn JWT của phiên đăng nhập; 401 thì tự đăng xuất.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: apiUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
    ),
  );
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = ref.read(sessionProvider).token;
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (error, handler) async {
        if (ref.mounted &&
            error.response?.statusCode == 401 &&
            ref.read(sessionProvider).token != null &&
            error.requestOptions.headers['Authorization'] ==
                'Bearer ${ref.read(sessionProvider).token}') {
          try {
            await ref.read(sessionProvider.notifier).signOut();
          } catch (_) {
            /* In-memory session is already cleared. */
          }
        }
        handler.next(error);
      },
    ),
  );
  return dio;
});

/// Lấy câu báo lỗi dễ đọc từ ProblemDetails mà backend trả về.
String apiErrorMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final errors = data['errors'];
      if (errors is Map) {
        final messages = errors.values
            .expand(
              (value) => value is List
                  ? value.whereType<String>()
                  : value is String
                  ? [value]
                  : <String>[],
            )
            .where((value) => value.trim().isNotEmpty)
            .toList();
        if (messages.isNotEmpty) return messages.join(' ');
      }
      if (data['detail'] is String &&
          (data['detail'] as String).trim().isNotEmpty) {
        return data['detail'] as String;
      }
    }
    if (error.type == DioExceptionType.cancel) {
      return 'Yêu cầu đã được huỷ. Bạn có thể thử lại.';
    }
    if (error.response == null) {
      return 'Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.';
    }
  }
  return 'Có lỗi xảy ra, thử lại sau.';
}

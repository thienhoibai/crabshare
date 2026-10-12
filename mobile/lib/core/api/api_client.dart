import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/session.dart';

/// Địa chỉ API. Mặc định localhost (chạy web/iOS simulator).
/// Máy ảo Android: flutter run --dart-define=API_URL=http://10.0.2.2:5233
/// Điện thoại thật: dùng IP LAN của máy chạy API, ví dụ http://192.168.1.10:5233
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:5233');

/// Client HTTP dùng chung: tự gắn JWT của phiên đăng nhập; 401 thì tự đăng xuất.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(baseUrl: apiUrl, connectTimeout: const Duration(seconds: 15), receiveTimeout: const Duration(seconds: 30)));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      final token = ref.read(sessionProvider).token;
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    },
    onError: (error, handler) {
      if (error.response?.statusCode == 401 && ref.read(sessionProvider).isSignedIn) {
        ref.read(sessionProvider.notifier).signOut();
      }
      handler.next(error);
    },
  ));
  return dio;
});

/// Lấy câu báo lỗi dễ đọc từ ProblemDetails mà backend trả về.
String apiErrorMessage(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map) {
      final errors = data['errors'];
      if (errors is Map && errors.isNotEmpty) return errors.values.expand((v) => v as List).join(' ');
      if (data['detail'] is String) return data['detail'] as String;
    }
    if (error.response == null) return 'Không kết nối được máy chủ. Kiểm tra API đã chạy và API_URL đúng chưa.';
  }
  return 'Có lỗi xảy ra, thử lại sau.';
}

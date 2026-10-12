import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import 'session.dart';

/// Gọi API Features/Auth của backend. Mỗi tính năng có một repository như thế này trong `features/<tên>/data/`.
class AuthRepository {
  AuthRepository(this._dio);
  final Dio _dio;

  Future<(String token, AppUser user)> login(String email, String password) async {
    final res = await _dio.post<Map<String, dynamic>>('/api/auth/login', data: {'email': email, 'password': password});
    final body = res.data!;
    return (body['accessToken'] as String, AppUser.fromJson(body['user'] as Map<String, dynamic>));
  }
}

final authRepositoryProvider = Provider((ref) => AuthRepository(ref.watch(dioProvider)));

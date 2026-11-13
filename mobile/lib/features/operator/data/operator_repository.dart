import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/auth/session.dart';
import 'operator_models.dart';

/// Dữ liệu chung của khu người nuôi: tổng quan hôm nay và danh sách Lô của hộ nuôi.
abstract interface class OperatorRepository {
  Future<FarmDashboard> dashboard();
  Future<List<FarmBatch>> batches();
  Future<FarmBatch> batch(String code);
}

class ApiOperatorRepository implements OperatorRepository {
  ApiOperatorRepository(this.dio);
  final Dio dio;

  @override
  Future<FarmDashboard> dashboard() async => FarmDashboard.fromJson(await dio.getJson('/api/operators/me/dashboard'));

  @override
  Future<List<FarmBatch>> batches() async {
    final page = await dio.getJson('/api/operators/me/batches', query: {'page': 1, 'pageSize': 100});
    return [for (final b in asJsonList(page['items'])) FarmBatch.fromJson(b)];
  }

  @override
  Future<FarmBatch> batch(String code) async => FarmBatch.fromJson(await dio.getJson('/api/operators/me/batches/${Uri.encodeComponent(code)}'));
}

final operatorRepositoryProvider = Provider<OperatorRepository>((ref) => ApiOperatorRepository(ref.watch(dioProvider)));

/// Tài khoản đang đăng nhập: đổi tài khoản thì mọi dữ liệu của khu được tải lại.
final farmAccountProvider = Provider<(int?, String?)>((ref) {
  final session = ref.watch(sessionProvider);
  return (session.user?.userId, session.token);
});

final operatorDashboardProvider = FutureProvider.autoDispose<FarmDashboard>((ref) {
  ref.watch(farmAccountProvider);
  return ref.watch(operatorRepositoryProvider).dashboard();
}, retry: (_, _) => null);

final operatorBatchesProvider = FutureProvider.autoDispose<List<FarmBatch>>((ref) {
  ref.watch(farmAccountProvider);
  return ref.watch(operatorRepositoryProvider).batches();
}, retry: (_, _) => null);

final operatorBatchProvider = FutureProvider.autoDispose.family<FarmBatch, String>((ref, code) {
  ref.watch(farmAccountProvider);
  return ref.watch(operatorRepositoryProvider).batch(code);
}, retry: (_, _) => null);

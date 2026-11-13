import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/auth/session.dart';
import 'qc_models.dart';

/// Việc được phân và thông tin chung của Lô, dùng ở mọi màn của khu kiểm phẩm.
abstract interface class QcTaskRepository {
  Future<List<QcTask>> tasks();
  Future<BatchHead> batchHead(String batchCode);
}

class ApiQcTaskRepository implements QcTaskRepository {
  ApiQcTaskRepository(this.dio);
  final Dio dio;

  @override
  Future<List<QcTask>> tasks() async => [for (final j in await dio.getList('/api/qc/tasks')) QcTask.fromJson(j)];

  @override
  Future<BatchHead> batchHead(String batchCode) async =>
      BatchHead.fromJson(await dio.getJson('/api/batches/${Uri.encodeComponent(batchCode)}'));
}

final qcTaskRepositoryProvider = Provider<QcTaskRepository>((ref) => ApiQcTaskRepository(ref.watch(dioProvider)));

/// Mã người dùng đang đăng nhập, để biết việc nào, phiếu nào là của tôi.
final myUserIdProvider = Provider<int?>((ref) => ref.watch(sessionProvider.select((s) => s.user?.userId)));

/// Việc đang chờ của tôi. Tự hỏi lại mỗi phút vì việc được phân bất kỳ lúc nào.
final qcTasksProvider = FutureProvider.autoDispose<List<QcTask>>((ref) async {
  if (ref.watch(myUserIdProvider) == null) return const [];
  final timer = Timer(const Duration(minutes: 1), ref.invalidateSelf);
  ref.onDispose(timer.cancel);
  return ref.watch(qcTaskRepositoryProvider).tasks();
}, retry: (_, _) => null);

final batchHeadProvider = FutureProvider.autoDispose.family<BatchHead, String>(
  (ref, code) => ref.watch(qcTaskRepositoryProvider).batchHead(code),
  retry: (_, _) => null,
);

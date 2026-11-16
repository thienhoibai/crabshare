import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import 'operator_models.dart';
import 'operator_repository.dart';

abstract interface class AlertRepository {
  Future<List<AlertItem>> list();
  Future<AlertItem> acknowledge(int id, String note);
}

final alertRepositoryProvider = Provider<AlertRepository>((ref) => ApiAlertRepository(ref.watch(dioProvider)));

class ApiAlertRepository implements AlertRepository {
  ApiAlertRepository(this.dio);
  final Dio dio;

  @override
  Future<List<AlertItem>> list() async => [for (final a in await dio.getList('/api/operators/me/alerts')) AlertItem.fromJson(a)];

  @override
  Future<AlertItem> acknowledge(int id, String note) async =>
      AlertItem.fromJson(await dio.postJson('/api/alerts/$id/acknowledge', data: {'responseNote': note}));
}

class AlertsController extends AsyncNotifier<List<AlertItem>> {
  @override
  Future<List<AlertItem>> build() {
    ref.watch(farmAccountProvider);
    return ref.watch(alertRepositoryProvider).list();
  }

  /// Gửi phản hồi rồi thay cảnh báo trong danh sách bằng bản máy chủ trả về.
  Future<void> acknowledge(int id, String note) async {
    final account = ref.read(farmAccountProvider);
    final updated = await ref.read(alertRepositoryProvider).acknowledge(id, note);
    if (!ref.mounted || ref.read(farmAccountProvider) != account) return;
    state = AsyncData([for (final alert in state.value ?? <AlertItem>[]) alert.id == id ? updated : alert]);
    ref.invalidate(operatorDashboardProvider);
  }
}

final alertsProvider = AsyncNotifierProvider<AlertsController, List<AlertItem>>(AlertsController.new, retry: (_, _) => null);

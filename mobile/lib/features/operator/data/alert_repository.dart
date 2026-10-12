import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import 'operator_models.dart';

abstract interface class AlertRepository {
  Future<List<AlertItem>> list();
  Future<AlertItem> acknowledge(int id, String note);
}

final alertRepositoryProvider = Provider<AlertRepository>(
  (ref) => ApiAlertRepository(ref.watch(dioProvider)),
);

class ApiAlertRepository implements AlertRepository {
  ApiAlertRepository(this.dio);
  final Dio dio;
  @override
  Future<List<AlertItem>> list() async {
    final response = await dio.get<List<dynamic>>('/api/operators/me/alerts');
    return (response.data ?? [])
        .map(
          (value) =>
              AlertItem.fromJson(Map<String, dynamic>.from(value as Map)),
        )
        .toList();
  }

  @override
  Future<AlertItem> acknowledge(int id, String note) async {
    final response = await dio.post<Map<String, dynamic>>(
      '/api/alerts/$id/acknowledge',
      data: {'responseNote': note},
    );
    return AlertItem.fromJson(response.data!);
  }
}

class AlertsController extends AsyncNotifier<List<AlertItem>> {
  @override
  Future<List<AlertItem>> build() {
    ref.watch(sessionProvider.select((session) => session.user?.userId));
    return ref.watch(alertRepositoryProvider).list();
  }

  Future<void> acknowledge(int id, String note) async {
    final userId = ref.read(sessionProvider).user?.userId;
    final updated = await ref
        .read(alertRepositoryProvider)
        .acknowledge(id, note);
    if (!ref.mounted || ref.read(sessionProvider).user?.userId != userId) return;
    state = AsyncData([
      for (final alert in state.value ?? <AlertItem>[])
        alert.id == id ? updated : alert,
    ]);
  }
}

final alertsProvider = AsyncNotifierProvider<AlertsController, List<AlertItem>>(
  AlertsController.new,
);

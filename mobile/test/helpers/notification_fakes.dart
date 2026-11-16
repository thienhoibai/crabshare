import 'package:crabshare_mobile/features/investor/notifications/notification_repository.dart';
import 'package:dio/dio.dart';

class EmptyNotificationRepository implements NotificationRepository {
  @override
  Future<List<NotificationEvent>> list({CancelToken? cancelToken}) async => [];
}

class MemoryNotificationReadStore implements NotificationReadStore {
  final markers = <int, NotificationReadMarker>{};
  bool fail = false;
  @override
  Future<NotificationReadMarker> load(int userId) async =>
      markers[userId] ?? const NotificationReadMarker();
  @override
  Future<NotificationReadMarker> update(
    int userId,
    NotificationReadMarker Function(NotificationReadMarker) change,
  ) async {
    if (fail) throw StateError('Device storage failed');
    return markers[userId] = change(await load(userId));
  }
}

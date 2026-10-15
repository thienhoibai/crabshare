import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';

class NotificationEvent {
  const NotificationEvent({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.at,
    required this.batchCode,
    required this.canOpenPortfolio,
    this.amount,
  });
  final String id, type, title, body, batchCode;
  final DateTime at;
  final bool canOpenPortfolio;
  final int? amount;
  factory NotificationEvent.fromJson(Map<String, dynamic> j) =>
      NotificationEvent(
        id: j['id'] as String,
        type: j['type'] as String,
        title: j['title'] as String,
        body: j['body'] as String,
        at: DateTime.parse(j['at'] as String),
        batchCode: j['batchCode'] as String,
        canOpenPortfolio: j['canOpenPortfolio'] as bool,
        amount: j['amount'] as int?,
      );
}

abstract interface class NotificationRepository {
  Future<List<NotificationEvent>> list({CancelToken? cancelToken});
}

class ApiNotificationRepository implements NotificationRepository {
  ApiNotificationRepository(this.dio);
  final Dio dio;
  @override
  Future<List<NotificationEvent>> list({CancelToken? cancelToken}) async {
    final items = <NotificationEvent>[];
    String? until;
    for (var page = 1; ; page++) {
      final data = (await dio.get<Map<String, dynamic>>(
        '/api/me/notifications',
        queryParameters: {'page': page, 'pageSize': 100, 'until': ?until},
        cancelToken: cancelToken,
      )).data!;
      until ??= data['asOf'] as String;
      final rows = data['items'] as List;
      items.addAll(
        rows.map(
          (r) =>
              NotificationEvent.fromJson(Map<String, dynamic>.from(r as Map)),
        ),
      );
      if (rows.isEmpty || page * 100 >= (data['total'] as int)) break;
    }
    return items;
  }
}

final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => ApiNotificationRepository(ref.watch(dioProvider)),
);
final notificationPollIntervalProvider = Provider<Duration?>(
  (ref) => const Duration(seconds: 30),
);
final investorNotificationsProvider =
    FutureProvider.autoDispose<List<NotificationEvent>>((ref) {
      final user = ref.watch(sessionProvider.select((s) => s.user));
      if (user == null || !user.isInvestor) {
        throw StateError('Bạn cần đăng nhập bằng tài khoản nhà đầu tư.');
      }
      final cancel = CancelToken();
      ref.onDispose(() => cancel.cancel());
      final interval = ref.watch(notificationPollIntervalProvider);
      if (interval != null) {
        final timer = Timer.periodic(interval, (_) {
          if (WidgetsBinding.instance.lifecycleState ==
              AppLifecycleState.resumed) {
            ref.invalidateSelf();
          }
        });
        ref.onDispose(timer.cancel);
      }
      return ref
          .watch(notificationRepositoryProvider)
          .list(cancelToken: cancel);
    }, retry: (count, error) => null);

// The boundary IDs keep a later event with the same timestamp unread. A device clock is never used.
class NotificationReadMarker {
  const NotificationReadMarker({
    this.through,
    this.boundaryIds = const {},
    this.itemIds = const {},
  });
  final DateTime? through;
  final Set<String> boundaryIds, itemIds;
  bool isUnread(NotificationEvent n) =>
      !itemIds.contains(n.id) &&
      (through == null ||
          n.at.isAfter(through!) ||
          (n.at.isAtSameMomentAs(through!) && !boundaryIds.contains(n.id)));
  NotificationReadMarker one(NotificationEvent n) => NotificationReadMarker(
    through: through,
    boundaryIds: boundaryIds,
    itemIds: {...itemIds, n.id},
  );
  NotificationReadMarker all(List<NotificationEvent> items) {
    if (items.isEmpty) return this;
    final latest = items
        .map((n) => n.at)
        .reduce((a, b) => a.isAfter(b) ? a : b);
    if (through != null && latest.isBefore(through!)) return this;
    return NotificationReadMarker(
      through: latest,
      boundaryIds: {
        if (through != null && latest.isAtSameMomentAs(through!))
          ...boundaryIds,
        ...items.where((n) => n.at.isAtSameMomentAs(latest)).map((n) => n.id),
      },
      itemIds: itemIds.difference(items.map((n) => n.id).toSet()),
    );
  }

  String encode() => jsonEncode({
    'through': through?.toUtc().toIso8601String(),
    'boundaryIds': boundaryIds.toList(),
    'itemIds': itemIds.toList(),
  });
  static NotificationReadMarker decode(String? raw) {
    try {
      final j = jsonDecode(raw ?? 'null') as Map<String, dynamic>;
      return NotificationReadMarker(
        through: j['through'] == null
            ? null
            : DateTime.parse(j['through'] as String),
        boundaryIds: (j['boundaryIds'] as List).cast<String>().toSet(),
        itemIds: (j['itemIds'] as List).cast<String>().toSet(),
      );
    } catch (_) {
      return const NotificationReadMarker();
    }
  }
}

abstract interface class NotificationReadStore {
  Future<NotificationReadMarker> load(int userId);
  Future<NotificationReadMarker> update(
    int userId,
    NotificationReadMarker Function(NotificationReadMarker) change,
  );
}

class SecureNotificationReadStore implements NotificationReadStore {
  final _storage = const FlutterSecureStorage();
  Future<void> _tail = Future.value();
  String _key(int id) => 'crabshare.notification-read.$id';
  @override
  Future<NotificationReadMarker> load(int userId) async =>
      NotificationReadMarker.decode(await _storage.read(key: _key(userId)));
  @override
  Future<NotificationReadMarker> update(
    int userId,
    NotificationReadMarker Function(NotificationReadMarker) change,
  ) {
    final operation = _tail.then((_) async {
      final next = change(await load(userId));
      await _storage.write(key: _key(userId), value: next.encode());
      return next;
    });
    _tail = operation.then<void>(
      (_) {},
      onError: (Object error, StackTrace stack) {},
    );
    return operation;
  }
}

final notificationReadStoreProvider = Provider<NotificationReadStore>(
  (ref) => SecureNotificationReadStore(),
);

class NotificationReadState {
  const NotificationReadState({
    this.userId,
    this.marker = const NotificationReadMarker(),
    this.saving = false,
    this.error,
  });
  final NotificationReadMarker marker;
  final int? userId;
  final bool saving;
  final String? error;
}

class NotificationReadController extends AsyncNotifier<NotificationReadState> {
  @override
  Future<NotificationReadState> build() async {
    final id = ref.watch(sessionProvider.select((s) => s.user?.userId));
    if (id == null) return const NotificationReadState();
    try {
      return NotificationReadState(
        userId: id,
        marker: await ref.watch(notificationReadStoreProvider).load(id),
      );
    } catch (_) {
      return NotificationReadState(
        userId: id,
        error: 'Không đọc được mốc đã đọc trên thiết bị này.',
      );
    }
  }

  Future<bool> mark({
    NotificationEvent? one,
    List<NotificationEvent>? all,
  }) async {
    final id = ref.read(sessionProvider).user?.userId;
    final old = state.value;
    if (id == null || old == null || old.userId != id || old.saving) {
      return false;
    }
    state = AsyncData(
      NotificationReadState(userId: id, marker: old.marker, saving: true),
    );
    try {
      final next = await ref
          .read(notificationReadStoreProvider)
          .update(id, (m) => one == null ? m.all(all ?? []) : m.one(one));
      if (ref.mounted && ref.read(sessionProvider).user?.userId == id) {
        state = AsyncData(NotificationReadState(userId: id, marker: next));
      }
      return true;
    } catch (_) {
      if (ref.mounted && ref.read(sessionProvider).user?.userId == id) {
        state = AsyncData(
          NotificationReadState(
            userId: id,
            marker: old.marker,
            error: 'Không lưu được mốc đã đọc trên thiết bị này.',
          ),
        );
      }
      return false;
    }
  }
}

final notificationReadProvider =
    AsyncNotifierProvider.autoDispose<
      NotificationReadController,
      NotificationReadState
    >(NotificationReadController.new);
final unreadNotificationsProvider = Provider.autoDispose<int>((ref) {
  final events = ref.watch(investorNotificationsProvider);
  final read = ref.watch(notificationReadProvider);
  final userId = ref.watch(sessionProvider.select((s) => s.user?.userId));
  if (events.hasError ||
      events.isLoading ||
      !events.hasValue ||
      !read.hasValue ||
      read.value!.userId != userId) {
    return 0;
  }
  return events.value!.where(read.value!.marker.isUnread).length;
});

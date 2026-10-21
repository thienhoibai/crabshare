import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';

class TagListItem {
  const TagListItem({
    required this.tagId,
    required this.tagCode,
    required this.status,
    required this.batchCode,
    required this.itemUuid,
    required this.printedAt,
  });

  final int tagId;
  final String tagCode;
  final String status;
  final String batchCode;
  final String itemUuid;
  final DateTime printedAt;

  factory TagListItem.fromJson(Map<String, dynamic> json) => TagListItem(
    tagId: (json['tagId'] as num).toInt(),
    tagCode: json['tagCode'] as String,
    status: json['status'] as String,
    batchCode: json['batchCode'] as String,
    itemUuid: json['itemUuid'] as String,
    printedAt: DateTime.parse(json['printedAt'] as String).toLocal(),
  );
}

class TagPage {
  const TagPage({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<TagListItem> items;
  final int total;
  final int page;
  final int pageSize;

  factory TagPage.fromJson(Map<String, dynamic> json) => TagPage(
    items: (json['items'] as List)
        .map(
          (item) =>
              TagListItem.fromJson(Map<String, dynamic>.from(item as Map)),
        )
        .toList(),
    total: (json['total'] as num).toInt(),
    page: (json['page'] as num).toInt(),
    pageSize: (json['pageSize'] as num).toInt(),
  );
}

class TagLifecycle {
  const TagLifecycle({
    required this.tagId,
    required this.tagCode,
    required this.status,
    this.activationEvidenceId,
    this.activatedAt,
  });

  final int tagId;
  final String tagCode;
  final String status;
  final int? activationEvidenceId;
  final DateTime? activatedAt;

  factory TagLifecycle.fromJson(Map<String, dynamic> json) => TagLifecycle(
    tagId: (json['tagId'] as num).toInt(),
    tagCode: json['tagCode'] as String,
    status: json['status'] as String,
    activationEvidenceId: (json['activationEvidenceId'] as num?)?.toInt(),
    activatedAt: json['activatedAt'] == null
        ? null
        : DateTime.parse(json['activatedAt'] as String).toLocal(),
  );
}

abstract interface class TagRepository {
  Future<TagPage> list({required String status, int page = 1});
  Future<TagLifecycle> activate(String tagCode, int evidenceId);
}

class ApiTagRepository implements TagRepository {
  ApiTagRepository(this.dio);
  final Dio dio;

  @override
  Future<TagPage> list({required String status, int page = 1}) async =>
      TagPage.fromJson(
        (await dio.get<Map<String, dynamic>>(
          '/api/tags',
          queryParameters: {'status': status, 'page': page, 'pageSize': 20},
        )).data!,
      );

  @override
  Future<TagLifecycle> activate(String tagCode, int evidenceId) async =>
      TagLifecycle.fromJson(
        (await dio.post<Map<String, dynamic>>(
          '/api/tags/${Uri.encodeComponent(tagCode)}/activate',
          data: {'evidenceId': evidenceId},
        )).data!,
      );
}

final tagRepositoryProvider = Provider<TagRepository>(
  (ref) => ApiTagRepository(ref.watch(dioProvider)),
);

final printedTagsProvider = FutureProvider.autoDispose
    .family<TagPage, (SessionState, int)>(
      (ref, request) => ref
          .watch(tagRepositoryProvider)
          .list(status: 'Printed', page: request.$2),
    );

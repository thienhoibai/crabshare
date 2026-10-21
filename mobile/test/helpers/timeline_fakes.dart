import 'dart:typed_data';

import 'package:crabshare_mobile/features/investor/data/timeline_repository.dart';
import 'package:dio/dio.dart';

/// Page tests isolate timeline I/O; timeline behavior has its own test suite.
class EmptyTimelineRepository implements TimelineRepository {
  final requestedCodes = <String>[];

  @override
  Future<TimelinePage> timeline(
    String code, {
    String? before,
    CancelToken? cancelToken,
  }) async {
    requestedCodes.add(code);
    return TimelinePage.fromJson({
      'batchCode': code,
      'timeZone': 'Asia/Ho_Chi_Minh',
      'groups': [],
      'hasMore': false,
      'nextBefore': null,
    });
  }

  @override
  Future<Uint8List> file(
    String code,
    String id, {
    CancelToken? cancelToken,
  }) => throw StateError('An empty timeline must not request evidence files.');
}

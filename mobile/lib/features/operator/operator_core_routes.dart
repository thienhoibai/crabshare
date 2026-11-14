import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import 'alerts/alerts_page.dart';
import 'batches/operator_batch_page.dart';
import 'evidence/capture_page.dart';
import 'evidence/evidence_explanation_page.dart';
import 'logs/daily_log_form_page.dart';
import 'logs/daily_logs_page.dart';

/// Màn con của khu người nuôi, nhóm lõi: sơ đồ hộp của một Lô, nhật ký chăm sóc, cảnh báo, chụp ảnh tại hộp, giải trình ảnh.
/// Hai tab gốc (Hôm nay, Lô) khai ở operator_routes.dart.
List<RouteBase> operatorCoreRoutes() => [
  GoRoute(
    path: '/o/batches/:code',
    builder: (context, state) => OperatorBatchPage(code: state.pathParameters['code'] ?? ''),
  ),
  GoRoute(path: Routes.operatorLogs, builder: (context, state) => const DailyLogsPage()),
  GoRoute(
    path: Routes.dailyLogNew,
    builder: (context, state) => DailyLogFormPage(initialBatchCode: state.uri.queryParameters['batch']),
  ),
  GoRoute(path: Routes.operatorAlerts, builder: (context, state) => const AlertsPage()),
  GoRoute(path: Routes.flaggedEvidence, builder: (context, state) => const FlaggedEvidencePage()),
  GoRoute(
    path: '/o/evidence/:id',
    builder: (context, state) => EvidenceExplanationPage(id: int.tryParse(state.pathParameters['id'] ?? '') ?? 0),
  ),
  GoRoute(
    path: Routes.capture,
    builder: (context, state) {
      final query = state.uri.queryParameters;
      return CapturePage(
        initialSlot: query['slot'],
        // Mã yêu cầu sai định dạng vẫn mở ở chế độ yêu cầu chụp để máy chủ từ chối, không gửi nhầm thành ảnh tự do.
        captureRequestId: query.containsKey('requestId') ? int.tryParse(query['requestId']!) ?? -1 : null,
        requestBatchCode: query['batch'],
        requestDueAt: DateTime.tryParse(query['dueAt'] ?? ''),
      );
    },
  ),
];

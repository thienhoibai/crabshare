import 'package:go_router/go_router.dart';

import '../../app/routes.dart';
import 'scan_page.dart';
import 'trace_result_page.dart';

/// Màn công khai: quét mã QR trên đơn và xem trang truy xuất. Không cần đăng nhập.
List<RouteBase> traceRoutes() => [
  GoRoute(path: Routes.scan, builder: (context, state) => const ScanPage()),
  GoRoute(
    path: '/trace/:code',
    builder: (context, state) => TraceResultPage(traceCode: state.pathParameters['code']!),
  ),
];

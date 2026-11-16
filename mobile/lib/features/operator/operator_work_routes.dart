import 'package:go_router/go_router.dart';

import 'delivery/shipment_page.dart';
import 'measure/measure_page.dart';

/// Màn con của khu người nuôi, nhóm việc tại trạm và giao hàng:
///   /o/measure/:batch   đo cua của một Lô (Routes.operatorMeasure)
///   /o/shipments/:no    một chuyến giao với hai lần cân (Routes.operatorShipment); thêm `?batch=` khi đã biết Lô
///                       (ShipmentPage.location) để màn không phải dò qua các Lô.
/// Tab "Giao hàng" (DeliveriesPage) khai ở operator_routes.dart.
List<RouteBase> operatorWorkRoutes() => [
  GoRoute(
    path: '/o/measure/:batch',
    builder: (context, state) => MeasurePage(batchCode: state.pathParameters['batch']!),
  ),
  GoRoute(
    path: '/o/shipments/:no',
    builder: (context, state) =>
        ShipmentPage(shipmentNo: state.pathParameters['no']!, batchCode: state.uri.queryParameters['batch']),
  ),
];

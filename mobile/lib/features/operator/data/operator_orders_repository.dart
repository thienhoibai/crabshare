import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import 'packing_models.dart';

/// Đơn hàng phía hộ nuôi (UC29 đóng gói, UC30 giao hàng). Mặc định gọi API thật;
/// [MockOperatorOrdersRepository] chỉ dùng cho test và màn mẫu.
abstract interface class OperatorOrdersRepository {
  Future<List<OperatorOrderSummary>> list(String status);
  Future<OperatorOrderDetail> detail(String orderNo);
  Future<OperatorOrderDetail> pack(String orderNo, List<String> tagCodes);
  Future<OperatorOrderDetail> ship(String orderNo, ShipOrderInput input);
  Future<OperatorOrderDetail> deliver(String orderNo);
}

final operatorOrdersRepositoryProvider = Provider<OperatorOrdersRepository>(
  (ref) => ApiOperatorOrdersRepository(ref.watch(dioProvider)),
);

/// Danh sách đơn theo trạng thái; đổi tài khoản thì tải lại.
final operatorOrdersProvider =
    FutureProvider.family<List<OperatorOrderSummary>, String>((ref, status) {
      ref.watch(sessionProvider.select((session) => session.user?.userId));
      return ref.watch(operatorOrdersRepositoryProvider).list(status);
    });

class ApiOperatorOrdersRepository implements OperatorOrdersRepository {
  ApiOperatorOrdersRepository(this.dio);
  final Dio dio;

  static String _no(String orderNo) => Uri.encodeComponent(orderNo);

  OperatorOrderDetail _detail(Response<Map<String, dynamic>> response) =>
      OperatorOrderDetail.fromJson(response.data!);

  @override
  Future<List<OperatorOrderSummary>> list(String status) async {
    final response = await dio.get<List<dynamic>>(
      '/api/operators/me/orders',
      queryParameters: {'status': status},
    );
    return [
      for (final value in response.data ?? const [])
        OperatorOrderSummary.fromJson(Map<String, dynamic>.from(value as Map)),
    ];
  }

  @override
  Future<OperatorOrderDetail> detail(String orderNo) async => _detail(
    await dio.get<Map<String, dynamic>>(
      '/api/operators/me/orders/${_no(orderNo)}',
    ),
  );

  @override
  Future<OperatorOrderDetail> pack(
    String orderNo,
    List<String> tagCodes,
  ) async => _detail(
    await dio.post<Map<String, dynamic>>(
      '/api/orders/${_no(orderNo)}/pack',
      data: {'tagCodes': tagCodes},
    ),
  );

  @override
  Future<OperatorOrderDetail> ship(
    String orderNo,
    ShipOrderInput input,
  ) async => _detail(
    await dio.post<Map<String, dynamic>>(
      '/api/orders/${_no(orderNo)}/ship',
      data: input.toJson(),
    ),
  );

  @override
  Future<OperatorOrderDetail> deliver(String orderNo) async => _detail(
    await dio.post<Map<String, dynamic>>('/api/orders/${_no(orderNo)}/deliver'),
  );
}

/// Dữ liệu mẫu trong bộ nhớ (test, màn mẫu): một đơn Paid `ODPACKDEMO01`, đi đủ Paid → Packed → Shipping → Delivered.
class MockOperatorOrdersRepository implements OperatorOrdersRepository {
  MockOperatorOrdersRepository() : _order = _samplePaid();

  OperatorOrderDetail _order;

  static Future<T> _delay<T>(T value) =>
      Future.delayed(const Duration(milliseconds: 300), () => value);

  static OperatorOrderDetail _samplePaid() {
    final now = DateTime.now();
    return OperatorOrderDetail(
      orderNo: 'ODPACKDEMO01',
      status: 'Paid',
      placedAt: now.subtract(const Duration(hours: 2)),
      paidAt: now.subtract(const Duration(hours: 1)),
      batchCode: 'CS-2609-04',
      customerName: 'Nguyễn Văn An',
      recipientName: 'Nguyễn Văn An',
      recipientPhone: '0901234567',
      shippingAddress: '12 Nguyễn Huệ, Cà Mau',
      totalAmount: 400000,
      totalKg: 1,
      lines: const [
        OperatorOrderLine(
          orderLineId: 1,
          title: 'Cua thịt L1 — lô CS-2609-04',
          gradeCode: 'L1',
          gradeName: 'Loại 1 (từ 500 g)',
          quantityKg: 1,
          assignedKg: 0,
          assignedCount: 0,
          tags: [],
        ),
      ],
    );
  }

  OperatorOrderDetail _copy({
    required String status,
    List<OperatorOrderLine>? lines,
    OrderShipment? shipment,
  }) => OperatorOrderDetail(
    orderNo: _order.orderNo,
    status: status,
    placedAt: _order.placedAt,
    paidAt: _order.paidAt,
    batchCode: _order.batchCode,
    customerName: _order.customerName,
    recipientName: _order.recipientName,
    recipientPhone: _order.recipientPhone,
    shippingAddress: _order.shippingAddress,
    totalAmount: _order.totalAmount,
    totalKg: _order.totalKg,
    lines: lines ?? _order.lines,
    shipment: shipment ?? _order.shipment,
  );

  void _expect(String status) {
    if (_order.status != status) {
      throw Exception(
        'Đơn ${_order.orderNo} đang ở trạng thái ${_order.status}, thao tác này chỉ dùng cho đơn $status.',
      );
    }
  }

  @override
  Future<List<OperatorOrderSummary>> list(String status) => _delay([
    if (_order.status == status)
      OperatorOrderSummary(
        orderNo: _order.orderNo,
        status: _order.status,
        placedAt: _order.placedAt,
        paidAt: _order.paidAt,
        batchCode: _order.batchCode,
        customerName: _order.customerName,
        lineCount: _order.lines.length,
        totalKg: _order.totalKg,
        totalAmount: _order.totalAmount,
      ),
  ]);

  @override
  Future<OperatorOrderDetail> detail(String orderNo) => _delay(_order);

  @override
  Future<OperatorOrderDetail> pack(String orderNo, List<String> tagCodes) {
    if (tagCodes.length < 2) {
      return Future.error(
        Exception('Tổng khối lượng cua quét chưa đủ số kg khách đặt.'),
      );
    }
    _expect('Paid');
    final line = _order.lines.first;
    _order = _copy(
      status: 'Packed',
      lines: [
        OperatorOrderLine(
          orderLineId: line.orderLineId,
          title: line.title,
          gradeCode: line.gradeCode,
          gradeName: line.gradeName,
          quantityKg: line.quantityKg,
          assignedKg: 1,
          assignedCount: tagCodes.length,
          tags: [
            for (final code in tagCodes)
              PackedTag(tagCode: code, weightG: 500, gradeCode: 'L1'),
          ],
        ),
      ],
    );
    return _delay(_order);
  }

  @override
  Future<OperatorOrderDetail> ship(String orderNo, ShipOrderInput input) {
    _expect('Packed');
    _order = _copy(
      status: 'Shipping',
      shipment: OrderShipment(
        carrierName: input.carrierName,
        vehiclePlate: input.vehiclePlate?.toUpperCase(),
        driverPhone: input.driverPhone,
        expectedArrivalAt: input.expectedArrivalAt,
        note: input.note,
        shippedAt: DateTime.now(),
      ),
    );
    return _delay(_order);
  }

  @override
  Future<OperatorOrderDetail> deliver(String orderNo) {
    _expect('Shipping');
    final s = _order.shipment!;
    final now = DateTime.now();
    _order = _copy(
      status: 'Delivered',
      shipment: OrderShipment(
        carrierName: s.carrierName,
        vehiclePlate: s.vehiclePlate,
        driverPhone: s.driverPhone,
        expectedArrivalAt: s.expectedArrivalAt,
        note: s.note,
        shippedAt: s.shippedAt,
        deliveredAt: now,
        returnWindowEndsAt: now.add(const Duration(hours: 72)),
      ),
    );
    return _delay(_order);
  }
}

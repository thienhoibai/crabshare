import 'package:dio/dio.dart';

import '../../../core/api/json.dart';
import 'customer_models.dart';

/// Các lệnh gọi API của khu khách hàng: đơn đặt trước, chuyến giao và nghiệm thu, khiếu nại, đánh giá, Lô đang mở.
abstract interface class CustomerRepository {
  /// Đơn đặt trước của tôi, mới nhất trước (tối đa 100 đơn mỗi trang).
  Future<Paged<Preorder>> orders({int page = 1});
  Future<Preorder> order(String orderNo);

  /// Chuyến giao, nghiệm thu và hoá đơn của một đơn.
  Future<OrderDeliveries> deliveries(String orderNo);
  Future<Preorder> cancelOrder(String orderNo, {String? reason});
  Future<Shipment> confirmAcceptance(String shipmentNo);

  /// Từ chối nhận hàng: mất tiền cọc chưa dùng.
  Future<Shipment> refuseDelivery(String shipmentNo, String reason);
  Future<Claim> createClaim(String orderNo, ClaimDraft draft);
  Future<Claim> claim(String claimNo);

  /// Đồng ý thì chốt theo phản hồi của người nuôi; không đồng ý thì chuyển Admin.
  Future<Claim> replyClaim(String claimNo, {required bool agree});
  Future<OrderRating> rate(String orderNo, {required int stars, String? comment});

  /// Các Lô đang mở (gọi vốn hoặc nhận đặt trước).
  Future<List<OpenBatch>> openBatches();
}

String _enc(String value) => Uri.encodeComponent(value);

class ApiCustomerRepository implements CustomerRepository {
  ApiCustomerRepository(this.dio);
  final Dio dio;

  @override
  Future<Paged<Preorder>> orders({int page = 1}) async =>
      Paged.fromJson(await dio.getJson('/api/preorders', query: {'page': page, 'pageSize': 100}), Preorder.fromJson);

  @override
  Future<Preorder> order(String orderNo) async => Preorder.fromJson(await dio.getJson('/api/preorders/${_enc(orderNo)}'));

  @override
  Future<OrderDeliveries> deliveries(String orderNo) async =>
      OrderDeliveries.fromJson(await dio.getJson('/api/preorders/${_enc(orderNo)}/deliveries'));

  @override
  Future<Preorder> cancelOrder(String orderNo, {String? reason}) async {
    final text = reason?.trim() ?? '';
    return Preorder.fromJson(
      await dio.postJson('/api/preorders/${_enc(orderNo)}/cancel', data: {'reason': text.isEmpty ? null : text}),
    );
  }

  @override
  Future<Shipment> confirmAcceptance(String shipmentNo) async =>
      Shipment.fromJson(await dio.postJson('/api/shipments/${_enc(shipmentNo)}/acceptance/confirm'));

  @override
  Future<Shipment> refuseDelivery(String shipmentNo, String reason) async => Shipment.fromJson(
    await dio.postJson('/api/shipments/${_enc(shipmentNo)}/acceptance/refuse', data: {'reason': reason.trim()}),
  );

  @override
  Future<Claim> createClaim(String orderNo, ClaimDraft draft) async {
    final form = FormData.fromMap({
      'ShipmentNo': draft.shipmentNo,
      'SpecCode': draft.specCode,
      'ClaimType': draft.claimType,
      'IssueType': draft.issueType,
      if (draft.affectedCrabs != null) 'AffectedCrabs': '${draft.affectedCrabs}',
      if (draft.affectedKg != null) 'AffectedKg': draft.affectedKg!.toString(),
      'Description': draft.description.trim(),
      'Photo': MultipartFile.fromBytes(
        draft.photo.bytes,
        filename: 'photo.jpg',
        contentType: DioMediaType.parse(draft.photo.contentType),
      ),
    });
    return Claim.fromJson(await dio.postJson('/api/preorders/${_enc(orderNo)}/claims', data: form));
  }

  @override
  Future<Claim> claim(String claimNo) async => Claim.fromJson(await dio.getJson('/api/claims/${_enc(claimNo)}'));

  @override
  Future<Claim> replyClaim(String claimNo, {required bool agree}) async =>
      Claim.fromJson(await dio.postJson('/api/claims/${_enc(claimNo)}/customer-reply', data: {'agree': agree}));

  @override
  Future<OrderRating> rate(String orderNo, {required int stars, String? comment}) async {
    final text = comment?.trim() ?? '';
    return OrderRating.fromJson(
      await dio.postJson('/api/preorders/${_enc(orderNo)}/rating', data: {'stars': stars, 'comment': text.isEmpty ? null : text}),
    );
  }

  @override
  Future<List<OpenBatch>> openBatches() async {
    final page = await dio.getJson('/api/batches', query: {'scope': 'open', 'pageSize': 60});
    return [for (final b in asJsonList(page['items'])) OpenBatch.fromJson(b)];
  }
}

/// Đường dẫn ảnh bằng chứng của một khiếu nại (cần đăng nhập, dùng với AuthImage).
String claimPhotoPath(String claimNo) => '/api/claims/${_enc(claimNo)}/photo';

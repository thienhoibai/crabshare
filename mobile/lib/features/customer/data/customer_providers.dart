import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/auth/session.dart';
import 'claim_memory.dart';
import 'customer_models.dart';
import 'customer_repository.dart';

final customerRepositoryProvider = Provider<CustomerRepository>((ref) => ApiCustomerRepository(ref.watch(dioProvider)));

/// Đổi người đăng nhập thì mọi dữ liệu của khu khách hàng tải lại.
int? _userId(Ref ref) => ref.watch(sessionProvider.select((session) => session.user?.userId));

/// Đơn đặt trước của tôi, mới nhất trước.
final myOrdersProvider = FutureProvider.autoDispose<Paged<Preorder>>((ref) {
  _userId(ref);
  return ref.watch(customerRepositoryProvider).orders();
}, retry: (_, _) => null);

final orderProvider = FutureProvider.autoDispose.family<Preorder, String>((ref, orderNo) {
  _userId(ref);
  return ref.watch(customerRepositoryProvider).order(orderNo);
}, retry: (_, _) => null);

final orderDeliveriesProvider = FutureProvider.autoDispose.family<OrderDeliveries, String>((ref, orderNo) {
  _userId(ref);
  return ref.watch(customerRepositoryProvider).deliveries(orderNo);
}, retry: (_, _) => null);

/// Chuyến giao của mọi đơn đã tới bước giao hàng; dùng chung dữ liệu với màn chi tiết đơn.
final myShipmentsProvider = FutureProvider.autoDispose<List<Shipment>>((ref) async {
  final orders = await ref.watch(myOrdersProvider.future);
  final deliveries = await Future.wait([
    for (final o in orders.items)
      if (o.hasDeliveries) ref.watch(orderDeliveriesProvider(o.orderNo).future),
  ]);
  return [for (final d in deliveries) ...d.shipments];
}, retry: (_, _) => null);

/// Lô đang nhận đặt trước.
final preorderBatchesProvider = FutureProvider.autoDispose<List<OpenBatch>>((ref) async {
  final batches = await ref.watch(customerRepositoryProvider).openBatches();
  return [
    for (final b in batches)
      if (b.takesPreorders()) b,
  ];
}, retry: (_, _) => null);

final claimProvider = FutureProvider.autoDispose.family<Claim, String>((ref, claimNo) {
  _userId(ref);
  return ref.watch(customerRepositoryProvider).claim(claimNo);
}, retry: (_, _) => null);

/// Khiếu nại của một đơn mà máy này còn nhớ mã. Mã không còn xem được (404, 403) thì bỏ qua.
final orderClaimsProvider = FutureProvider.autoDispose.family<List<Claim>, String>((ref, orderNo) async {
  final userId = _userId(ref);
  if (userId == null) return const [];
  final numbers = await ref.watch(claimMemoryProvider).claims(userId, orderNo);
  final claims = <Claim>[];
  for (final claimNo in numbers) {
    try {
      claims.add(await ref.watch(claimProvider(claimNo).future));
    } on DioException catch (error) {
      final code = error.response?.statusCode;
      if (code != 404 && code != 403) rethrow;
    }
  }
  return claims;
}, retry: (_, _) => null);

/// Số sao đã đánh giá của đơn mà máy này còn nhớ; null là chưa đánh giá trên máy này.
final orderRatingProvider = FutureProvider.autoDispose.family<int?, String>((ref, orderNo) async {
  final userId = _userId(ref);
  return userId == null ? null : ref.watch(claimMemoryProvider).rating(userId, orderNo);
}, retry: (_, _) => null);

/// Lỗi có sẵn câu báo cho người dùng (không đến từ máy chủ).
class CustomerMessage implements Exception {
  const CustomerMessage(this.message);
  final String message;
}

String customerErrorMessage(Object error) => error is CustomerMessage ? error.message : apiErrorMessage(error);

/// Thao tác của khách trên đơn. Xong việc thì dữ liệu liên quan tự tải lại.
class CustomerActions {
  CustomerActions(this._ref);
  final Ref _ref;

  CustomerRepository get _repo => _ref.read(customerRepositoryProvider);
  int? get _user => _ref.read(sessionProvider).user?.userId;

  void _reloadOrder(String orderNo) {
    _ref.invalidate(orderProvider(orderNo));
    _ref.invalidate(orderDeliveriesProvider(orderNo));
    _ref.invalidate(myOrdersProvider);
  }

  Future<void> confirmAcceptance(Shipment shipment) async {
    await _repo.confirmAcceptance(shipment.shipmentNo);
    _reloadOrder(shipment.orderNo);
  }

  Future<void> refuseDelivery(Shipment shipment, String reason) async {
    await _repo.refuseDelivery(shipment.shipmentNo, reason);
    _reloadOrder(shipment.orderNo);
  }

  Future<void> cancelOrder(String orderNo, {String? reason}) async {
    await _repo.cancelOrder(orderNo, reason: reason);
    _reloadOrder(orderNo);
  }

  Future<Claim> createClaim(String orderNo, ClaimDraft draft) async {
    final claim = await _repo.createClaim(orderNo, draft);
    await _remember(orderNo, claim.claimNo);
    return claim;
  }

  /// Mở lại một khiếu nại theo mã (khi máy này chưa nhớ mã đó).
  Future<Claim> openClaimByCode(String orderNo, String code) async {
    final claim = await _repo.claim(code.trim().toUpperCase());
    if (claim.orderNo != orderNo) throw CustomerMessage('Khiếu nại ${claim.claimNo} thuộc đơn ${claim.orderNo}.');
    await _remember(orderNo, claim.claimNo);
    return claim;
  }

  Future<Claim> replyClaim(Claim claim, {required bool agree}) async {
    final updated = await _repo.replyClaim(claim.claimNo, agree: agree);
    _ref.invalidate(claimProvider(claim.claimNo));
    _ref.invalidate(orderClaimsProvider(claim.orderNo));
    return updated;
  }

  Future<void> rate(String orderNo, {required int stars, String? comment}) async {
    final rating = await _repo.rate(orderNo, stars: stars, comment: comment);
    final userId = _user;
    if (userId != null) await _ref.read(claimMemoryProvider).rememberRating(userId, orderNo, rating.stars);
    _ref.invalidate(orderRatingProvider(orderNo));
  }

  Future<void> _remember(String orderNo, String claimNo) async {
    final userId = _user;
    if (userId != null) await _ref.read(claimMemoryProvider).rememberClaim(userId, orderNo, claimNo);
    _ref.invalidate(orderClaimsProvider(orderNo));
  }
}

final customerActionsProvider = Provider<CustomerActions>(CustomerActions.new);

/// Kéo để tải lại ở các tab: đơn và chuyến giao của mọi đơn.
Future<void> refreshMyOrders(WidgetRef ref) async {
  ref.invalidate(orderDeliveriesProvider);
  ref.invalidate(myOrdersProvider);
  await ref.read(myShipmentsProvider.future);
}

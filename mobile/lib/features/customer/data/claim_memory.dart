import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Ghi nhớ trên máy những thứ API chưa cho hỏi lại: mã khiếu nại khách đã gửi (chưa có danh sách khiếu nại của khách)
/// và số sao đã đánh giá của từng đơn (chưa có GET đánh giá). Dữ liệu thật vẫn lấy từ API theo mã.
abstract interface class ClaimMemory {
  Future<List<String>> claims(int userId, String orderNo);
  Future<void> rememberClaim(int userId, String orderNo, String claimNo);
  Future<int?> rating(int userId, String orderNo);
  Future<void> rememberRating(int userId, String orderNo, int stars);
}

/// Lưu theo từng người dùng trong kho bảo mật của máy. Máy không đọc được kho thì chỉ nhớ trong phiên đang mở.
class SecureClaimMemory implements ClaimMemory {
  SecureClaimMemory([this._storage = const FlutterSecureStorage()]);
  final FlutterSecureStorage _storage;
  final _cache = <int, Map<String, dynamic>>{};

  static String _key(int userId) => 'crabshare.customer.$userId';

  Future<Map<String, dynamic>> _load(int userId) async {
    final cached = _cache[userId];
    if (cached != null) return cached;
    var data = <String, dynamic>{};
    try {
      final raw = await _storage.read(key: _key(userId));
      if (raw != null) data = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      // Kho hỏng hoặc không đọc được: bắt đầu lại với bộ nhớ trống.
    }
    return _cache[userId] = data;
  }

  Future<void> _save(int userId, Map<String, dynamic> data) async {
    _cache[userId] = data;
    try {
      await _storage.write(key: _key(userId), value: jsonEncode(data));
    } catch (_) {
      // Không ghi được: vẫn nhớ trong phiên này.
    }
  }

  static Map<String, dynamic> _section(Map<String, dynamic> data, String name) =>
      data[name] is Map ? Map<String, dynamic>.from(data[name] as Map) : <String, dynamic>{};

  @override
  Future<List<String>> claims(int userId, String orderNo) async {
    final list = _section(await _load(userId), 'claims')[orderNo];
    return list is List ? [for (final c in list) c.toString()] : const [];
  }

  @override
  Future<void> rememberClaim(int userId, String orderNo, String claimNo) async {
    final data = Map<String, dynamic>.from(await _load(userId));
    final all = _section(data, 'claims');
    final current = all[orderNo] is List ? [for (final c in all[orderNo] as List) c.toString()] : <String>[];
    if (current.contains(claimNo)) return;
    all[orderNo] = [...current, claimNo];
    data['claims'] = all;
    await _save(userId, data);
  }

  @override
  Future<int?> rating(int userId, String orderNo) async {
    final stars = _section(await _load(userId), 'ratings')[orderNo];
    return stars is num ? stars.round() : null;
  }

  @override
  Future<void> rememberRating(int userId, String orderNo, int stars) async {
    final data = Map<String, dynamic>.from(await _load(userId));
    data['ratings'] = _section(data, 'ratings')..[orderNo] = stars;
    await _save(userId, data);
  }
}

final claimMemoryProvider = Provider<ClaimMemory>((ref) => SecureClaimMemory());

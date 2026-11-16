/// Mã truy xuất của đơn: "QR" và 10 ký tự Crockford base32 (không có I, L, O, U), ví dụ QR7K2M9XQ4TB.
final _traceCode = RegExp(r'^QR[0-9A-HJKMNP-TV-Z]{10}$');

/// Đọc nội dung mã QR in trên đơn: địa chỉ trang truy xuất `…/truy-xuat/<mã>` hoặc chính mã truy xuất.
/// Trả mã đã chuẩn hoá (chữ hoa); nội dung khác (kể cả mã tem từng con của bản cũ) trả null.
String? parseOrderTraceCode(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return null;

  if (value.contains('://')) {
    final uri = Uri.tryParse(value);
    final scheme = uri?.scheme.toLowerCase();
    if (uri == null || !uri.hasAuthority || uri.host.isEmpty || uri.userInfo.isNotEmpty || (scheme != 'http' && scheme != 'https')) {
      return null;
    }
    final segments = [
      for (final s in uri.pathSegments)
        if (s.isNotEmpty) s,
    ];
    if (segments.length < 2 || segments[segments.length - 2] != 'truy-xuat') return null;
    return _normalize(segments.last);
  }

  return _normalize(value);
}

String? _normalize(String value) {
  final upper = value.trim().toUpperCase();
  if (upper.length != 12 || !upper.startsWith('QR')) return null;
  // Người gõ tay hay nhầm O với 0, I và L với 1; bảng mã không có các chữ đó nên đổi lại cho đúng.
  final code = 'QR${upper.substring(2).replaceAll('O', '0').replaceAll(RegExp('[IL]'), '1')}';
  return _traceCode.hasMatch(code) ? code : null;
}

/// Chặn chuỗi nhận diện liên tiếp của camera mở trùng nhiều màn kết quả.
class TraceScanGate {
  bool _locked = false;

  String? accept(String? raw) {
    if (_locked || raw == null) return null;
    final code = parseOrderTraceCode(raw);
    if (code == null) return null;
    _locked = true;
    return code;
  }

  void reset() => _locked = false;
}

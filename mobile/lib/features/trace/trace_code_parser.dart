const _tagAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/// Reads either a raw VI-15 tag code or its published trace URL.
String? parseTraceTag(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return null;

  if (value.contains('://')) {
    final uri = Uri.tryParse(value);
    final scheme = uri?.scheme.toLowerCase();
    if (uri == null ||
        !uri.hasAuthority ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        (scheme != 'http' && scheme != 'https')) {
      return null;
    }
    final segments = uri.pathSegments;
    if (segments.length != 2 || segments.first != 'truy-xuat') return null;
    return _normalizeCode(segments.last);
  }

  return _normalizeCode(value);
}

String? _normalizeCode(String value) {
  final code = value.toUpperCase();
  if (code.length != 12 || code.any((character) => !_tagAlphabet.contains(character))) {
    return null;
  }
  return code;
}

/// Prevents a stream of camera detections from opening duplicate result pages.
class TraceScanGate {
  bool _locked = false;

  String? accept(String? raw) {
    if (_locked || raw == null) return null;
    final code = parseTraceTag(raw);
    if (code == null) return null;
    _locked = true;
    return code;
  }

  void reset() => _locked = false;
}

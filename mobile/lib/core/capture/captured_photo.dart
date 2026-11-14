import 'dart:typed_data';

/// Ảnh vừa chụp bằng camera trong ứng dụng, kèm giờ chụp trên máy và vị trí lúc chụp.
/// Ảnh bằng chứng không được chọn từ thư viện máy; mọi tính năng cần ảnh đều đi qua lớp này.
class CapturedPhoto {
  CapturedPhoto({
    required this.bytes,
    required this.capturedAt,
    required this.latitude,
    required this.longitude,
  }) {
    if (bytes.isEmpty || bytes.length > 5 * 1024 * 1024) {
      throw const FormatException(
        'Ảnh cần có dung lượng từ 1 byte đến 5 MB. Hãy chụp lại.',
      );
    }
    if (!latitude.isFinite ||
        !longitude.isFinite ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180) {
      throw const FormatException(
        'Chưa có vị trí hợp lệ. Hãy bật GPS và chụp lại.',
      );
    }
  }
  final Uint8List bytes;
  final DateTime capturedAt;
  final double latitude;
  final double longitude;
  String get contentType {
    if (bytes.length >= 3 &&
        bytes[0] == 255 &&
        bytes[1] == 216 &&
        bytes[2] == 255) {
      return 'image/jpeg';
    }
    if (bytes.length >= 8 &&
        [
          137,
          80,
          78,
          71,
          13,
          10,
          26,
          10,
        ].asMap().entries.every((e) => bytes[e.key] == e.value)) {
      return 'image/png';
    }
    if (bytes.length >= 12 &&
        String.fromCharCodes(bytes.take(4)) == 'RIFF' &&
        String.fromCharCodes(bytes.skip(8).take(4)) == 'WEBP') {
      return 'image/webp';
    }
    throw const FormatException(
      'Ảnh cần có định dạng JPEG, PNG hoặc WebP. Hãy chụp lại.',
    );
  }
}

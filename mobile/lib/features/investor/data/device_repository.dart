import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/auth/session.dart';

/// Ảnh hộp do camera của trại tự gửi. Đây là ảnh theo dõi, không phải bằng chứng đã thẩm định.
class DeviceImage {
  const DeviceImage({required this.id, required this.slotCode, required this.capturedAt, this.crabDetected});
  final int id;
  final String slotCode;
  final DateTime capturedAt;
  final bool? crabDetected;

  /// Đường dẫn tệp ảnh, cần đăng nhập (dùng với AuthImage).
  String get filePath => '/api/device-images/$id/file';

  factory DeviceImage.fromJson(Json j) => DeviceImage(
    id: intOf(j, 'deviceImageId'),
    slotCode: str(j, 'slotCode'),
    capturedAt: dateOf(j, 'capturedAt'),
    crabDetected: j['crabDetected'] as bool?,
  );
}

abstract interface class DeviceRepository {
  /// Ảnh mới nhất của mỗi hộp trong Lô, xếp theo mã hộp.
  Future<List<DeviceImage>> latestBoxImages(String batchCode);
}

class ApiDeviceRepository implements DeviceRepository {
  ApiDeviceRepository(this._dio);
  final Dio _dio;

  @override
  Future<List<DeviceImage>> latestBoxImages(String batchCode) async {
    final rows = await _dio.getList('/api/batches/${Uri.encodeComponent(batchCode)}/device-images');
    // Máy chủ trả ảnh mới trước: giữ ảnh đầu tiên của mỗi hộp.
    final latest = <String, DeviceImage>{};
    for (final row in rows) {
      final image = DeviceImage.fromJson(row);
      latest.putIfAbsent(image.slotCode, () => image);
    }
    return latest.values.toList()..sort((a, b) => a.slotCode.compareTo(b.slotCode));
  }
}

final deviceRepositoryProvider = Provider<DeviceRepository>((ref) => ApiDeviceRepository(ref.watch(dioProvider)));

final boxImagesProvider = FutureProvider.autoDispose.family<List<DeviceImage>, String>((ref, code) {
  ref.watch(sessionProvider.select((s) => s.user?.userId));
  return ref.watch(deviceRepositoryProvider).latestBoxImages(code);
}, retry: (_, _) => null);

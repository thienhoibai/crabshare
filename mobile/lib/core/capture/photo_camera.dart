import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import 'captured_photo.dart';

/// Lỗi khi chụp: chưa bật GPS, chưa cấp quyền vị trí. Thông báo đã viết sẵn cho người dùng.
class PhotoCaptureException implements Exception {
  const PhotoCaptureException(this.message);
  final String message;
}

/// Camera trong ứng dụng. Test thay bằng bản giả qua [photoCameraProvider].
abstract interface class PhotoCamera {
  /// Mở camera sau và trả ảnh kèm giờ chụp, vị trí. Người dùng huỷ thì trả null.
  Future<CapturedPhoto?> capture();

  /// Mở cài đặt vị trí hoặc cài đặt ứng dụng khi thiếu quyền.
  Future<void> openSettings();
}

class DevicePhotoCamera implements PhotoCamera {
  final _picker = ImagePicker();

  @override
  Future<CapturedPhoto?> capture() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const PhotoCaptureException('Hãy bật GPS để ghi vị trí ảnh chụp.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      throw const PhotoCaptureException('Cần quyền vị trí để gửi ảnh. Hãy cấp quyền trong cài đặt ứng dụng.');
    }
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (file == null) return null;
    final capturedAt = DateTime.now().toUtc();
    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
    );
    final photo = CapturedPhoto(
      bytes: await file.readAsBytes(),
      capturedAt: capturedAt,
      latitude: position.latitude,
      longitude: position.longitude,
    );
    photo.contentType; // Báo rõ định dạng lạ ngay lúc chụp, trước khi gửi.
    return photo;
  }

  @override
  Future<void> openSettings() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      await Geolocator.openLocationSettings();
    } else {
      await Geolocator.openAppSettings();
    }
  }
}

final photoCameraProvider = Provider<PhotoCamera>((ref) => DevicePhotoCamera());

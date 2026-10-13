import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import 'evidence_repository.dart';

class EvidenceCaptureException implements Exception {
  const EvidenceCaptureException(this.message);
  final String message;
}

abstract interface class EvidenceCamera {
  Future<EvidencePhoto?> capture();
  Future<void> openSettings();
}

class DeviceEvidenceCamera implements EvidenceCamera {
  final _picker = ImagePicker();
  @override
  Future<EvidencePhoto?> capture() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const EvidenceCaptureException(
        'Hãy bật GPS để ghi vị trí ảnh bằng chứng.',
      );
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw const EvidenceCaptureException(
        'Cần quyền vị trí để gửi bằng chứng. Hãy cấp quyền trong cài đặt ứng dụng.',
      );
    }
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (file == null) return null;
    final capturedAt = DateTime.now().toUtc();
    final position = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );
    final photo = EvidencePhoto(
      bytes: await file.readAsBytes(),
      capturedAt: capturedAt,
      latitude: position.latitude,
      longitude: position.longitude,
    );
    photo.contentType; // Camera iOS/Android có thể trả định dạng khác; báo rõ trước khi upload.
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

final evidenceCameraProvider = Provider<EvidenceCamera>(
  (ref) => DeviceEvidenceCamera(),
);

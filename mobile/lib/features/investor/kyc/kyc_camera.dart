import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'kyc_repository.dart';

abstract interface class KycCamera {
  Future<KycImage?> capture({required bool selfie});
}

class DeviceKycCamera implements KycCamera {
  @override
  Future<KycImage?> capture({required bool selfie}) async {
    final photo = await ImagePicker().pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: selfie ? CameraDevice.front : CameraDevice.rear,
      maxWidth: 1800,
      maxHeight: 1800,
      imageQuality: 85,
    );
    if (photo == null) return null;
    try {
      return KycImage.fromBytes(await photo.readAsBytes());
    } finally {
      if (!kIsWeb) {
        try {
          await File(photo.path).delete();
        } on FileSystemException {
          /* Cache được hệ điều hành thu hồi. */
        }
      }
    }
  }
}

final kycCameraProvider = Provider<KycCamera>((ref) => DeviceKycCamera());

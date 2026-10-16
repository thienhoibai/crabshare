import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';
import '../data/investor_models.dart';

class KycVerification {
  const KycVerification({
    required this.status,
    this.failureReason,
    this.verifiedAt,
  });
  final KycStatus status;
  final String? failureReason;
  final DateTime? verifiedAt;

  factory KycVerification.fromJson(Map<String, dynamic> json) =>
      KycVerification(
        status: switch (json['verificationStatus']) {
          'Unverified' => KycStatus.unverified,
          'Verified' => KycStatus.verified,
          'Rejected' => KycStatus.rejected,
          _ => throw const FormatException('Trạng thái xác minh không hợp lệ.'),
        },
        failureReason: (json['lastCheck'] as Map?)?['failureReason'] as String?,
        verifiedAt: json['verifiedAt'] == null
            ? null
            : DateTime.parse(json['verifiedAt'] as String),
      );
}

class KycImage {
  const KycImage({required this.bytes, required this.contentType});
  final Uint8List bytes;
  final String contentType;

  factory KycImage.fromBytes(Uint8List bytes) {
    if (bytes.isEmpty || bytes.length > 5 * 1024 * 1024) {
      throw const FormatException(
        'Mỗi ảnh cần có dung lượng từ 1 byte đến 5 MB. Hãy chụp lại.',
      );
    }
    final type =
        bytes.length >= 3 &&
            bytes[0] == 255 &&
            bytes[1] == 216 &&
            bytes[2] == 255
        ? 'image/jpeg'
        : bytes.length >= 8 &&
              [
                137,
                80,
                78,
                71,
                13,
                10,
                26,
                10,
              ].asMap().entries.every((e) => bytes[e.key] == e.value)
        ? 'image/png'
        : bytes.length >= 12 &&
              String.fromCharCodes(bytes.take(4)) == 'RIFF' &&
              String.fromCharCodes(bytes.skip(8).take(4)) == 'WEBP'
        ? 'image/webp'
        : null;
    if (type == null) {
      throw const FormatException(
        'Ảnh cần có định dạng JPEG, PNG hoặc WebP. Hãy chụp lại.',
      );
    }
    return KycImage(bytes: bytes, contentType: type);
  }
}

abstract interface class KycRepository {
  Future<KycVerification> status();
  Future<KycVerification> verify({
    required List<KycImage> images,
    required bool consent,
  });
}

class ApiKycRepository implements KycRepository {
  ApiKycRepository(this._dio);
  final Dio _dio;

  @override
  Future<KycVerification> status() async {
    final response = await _dio.get<Map<String, dynamic>>('/api/me/kyc');
    return KycVerification.fromJson(response.data!);
  }

  @override
  Future<KycVerification> verify({
    required List<KycImage> images,
    required bool consent,
  }) async {
    if (images.length != 3) {
      throw const FormatException('Cần đủ 3 ảnh xác minh.');
    }
    const fields = ['idCardFront', 'idCardBack', 'selfie'];
    final form = FormData.fromMap({
      'consent': consent.toString(),
      for (var i = 0; i < fields.length; i++)
        fields[i]: MultipartFile.fromBytes(
          images[i].bytes,
          filename: '${fields[i]}.${images[i].contentType.split('/').last}',
          contentType: DioMediaType.parse(images[i].contentType),
        ),
    });
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/kyc/ekyc',
      data: form,
      options: Options(
        sendTimeout: const Duration(seconds: 60),
        receiveTimeout: const Duration(seconds: 60),
      ),
    );
    return KycVerification.fromJson(response.data!);
  }
}

final kycRepositoryProvider = Provider<KycRepository>(
  (ref) => ApiKycRepository(ref.watch(dioProvider)),
);

class KycController extends AsyncNotifier<KycVerification> {
  @override
  Future<KycVerification> build() {
    final userId = ref.watch(sessionProvider.select((s) => s.user?.userId));
    if (userId == null) {
      return Future.error(
        StateError('Bạn cần đăng nhập để xem trạng thái xác minh.'),
      );
    }
    return ref.watch(kycRepositoryProvider).status();
  }

  Future<KycVerification> verify({
    required List<KycImage> images,
    required bool consent,
  }) async {
    final userId = ref.read(sessionProvider).user?.userId;
    final result = await ref
        .read(kycRepositoryProvider)
        .verify(images: images, consent: consent);
    if (ref.mounted && ref.read(sessionProvider).user?.userId == userId) {
      state = AsyncData(result);
    }
    return result;
  }
}

final kycDetailsProvider =
    AsyncNotifierProvider<KycController, KycVerification>(
      KycController.new,
      retry: (_, _) => null,
    );
final kycStatusProvider = Provider(
  (ref) => ref.watch(kycDetailsProvider).whenData((result) => result.status),
);

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/session.dart';

class PayoutInput {
  const PayoutInput({
    required this.bankCode,
    required this.accountNo,
    required this.accountHolderName,
  });
  final String bankCode;
  final String accountNo;
  final String accountHolderName;
  Map<String, dynamic> toJson() => {
    'bankCode': bankCode,
    'accountNo': accountNo,
    'accountHolderName': accountHolderName,
  };
}

class PayoutAccount extends PayoutInput {
  const PayoutAccount({
    required super.bankCode,
    required super.accountNo,
    required super.accountHolderName,
    required this.status,
    required this.nameMatchStatus,
    required this.updatedAt,
  });
  final String status;
  final String nameMatchStatus;
  final String updatedAt;
  factory PayoutAccount.fromJson(Map<String, dynamic> json) => PayoutAccount(
    bankCode: json['bankCode'] as String,
    accountNo: json['accountNo'] as String,
    accountHolderName: json['accountHolderName'] as String,
    status: json['status'] as String,
    nameMatchStatus: json['nameMatchStatus'] as String,
    updatedAt: json['updatedAt'] as String,
  );
}

class PayoutProfile {
  const PayoutProfile({
    required this.ownerType,
    required this.expectedHolderName,
    this.account,
  });
  final String ownerType;
  final String expectedHolderName;
  final PayoutAccount? account;
  factory PayoutProfile.fromJson(Map<String, dynamic> json) => PayoutProfile(
    ownerType: json['ownerType'] as String,
    expectedHolderName: json['expectedHolderName'] as String,
    account: json['account'] == null
        ? null
        : PayoutAccount.fromJson(json['account'] as Map<String, dynamic>),
  );
}

abstract interface class PayoutRepository {
  Future<PayoutProfile> get(String ownerType);
  Future<PayoutProfile> save(String ownerType, PayoutInput input);
}

class ApiPayoutRepository implements PayoutRepository {
  ApiPayoutRepository(this._dio);
  final Dio _dio;
  @override
  Future<PayoutProfile> get(String ownerType) async => PayoutProfile.fromJson(
    (await _dio.get<Map<String, dynamic>>(
      '/api/me/payout-account',
      queryParameters: {'ownerType': ownerType},
    )).data!,
  );
  @override
  Future<PayoutProfile> save(String ownerType, PayoutInput input) async =>
      PayoutProfile.fromJson(
        (await _dio.put<Map<String, dynamic>>(
          '/api/me/payout-account',
          queryParameters: {'ownerType': ownerType},
          data: input.toJson(),
        )).data!,
      );
}

final payoutRepositoryProvider = Provider<PayoutRepository>(
  (ref) => ApiPayoutRepository(ref.watch(dioProvider)),
);
final payoutProfileProvider = FutureProvider.autoDispose
    .family<PayoutProfile, String>((ref, ownerType) {
      final userId = ref.watch(sessionProvider.select((s) => s.user?.userId));
      if (userId == null) return Future.error(StateError('Bạn cần đăng nhập.'));
      return ref.watch(payoutRepositoryProvider).get(ownerType);
    });

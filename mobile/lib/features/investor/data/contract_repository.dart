import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import 'portfolio_repository.dart' show requireInvestor;

/// Hợp đồng của một khoản góp của tôi. Người nuôi ký trước, nhà đầu tư ký sau.
class ContractSummary {
  const ContractSummary({
    required this.id,
    required this.contractNo,
    required this.status,
    required this.batchCode,
    required this.batchTitle,
    required this.amount,
    this.nextSigner,
    this.fullySignedAt,
  });
  final int id, amount;
  final String contractNo, status, batchCode, batchTitle;
  final String? nextSigner;
  final DateTime? fullySignedAt;

  /// Tới lượt tôi ký.
  bool get waitsForMe => nextSigner == 'Investor' && status != 'Void';

  factory ContractSummary.fromJson(Json j) => ContractSummary(
    id: intOf(j, 'contractId'),
    contractNo: str(j, 'contractNo'),
    status: str(j, 'status'),
    batchCode: str(j, 'batchCode'),
    batchTitle: str(j, 'batchTitle'),
    amount: intOf(j, 'amount'),
    nextSigner: strOrNull(j, 'nextSigner'),
    fullySignedAt: dateOrNull(j, 'fullySignedAt'),
  );
}

abstract interface class ContractRepository {
  Future<List<ContractSummary>> mine();
}

class ApiContractRepository implements ContractRepository {
  ApiContractRepository(this._dio);
  final Dio _dio;

  @override
  Future<List<ContractSummary>> mine() async => [
    for (final c in await _dio.getList('/api/me/contracts')) ContractSummary.fromJson(c),
  ];
}

final contractRepositoryProvider = Provider<ContractRepository>((ref) => ApiContractRepository(ref.watch(dioProvider)));

final myContractsProvider = FutureProvider.autoDispose<List<ContractSummary>>((ref) {
  requireInvestor(ref);
  return ref.watch(contractRepositoryProvider).mine();
}, retry: (_, _) => null);

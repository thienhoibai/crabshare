import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/models/batch_enums.dart';

/// Kết quả tra cứu một tem: cua thuộc lô nào, nuôi ở hộp số mấy, cân bao nhiêu, đi tới đơn nào.
/// Không trả ảnh nuôi — người mua chỉ cần biết nguồn gốc (quyết định của nhóm về trang truy xuất).
class TraceResult {
  const TraceResult({
    required this.tagCode,
    required this.crabType,
    required this.gradeCode,
    required this.weightG,
    required this.operatorName,
    required this.batchCode,
    required this.slotCode,
    required this.events,
  });

  final String tagCode;
  final CrabType crabType;
  final String gradeCode;
  final int weightG;
  final String operatorName;
  final String batchCode;
  final String slotCode;
  final List<TraceEvent> events;
}

class TraceEvent {
  const TraceEvent(this.at, this.title, this.detail);
  final DateTime at;
  final String title;
  final String detail;
}

/// Endpoint công khai: GET /api/trace/{tagCode} (backend Features/Harvest). Hiện dùng dữ liệu mẫu.
abstract interface class TraceRepository {
  Future<TraceResult> lookup(String tagCode);
}

final traceRepositoryProvider = Provider<TraceRepository>((ref) => MockTraceRepository());
final traceProvider = FutureProvider.family<TraceResult, String>((ref, tag) => ref.watch(traceRepositoryProvider).lookup(tag));

class MockTraceRepository implements TraceRepository {
  @override
  Future<TraceResult> lookup(String tagCode) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (tagCode.length != 12) throw ArgumentError('Mã tem gồm 12 ký tự.');
    final now = DateTime.now();
    return TraceResult(
      tagCode: tagCode.toUpperCase(),
      crabType: CrabType.fattening,
      gradeCode: 'L2',
      weightG: 420,
      operatorName: 'HTX Nuôi cua Năm Căn',
      batchCode: 'CS-2609-04',
      slotCode: '1214',
      events: [
        TraceEvent(now.subtract(const Duration(days: 92)), 'Thả giống', 'Vào hộp 1214, lô CS-2609-04'),
        TraceEvent(now.subtract(const Duration(days: 60)), 'Lột xác', 'Ghi nhận tại hộp 1214'),
        TraceEvent(now.subtract(const Duration(days: 2)), 'Thu hoạch', 'Cân 420 g, hạng L2'),
        TraceEvent(now.subtract(const Duration(days: 2)), 'Gắn tem', 'Tem in tại trại, kích hoạt bằng ảnh xác nhận'),
        TraceEvent(now.subtract(const Duration(days: 1)), 'Đóng gói', 'Quét tem khi đóng gói đơn hàng'),
      ],
    );
  }
}

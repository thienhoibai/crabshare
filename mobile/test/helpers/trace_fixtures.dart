/// Phản hồi mẫu của GET /api/trace/orders/{traceCode} (OrderTraceResponse).
Map<String, dynamic> orderTraceJson() => {
  'traceCode': 'QR7K2M9XQ4TB',
  'batchCode': 'CS-2611-T1',
  'batchTitle': 'Cua thịt thu mua Năm Căn',
  'crabType': 'FatteningMudCrab',
  'farmName': 'HTX Cua Năm Căn',
  'sourceLots': [
    {'originRegion': 'Năm Căn, Cà Mau', 'harvestedOn': '2026-10-20', 'species': 'Scylla paramamosain'},
    {'originRegion': null, 'harvestedOn': null, 'species': ''},
  ],
  'lines': [
    {'specCode': 'FAT-M-G1', 'specName': 'Cua thịt size M Cấp 1', 'crabs': 20},
    {'specCode': 'FAT-XL-SPECIAL', 'specName': 'Cua thịt size XL Đặc cấp', 'crabs': 10},
  ],
  'deliveries': ['2026-11-10T05:00:00+00:00'],
  'standardNote': 'Quy cách theo chuẩn phân hạng nội bộ tham chiếu T/SCFA 0014-2024, không phải chứng nhận (BR-038).',
};

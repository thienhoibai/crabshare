import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/json.dart';
import '../../../core/format/money.dart';
import '../../../shared/status_labels.dart';

/// Phần dùng chung của nhóm việc tại trạm và giao hàng: Lô của người nuôi, số có dấu phẩy, tên quy cách, ô nhập số.

/// Lô của người nuôi, chỉ giữ các trường mà đo cua và giao hàng cần.
class WorkBatch {
  const WorkBatch({
    required this.code,
    required this.title,
    required this.status,
    required this.mode,
    required this.crabType,
    required this.hasHolding,
  });

  final String code;
  final String title;
  final String status;
  final String mode;
  final String crabType;
  final bool hasHolding;

  /// Lô có lưu nuôi đang nuôi thì bắt đầu thu hoạch được.
  bool get canStartHarvest => hasHolding && status == 'InProduction';

  /// Lô có lưu nuôi đo khi thu hoạch; Lô không lưu nuôi đo ngay sau khi nhận cua.
  bool get canMeasure => hasHolding ? status == 'Harvesting' : status == 'Sourcing' || status == 'Selling';

  /// Trạng thái tồn của con cua còn chờ đo.
  String get waitingCrabStatus => hasHolding ? 'Holding' : 'Received';

  /// Cua gạch cần thêm số đo dải mép khi soi đỏ.
  bool get isRoe => crabType.contains('Roe');

  /// Lô đã được duyệt và mở, có thể có đợt giao.
  bool get isOpened => !const {'Draft', 'PendingApproval', 'NeedsRevision', 'Rejected', 'Cancelled'}.contains(status);

  factory WorkBatch.fromJson(Json j) => WorkBatch(
    code: str(j, 'batchCode'),
    title: str(j, 'title'),
    status: str(j, 'status'),
    mode: str(j, 'batchMode'),
    crabType: str(j, 'crabType'),
    hasHolding: boolOf(j, 'hasHolding'),
  );
}

/// Câu báo lỗi của máy chủ, bỏ mã quy tắc trong ngoặc ở cuối câu để màn hình không hiện mã nội bộ.
String workError(Object error) => apiErrorMessage(error).replaceAll(RegExp(r'\s*\((BR|UC)-?\d+[^)]*\)'), '');

/// So sánh mã hộp: mã toàn số thì so theo số ("99" trước "100"), còn lại so theo chữ.
int compareCodes(String a, String b) {
  final x = int.tryParse(a);
  final y = int.tryParse(b);
  return x != null && y != null ? x.compareTo(y) : a.compareTo(b);
}

/// "12,5" hoặc "12.5" → 12.5; chuỗi rỗng hay sai thì null.
double? parseDecimal(String text) {
  final clean = text.trim().replaceAll(',', '.');
  return clean.isEmpty ? null : double.tryParse(clean);
}

/// 318.6 → "318,6 g"; null → "—".
String formatNumber(num? value, [String unit = '']) =>
    value == null ? '—' : '${formatCount(value)}${unit.isEmpty ? '' : ' $unit'}';

String formatKg(num? value) => formatNumber(value, 'kg');

/// Tên dễ đọc của một mã quy cách: "FAT-XL-G1" → "Size XL · Cấp 1". Mã lạ thì giữ nguyên.
String specLabel(String code) {
  if (code == 'SUBSTANDARD') return 'Dưới chuẩn';
  final parts = code.split('-');
  if (parts.length < 3) return code;
  final size = statusLabel('sizeCode', parts[parts.length - 2]);
  final grade = statusLabel('gradeCode', parts.last);
  if (size == parts[parts.length - 2] || grade == parts.last) return code;
  return '$size · $grade';
}

/// Ô nhập số có đơn vị ở cuối, bàn phím số. [decimal] cho phép phần lẻ (kg, g, cm).
class WorkNumberField extends StatelessWidget {
  const WorkNumberField({
    super.key,
    required this.controller,
    required this.label,
    this.unit,
    this.decimal = true,
    this.enabled = true,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final String? unit;
  final bool decimal;
  final bool enabled;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    enabled: enabled,
    onChanged: onChanged,
    keyboardType: TextInputType.numberWithOptions(decimal: decimal),
    inputFormatters: [
      FilteringTextInputFormatter.allow(RegExp(decimal ? r'[0-9.,]' : r'[0-9]')),
      LengthLimitingTextInputFormatter(9),
    ],
    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
    decoration: InputDecoration(
      labelText: label,
      suffixText: unit,
      fillColor: AppColors.background,
    ),
  );
}

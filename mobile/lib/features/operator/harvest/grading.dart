import '../../../shared/models/batch_enums.dart';

/// Hạng cua theo khối lượng — khớp bảng product_grade trong database/migrations/V002__reference_data.sql.
/// Backend là nơi xếp hạng chính thức khi lưu; app chỉ xếp trước để người cân thấy ngay.
enum Grade {
  l1('L1', '≥ 500 g'),
  l2('L2', '350–499 g'),
  l3('L3', '250–349 g'),
  l4('L4', '< 250 g'),
  soft('SOFT', 'Cua lột');

  const Grade(this.code, this.range);
  final String code;
  final String range;
}

Grade gradeFor({required int weightG, required CrabType crabType}) {
  if (crabType == CrabType.softShell) return Grade.soft;
  if (weightG >= 500) return Grade.l1;
  if (weightG >= 350) return Grade.l2;
  if (weightG >= 250) return Grade.l3;
  return Grade.l4;
}

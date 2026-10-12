import '../../app/theme/app_images.dart';

/// Loại cua — khớp CHECK ck_batch_crab_type (database/migrations/V001__initial_schema.sql).
enum CrabType {
  fattening('FatteningMudCrab', 'Cua thịt', AppImages.crabFattening),
  roe('RoeCrab', 'Cua gạch', AppImages.crabRoe),
  softShell('SoftShellCrab', 'Cua lột', AppImages.crabSoft);

  const CrabType(this.apiValue, this.label, this.image);

  /// Giá trị backend trả về / nhận vào.
  final String apiValue;
  final String label;
  final String image;

  static CrabType fromApi(String value) => values.firstWhere((t) => t.apiValue == value);
}

/// Trạng thái lô — khớp CHECK ck_batch_status.
enum BatchStatus {
  draft('Draft', 'Nháp'),
  pendingApproval('PendingApproval', 'Chờ duyệt'),
  rejected('Rejected', 'Bị từ chối'),
  funding('Funding', 'Đang gọi vốn'),
  cancelled('Cancelled', 'Đã huỷ'),
  stocked('Stocked', 'Đã thả giống'),
  inProduction('InProduction', 'Đang nuôi'),
  harvesting('Harvesting', 'Đang thu hoạch'),
  settlement('Settlement', 'Đang quyết toán'),
  closed('Closed', 'Đã đóng');

  const BatchStatus(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static BatchStatus fromApi(String value) => values.firstWhere((s) => s.apiValue == value);

  /// Các bước hiển thị trên dòng thời gian của lô (bỏ các trạng thái thất bại).
  static const timeline = [funding, stocked, inProduction, harvesting, settlement, closed];
}

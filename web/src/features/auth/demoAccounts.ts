/**
 * Tài khoản demo — trùng với backend/src/CrabShare.Api/Infrastructure/Persistence/DevDataSeeder.cs và Br15DemoSeeder.cs.
 * Chỉ hiện nút đăng nhập nhanh khi chạy dev (import.meta.env.DEV). Không dùng ở môi trường thật.
 */
const password = 'CrabShare@2026'

export const DEMO_ACCOUNTS = [
  { label: 'Khách hàng', hint: 'Đặt trước, nhận hàng, nghiệm thu', email: 'customer@crabshare.local', password },
  { label: 'Nhà đầu tư', hint: 'Góp vốn, theo dõi Lô, biểu quyết', email: 'investor1@crabshare.local', password },
  { label: 'Người nuôi', hint: 'Lô, lưu nuôi, phân hạng, giao hàng', email: 'operator@crabshare.local', password },
  { label: 'Nhân viên kiểm phẩm', hint: 'Kiểm đầu vào, duyệt hạng, thăm trại', email: 'qc1@crabshare.local', password },
  { label: 'Quản trị', hint: 'Duyệt Lô, tham số, giải ngân, quyết toán', email: 'admin@crabshare.local', password },
  { label: 'Kiểm định bằng chứng', hint: 'Thẩm định ảnh bằng chứng', email: 'reviewer@crabshare.local', password },
] as const

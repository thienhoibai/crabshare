/**
 * Tài khoản demo — trùng với backend/src/CrabShare.Api/Infrastructure/Persistence/DevDataSeeder.cs.
 * Chỉ hiện nút đăng nhập nhanh khi chạy dev (import.meta.env.DEV). Không dùng ở môi trường thật.
 */
const password = 'CrabShare@2026'

export const DEMO_ACCOUNTS = [
  { label: 'Khách hàng', hint: 'Mua cua · Giỏ hàng · Theo dõi đơn', email: 'customer@crabshare.local', password },
  { label: 'Nhà đầu tư', hint: 'Góp vốn · Danh mục · Quyết toán', email: 'investor1@crabshare.local', password },
  { label: 'Người nuôi', hint: 'Lô nuôi · Nhật ký · Thu hoạch', email: 'operator@crabshare.local', password },
  { label: 'Quản trị', hint: 'Duyệt lô · Tài chính · Tranh chấp', email: 'admin@crabshare.local', password },
] as const

import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { RequireRole } from '../shared/auth/RequireRole'
import type { Role } from '../shared/auth/authStore'

/*
 * BẢN ĐỒ TRANG CỦA WEB. Mỗi trang nằm trong src/features/<tính năng>/.
 * Thêm trang mới: tạo component trong feature của mình rồi thêm một dòng vào nhóm route tương ứng dưới đây.
 * Trang tải lười (lazy) nên thêm nhiều trang không làm chậm lần mở đầu.
 */

const Landing = lazy(() => import('../features/landing/Landing'))
const LoginPage = lazy(() => import('../features/auth/LoginPage'))
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'))
const StorePage = lazy(() => import('../features/store/StorePage'))
const CommercePage = lazy(() => import('../features/orders/CommercePage'))
const CheckoutPage = lazy(() => import('../features/orders/CheckoutPage'))
const OrderConfirmationPage = lazy(() => import('../features/orders/OrderConfirmationPage'))
const OrderHistoryPage = lazy(() => import('../features/orders/OrderHistoryPage'))
const OrderTrackingPage = lazy(() => import('../features/orders/OrderTrackingPage'))
const TracePage = lazy(() => import('../features/trace/TracePage'))
const InvestorPortal = lazy(() => import('../features/investor/InvestorPortal'))
const ContributePage = lazy(() => import('../features/investor/funding/ContributePage'))
const CustomerAddresses = lazy(() => import('../features/accounts/CustomerAddresses'))
const OperatorPayoutAccount = lazy(() => import('../features/operator/OperatorPayoutAccount'))

const OperatorDashboard = lazy(() => import('../features/operator/OperatorDashboard'))
const OperatorKyc = lazy(() => import('../features/operator/OperatorKyc'))
const OperatorRegistration = lazy(() => import('../features/operator/OperatorRegistration'))
const OperatorCreateBatch = lazy(() => import('../features/operator/OperatorCreateBatch'))
const OperatorContract = lazy(() => import('../features/operator/OperatorContract'))
const OperatorHarvest = lazy(() => import('../features/operator/OperatorHarvest'))
const OperatorSettlement = lazy(() => import('../features/operator/OperatorSettlement'))
const OperatorFarmMap = lazy(() => import('../features/operator/OperatorFarmMap'))
const OperatorDailyLog = lazy(() => import('../features/operator/OperatorDailyLog'))
const OperatorBatchStatus = lazy(() => import('../features/operator/OperatorBatchStatus'))
const OperatorBatchDetail = lazy(() => import('../features/operator/OperatorBatchDetail'))
const OperatorAlerts = lazy(() => import('../features/operator/OperatorAlerts'))
const OperatorListings = lazy(() => import('../features/operator/OperatorListings'))
const OperatorMembers = lazy(() => import('../features/operator/OperatorMembers'))
const OperatorOrders = lazy(() => import('../features/operator/OperatorOrders'))

const AdminDashboard = lazy(() => import('../features/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('../features/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('../features/admin/AdminUserDetail'))
const AdminBatches = lazy(() => import('../features/admin/AdminBatches'))
const AdminBatchDetail = lazy(() => import('../features/admin/AdminBatchDetail'))
const AdminStorefront = lazy(() => import('../features/admin/AdminStorefront'))
const AdminFinance = lazy(() => import('../features/admin/AdminFinance'))
const AdminSettlementDetail = lazy(() => import('../features/admin/AdminSettlementDetail'))
const AdminAlerts = lazy(() => import('../features/admin/AdminAlerts'))
const AdminEvidence = lazy(() => import('../features/admin/AdminEvidence'))
const AdminEvidenceDetail = lazy(() => import('../features/admin/AdminEvidenceDetail'))
const AdminDisputes = lazy(() => import('../features/admin/AdminDisputes'))
const AdminSettings = lazy(() => import('../features/admin/AdminSettings'))

const page = (C: LazyExoticComponent<ComponentType>) => <C />

/** Nhóm route cần đăng nhập với một số vai trò. */
const guarded = (roles: Role[]) => (
  <RequireRole roles={roles}>
    <Outlet />
  </RequireRole>
)

function Root() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: 'sans-serif' }}>Đang tải…</div>}>
      <Outlet />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      // ----- Công khai -----
      { path: '/', element: page(Landing) },
      { path: '/dang-nhap', element: page(LoginPage) },
      { path: '/dang-ky', element: page(RegisterPage) },
      { path: '/cua-hang/:listingId?', element: page(StorePage) },
      { path: '/truy-xuat/:tagCode', element: page(TracePage) },
      { path: '/san-pham', element: page(CommercePage) },

      // ----- Khách hàng: giỏ hàng, thanh toán, đơn hàng -----
      {
        element: guarded(['Customer', 'Investor']),
        children: [
          { path: '/gio-hang', element: <Navigate to="/thanh-toan" replace /> },
          { path: '/thanh-toan', element: page(CheckoutPage) },
          { path: '/xac-nhan-don-hang', element: page(OrderConfirmationPage) },
          { path: '/lich-su-don-hang', element: page(OrderHistoryPage) },
          { path: '/theo-doi-don-hang', element: page(OrderTrackingPage) },
          { path: '/theo-doi-don-hang/:orderNo', element: page(OrderTrackingPage) },
          { path: '/huy-tra-hang', element: page(OrderHistoryPage) },
          { path: '/danh-gia-don-hang', element: page(CommercePage) },
        ],
      },

      { element: guarded(['Customer']), children: [{ path: '/tai-khoan/dia-chi', element: page(CustomerAddresses) }] },

      // ----- Nhà đầu tư -----
      {
        element: guarded(['Investor']),
        children: [
          { path: '/nha-dau-tu/gop-von/:code', element: page(ContributePage) },
          { path: '/nha-dau-tu/*', element: page(InvestorPortal) },
        ],
      },

      // UC04: mọi tài khoản đã đăng nhập đều được đăng ký hộ nuôi.
      { path: '/operator/register', element: <RequireRole>{page(OperatorRegistration)}</RequireRole> },

      // ----- Người nuôi -----
      {
        element: guarded(['OperatorMember']),
        children: [
          { path: '/operator', element: page(OperatorDashboard) },
          { path: '/operator/kyc', element: page(OperatorKyc) },
          { path: '/operator/payout-account', element: page(OperatorPayoutAccount) },
          { path: '/operator/create-batch', element: page(OperatorCreateBatch) },
          { path: '/operator/contract', element: page(OperatorContract) },
          { path: '/operator/harvest', element: page(OperatorHarvest) },
          { path: '/operator/settlement', element: page(OperatorSettlement) },
          { path: '/operator/boxes', element: page(OperatorFarmMap) },
          { path: '/operator/log', element: page(OperatorDailyLog) },
          { path: '/operator/batch', element: page(OperatorBatchStatus) },
          { path: '/operator/batch/detail', element: page(OperatorBatchDetail) },
          { path: '/operator/alerts', element: page(OperatorAlerts) },
          { path: '/operator/listings', element: page(OperatorListings) },
          { path: '/operator/members', element: page(OperatorMembers) },
          { path: '/operator/orders', element: page(OperatorOrders) },
          { path: '/operator/orders/:orderNo', element: page(OperatorOrders) },
        ],
      },

      // ----- Quản trị (và Kiểm định viên) -----
      {
        element: guarded(['PlatformAdmin', 'EvidenceReviewer']),
        children: [
          { path: '/admin', element: page(AdminDashboard) },
          { path: '/admin/evidence', element: <RequireRole roles={['EvidenceReviewer']}>{page(AdminEvidence)}</RequireRole> },
          { path: '/admin/evidence/:id', element: <RequireRole roles={['EvidenceReviewer']}>{page(AdminEvidenceDetail)}</RequireRole> },
          { path: '/admin/users', element: <RequireRole roles={['PlatformAdmin']}>{page(AdminUsers)}</RequireRole> },
          { path: '/admin/users/detail', element: <RequireRole roles={['PlatformAdmin']}>{page(AdminUserDetail)}</RequireRole> },
          { path: '/admin/batches', element: page(AdminBatches) },
          { path: '/admin/batches/detail', element: page(AdminBatchDetail) },
          { path: '/admin/storefront', element: page(AdminStorefront) },
          { path: '/admin/finance', element: page(AdminFinance) },
          { path: '/admin/finance/settlement', element: page(AdminSettlementDetail) },
          { path: '/admin/alerts', element: <RequireRole roles={['PlatformAdmin']}>{page(AdminAlerts)}</RequireRole> },
          { path: '/admin/disputes', element: page(AdminDisputes) },
          { path: '/admin/settings', element: page(AdminSettings) },
        ],
      },

      { path: '*', element: page(Landing) },
    ],
  },
])

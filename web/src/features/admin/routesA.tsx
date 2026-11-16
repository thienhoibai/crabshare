/* Route nhóm A của cổng Quản trị: bảng điều khiển, đối tác, hộ nuôi, người dùng và eKYC, pool kiểm phẩm,
   duyệt và tạo Lô, gọi vốn, tham số nền tảng, nhật ký kiểm toán. Nhóm B (chất lượng, tiền) ở routesB.tsx. */
import { lazy, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { RequireRole } from '../../shared/auth/RequireRole'

/** Khung /admin mở cho cả vai trò Kiểm định bằng chứng (chỉ dùng /admin/evidence), nên từng trang của Quản trị phải tự chặn theo vai trò. */
export const adminOnly = (page: ReactNode) => <RequireRole roles={['PlatformAdmin']}>{page}</RequireRole>

const AdminDashboard = lazy(() => import('./AdminDashboard'))
const AdminParties = lazy(() => import('./AdminParties'))
const AdminPartyDetail = lazy(() => import('./AdminPartyDetail'))
const AdminOperators = lazy(() => import('./AdminOperators'))
const AdminUsers = lazy(() => import('./AdminUsers'))
const AdminUserDetail = lazy(() => import('./AdminUserDetail'))
const AdminQc = lazy(() => import('./AdminQc'))
const AdminBatches = lazy(() => import('./AdminBatches'))
const AdminBatchCreate = lazy(() => import('./AdminBatchCreate'))
const AdminBatchDetail = lazy(() => import('./AdminBatchDetail'))
const AdminFunding = lazy(() => import('./AdminFunding'))
const AdminParameters = lazy(() => import('./AdminParameters'))
const AdminAuditLog = lazy(() => import('./AdminAuditLog'))

export const adminRoutesA: RouteObject[] = [
  { path: '/admin', element: adminOnly(<AdminDashboard />) },
  { path: '/admin/parties', element: adminOnly(<AdminParties />) },
  { path: '/admin/parties/:partyId', element: adminOnly(<AdminPartyDetail />) },
  { path: '/admin/operators', element: adminOnly(<AdminOperators />) },
  { path: '/admin/users', element: adminOnly(<AdminUsers />) },
  { path: '/admin/users/:id', element: adminOnly(<AdminUserDetail />) },
  { path: '/admin/qc', element: adminOnly(<AdminQc />) },
  { path: '/admin/batches', element: adminOnly(<AdminBatches />) },
  { path: '/admin/batches/new', element: adminOnly(<AdminBatchCreate />) },
  { path: '/admin/batches/:code', element: adminOnly(<AdminBatchDetail />) },
  { path: '/admin/funding', element: adminOnly(<AdminFunding />) },
  { path: '/admin/parameters', element: adminOnly(<AdminParameters />) },
  { path: '/admin/audit-log', element: adminOnly(<AdminAuditLog />) },
]

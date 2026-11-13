/* Route nhóm A của cổng Quản trị: bảng điều khiển, đối tác, hộ nuôi, người dùng và eKYC, pool kiểm phẩm,
   duyệt và tạo Lô, gọi vốn, tham số nền tảng, nhật ký kiểm toán. Nhóm B (chất lượng, tiền) ở routesB.tsx. */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'

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
  { path: '/admin', element: <AdminDashboard /> },
  { path: '/admin/parties', element: <AdminParties /> },
  { path: '/admin/parties/:partyId', element: <AdminPartyDetail /> },
  { path: '/admin/operators', element: <AdminOperators /> },
  { path: '/admin/users', element: <AdminUsers /> },
  { path: '/admin/users/:id', element: <AdminUserDetail /> },
  { path: '/admin/qc', element: <AdminQc /> },
  { path: '/admin/batches', element: <AdminBatches /> },
  { path: '/admin/batches/new', element: <AdminBatchCreate /> },
  { path: '/admin/batches/:code', element: <AdminBatchDetail /> },
  { path: '/admin/funding', element: <AdminFunding /> },
  { path: '/admin/parameters', element: <AdminParameters /> },
  { path: '/admin/audit-log', element: <AdminAuditLog /> },
]

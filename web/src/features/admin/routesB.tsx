/* Route nhóm B của cổng quản trị: chất lượng (bộ quy tắc phân hạng, thiết bị, thẩm định bằng chứng, cảnh báo, khiếu nại)
   và tiền (duyệt giải ngân, lệnh chi và đối soát, quyết toán). Trang nằm ở features/admin/quality và features/admin/finance. */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'
import { RequireRole } from '../../shared/auth/RequireRole'
import { adminOnly } from './routesA'

const RuleSetsPage = lazy(() => import('./quality/RuleSetsPage'))
const RuleSetDetailPage = lazy(() => import('./quality/RuleSetDetailPage'))
const DevicesPage = lazy(() => import('./quality/DevicesPage'))
const EvidenceQueuePage = lazy(() => import('./quality/EvidenceQueuePage'))
const EvidenceDetailPage = lazy(() => import('./quality/EvidenceDetailPage'))
const AlertsPage = lazy(() => import('./quality/AlertsPage'))
const ClaimsPage = lazy(() => import('./quality/ClaimsPage'))
const ClaimDetailPage = lazy(() => import('./quality/ClaimDetailPage'))
const TranchesPage = lazy(() => import('./finance/TranchesPage'))
const FinancePage = lazy(() => import('./finance/FinancePage'))
const SettlementsPage = lazy(() => import('./finance/SettlementsPage'))
const SettlementDetailPage = lazy(() => import('./finance/SettlementDetailPage'))

export const adminRoutesB: RouteObject[] = [
  { path: '/admin/grading', element: adminOnly(<RuleSetsPage />) },
  { path: '/admin/grading/:id', element: adminOnly(<RuleSetDetailPage />) },
  { path: '/admin/devices', element: adminOnly(<DevicesPage />) },
  // Thẩm định bằng chứng chỉ dành cho vai trò Kiểm định bằng chứng (API cũng chặn theo vai trò này).
  { path: '/admin/evidence', element: <RequireRole roles={['EvidenceReviewer']}><EvidenceQueuePage /></RequireRole> },
  { path: '/admin/evidence/:id', element: <RequireRole roles={['EvidenceReviewer']}><EvidenceDetailPage /></RequireRole> },
  { path: '/admin/alerts', element: adminOnly(<AlertsPage />) },
  { path: '/admin/claims', element: adminOnly(<ClaimsPage />) },
  { path: '/admin/claims/:claimNo', element: adminOnly(<ClaimDetailPage />) },
  { path: '/admin/tranches', element: adminOnly(<TranchesPage />) },
  { path: '/admin/finance', element: adminOnly(<FinancePage />) },
  { path: '/admin/settlements', element: adminOnly(<SettlementsPage />) },
  { path: '/admin/settlements/:id', element: adminOnly(<SettlementDetailPage />) },
]

/* Các trang của cổng Nhân viên kiểm phẩm. Menu ở shared/ui/console/nav.ts (khu vực qc). */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'

const QcTasksPage = lazy(() => import('./QcTasksPage'))
const IncomingListPage = lazy(() => import('./IncomingListPage'))
const IncomingReceiptPage = lazy(() => import('./IncomingReceiptPage'))
const GradingListPage = lazy(() => import('./GradingListPage'))
const GradingBatchPage = lazy(() => import('./GradingBatchPage'))
const SiteVisitListPage = lazy(() => import('./SiteVisitListPage'))
const SiteVisitReportPage = lazy(() => import('./SiteVisitReportPage'))
const StandardsPage = lazy(() => import('./StandardsPage'))

export const qcRoutes: RouteObject[] = [
  { path: '/qc', element: <QcTasksPage /> },
  { path: '/qc/kiem-dau-vao', element: <IncomingListPage /> },
  { path: '/qc/kiem-dau-vao/:receiptNo', element: <IncomingReceiptPage /> },
  { path: '/qc/phan-hang', element: <GradingListPage /> },
  { path: '/qc/phan-hang/:batchCode', element: <GradingBatchPage /> },
  { path: '/qc/tham-trai', element: <SiteVisitListPage /> },
  { path: '/qc/tham-trai/:assignmentId', element: <SiteVisitReportPage /> },
  { path: '/qc/chuan', element: <StandardsPage /> },
]

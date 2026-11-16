/* Route nhóm A của cổng người nuôi: tổng quan, hồ sơ hộ nuôi, đối tác, Lô (danh sách, tạo, sửa), hộp nuôi, nhật ký chăm sóc,
   thiết bị, cảnh báo, bằng chứng. Trang làm việc của một Lô (/operator/batches/:code/:tab?) gắn ở app/router.tsx;
   các tab nhóm A của trang đó khai ở batch/tabsA.tsx. */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'

const OperatorDashboard = lazy(() => import('./OperatorDashboard'))
const OperatorRegistration = lazy(() => import('./OperatorRegistration'))
const OperatorPartners = lazy(() => import('./OperatorPartners'))
const OperatorMembers = lazy(() => import('./OperatorMembers'))
const OperatorPayoutAccount = lazy(() => import('./OperatorPayoutAccount'))
const OperatorBatches = lazy(() => import('./OperatorBatches'))
const OperatorBatchForm = lazy(() => import('./OperatorBatchForm'))
const OperatorBoxes = lazy(() => import('./OperatorBoxes'))
const OperatorDailyLog = lazy(() => import('./OperatorDailyLog'))
const OperatorDevices = lazy(() => import('./OperatorDevices'))
const OperatorAlerts = lazy(() => import('./OperatorAlerts'))
const OperatorEvidence = lazy(() => import('./OperatorEvidence'))
const OperatorEvidenceDetail = lazy(() => import('./OperatorEvidenceDetail'))

export const operatorRoutesA: RouteObject[] = [
  { path: '/operator', element: <OperatorDashboard /> },
  { path: '/operator/register', element: <OperatorRegistration /> },
  { path: '/operator/partners', element: <OperatorPartners /> },
  { path: '/operator/members', element: <OperatorMembers /> },
  { path: '/operator/payout-account', element: <OperatorPayoutAccount /> },
  { path: '/operator/batches', element: <OperatorBatches /> },
  // Hai đường dẫn tĩnh này được ưu tiên hơn /operator/batches/:code/:tab? của trang làm việc.
  { path: '/operator/batches/new', element: <OperatorBatchForm /> },
  { path: '/operator/batches/:code/edit', element: <OperatorBatchForm /> },
  { path: '/operator/boxes', element: <OperatorBoxes /> },
  { path: '/operator/log', element: <OperatorDailyLog /> },
  { path: '/operator/devices', element: <OperatorDevices /> },
  { path: '/operator/alerts', element: <OperatorAlerts /> },
  { path: '/operator/evidence', element: <OperatorEvidence /> },
  { path: '/operator/evidence/:id', element: <OperatorEvidenceDetail /> },
]

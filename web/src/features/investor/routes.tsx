/* Các trang của cổng nhà đầu tư (/nha-dau-tu/…). Khung trang và menu do ConsoleLayout lo (nav.ts, khu investor). */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'

const OverviewPage = lazy(() => import('./OverviewPage'))
const FundingListPage = lazy(() => import('./FundingListPage'))
const FundingDetailPage = lazy(() => import('./FundingDetailPage'))
const ContributePage = lazy(() => import('./contribute/ContributePage'))
const PortfolioPage = lazy(() => import('./PortfolioPage'))
const PortfolioDetailPage = lazy(() => import('./PortfolioDetailPage'))
const DecisionsPage = lazy(() => import('./DecisionsPage'))
const ContractsPage = lazy(() => import('./ContractsPage'))
const SettlementsPage = lazy(() => import('./SettlementsPage'))
const SettlementDetailPage = lazy(() => import('./SettlementDetailPage'))
const NotificationsPage = lazy(() => import('./NotificationsPage'))
const ProfilePage = lazy(() => import('./ProfilePage'))

export const investorRoutes: RouteObject[] = [
  { path: '/nha-dau-tu', element: <OverviewPage /> },
  { path: '/nha-dau-tu/lo', element: <FundingListPage /> },
  { path: '/nha-dau-tu/lo/:code', element: <FundingDetailPage /> },
  { path: '/nha-dau-tu/gop-von/:code', element: <ContributePage /> },
  { path: '/nha-dau-tu/danh-muc', element: <PortfolioPage /> },
  { path: '/nha-dau-tu/danh-muc/:code', element: <PortfolioDetailPage /> },
  { path: '/nha-dau-tu/bieu-quyet', element: <DecisionsPage /> },
  { path: '/nha-dau-tu/hop-dong', element: <ContractsPage /> },
  { path: '/nha-dau-tu/quyet-toan', element: <SettlementsPage /> },
  { path: '/nha-dau-tu/quyet-toan/:id', element: <SettlementDetailPage /> },
  { path: '/nha-dau-tu/thong-bao', element: <NotificationsPage /> },
  { path: '/nha-dau-tu/ho-so', element: <ProfilePage /> },
]

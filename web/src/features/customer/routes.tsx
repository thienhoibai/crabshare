/* Các trang của cổng khách hàng (/khach/…). Menu ở shared/ui/console/nav.ts, khu "customer". */
import { lazy } from 'react'
import type { RouteObject } from 'react-router'
import './customer-shopping.css'

const MyOrdersPage = lazy(() => import('./MyOrdersPage'))
const BatchExplorePage = lazy(() => import('../public/BatchExplorePage'))
const BatchPublicPage = lazy(() => import('../public/BatchPublicPage'))
const PreorderBuilderPage = lazy(() => import('./PreorderBuilderPage'))
const OrderDetailPage = lazy(() => import('./OrderDetailPage'))
const DeliveriesPage = lazy(() => import('./DeliveriesPage'))
const SitesPage = lazy(() => import('./SitesPage'))
const ProfilePage = lazy(() => import('./ProfilePage'))
const NotificationsPage = lazy(() => import('./NotificationsPage'))

export const customerRoutes: RouteObject[] = [
  { path: '/khach', element: <MyOrdersPage /> },
  { path: '/khach/lo', element: <BatchExplorePage customer /> },
  { path: '/khach/lo/:code', element: <BatchPublicPage customer /> },
  { path: '/khach/dat-truoc/:code', element: <PreorderBuilderPage /> },
  { path: '/khach/don/:orderNo', element: <OrderDetailPage /> },
  { path: '/khach/giao-hang', element: <DeliveriesPage /> },
  { path: '/khach/dia-diem', element: <SitesPage /> },
  { path: '/khach/ho-so', element: <ProfilePage /> },
  { path: '/khach/thong-bao', element: <NotificationsPage /> },
]

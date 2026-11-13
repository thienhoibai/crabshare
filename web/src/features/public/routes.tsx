import { lazy } from 'react'
import type { RouteObject } from 'react-router'

const BatchExplorePage = lazy(() => import('./BatchExplorePage'))
const BatchPublicPage = lazy(() => import('./BatchPublicPage'))
const GradingStandardPage = lazy(() => import('./GradingStandardPage'))
const OrderTracePage = lazy(() => import('./OrderTracePage'))

/** Trang ai cũng xem được, không cần đăng nhập. */
export const publicRoutes: RouteObject[] = [
  { path: '/lo', element: <BatchExplorePage /> },
  { path: '/lo/:code', element: <BatchPublicPage /> },
  { path: '/chuan-phan-hang', element: <GradingStandardPage /> },
  { path: '/truy-xuat/:traceCode', element: <OrderTracePage /> },
]

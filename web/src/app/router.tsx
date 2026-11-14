import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, Navigate, Outlet, useLocation, useNavigate, type RouteObject } from 'react-router'
import { RequireRole } from '../shared/auth/RequireRole'
import SiteShell from '../shared/layout/SiteShell'
import ConsoleLayout from '../shared/ui/console/ConsoleLayout'
import { AREAS, type Area } from '../shared/ui/console/nav'
import { ToastHost } from '../shared/ui/console/toast'
import { adminRoutesA } from '../features/admin/routesA'
import { adminRoutesB } from '../features/admin/routesB'
import { customerRoutes } from '../features/customer/routes'
import { investorRoutes } from '../features/investor/routes'
import { operatorRoutesA } from '../features/operator/routesA'
import { operatorRoutesB } from '../features/operator/routesB'
import { publicRoutes } from '../features/public/routes'
import { qcRoutes } from '../features/qc/routes'
import RouteError from './RouteError'

/*
 * BẢN ĐỒ TRANG CỦA WEB (BR v1.5).
 *   Công khai      /, /lo, /lo/:code, /chuan-phan-hang, /truy-xuat/:traceCode      features/public/routes.tsx
 *   Khách hàng     /khach/…                                                         features/customer/routes.tsx
 *   Nhà đầu tư     /nha-dau-tu/…                                                    features/investor/routes.tsx
 *   Người nuôi     /operator/…                                                      features/operator/routesA.tsx, routesB.tsx
 *   Kiểm phẩm      /qc/…                                                            features/qc/routes.tsx
 *   Quản trị       /admin/…                                                         features/admin/routesA.tsx, routesB.tsx
 * Thêm trang mới: tạo component trong feature, thêm một dòng vào tệp routes của cổng đó, và một mục menu trong
 * shared/ui/console/nav.ts nếu trang cần có trên menu. Trang trong một cổng chỉ trả về nội dung; khung (menu trái,
 * thanh trên) do ConsoleLayout lo.
 */

const Landing = lazy(() => import('../features/landing/Landing'))
const LoginPage = lazy(() => import('../features/auth/LoginPage'))
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'))
const NotFoundPage = lazy(() => import('../features/public/NotFoundPage'))
const BatchWorkspace = lazy(() => import('../features/operator/batch/BatchWorkspace'))
const OperatorRegistration = lazy(() => import('../features/operator/OperatorRegistration'))

/** Một cổng: kiểm tra vai trò rồi dựng khung điều hành quanh các trang con. */
const area = (name: Area, children: RouteObject[]): RouteObject => ({
  element: (
    <RequireRole roles={AREAS[name].roles}>
      <ConsoleLayout area={name} />
    </RequireRole>
  ),
  children,
})

/**
 * Bộ kit dùng thẻ <a href> thường. Chặn cú bấm vào liên kết nội bộ để chuyển trang không tải lại cả ứng dụng;
 * liên kết ra ngoài, tải tệp, mở tab mới và đường dẫn /api/ vẫn đi theo trình duyệt.
 */
function useInternalLinks() {
  const navigate = useNavigate()
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target || link.hasAttribute('download') || link.origin !== window.location.origin) return
      const href = link.getAttribute('href') ?? ''
      if (!href.startsWith('/') || href.startsWith('/api/')) return
      event.preventDefault()
      navigate(link.pathname + link.search + link.hash)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [navigate])
}

function Root() {
  useInternalLinks()
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])
  return (
    <>
      <Suspense fallback={<div className="app-wait">Đang tải…</div>}>
        <Outlet />
      </Suspense>
      <ToastHost />
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      // ----- Công khai -----
      { path: '/', element: <Landing /> },
      { path: '/dang-nhap', element: <LoginPage /> },
      { path: '/dang-ky', element: <RegisterPage /> },
      ...publicRoutes,
      // Tài khoản đã đăng nhập nhưng chưa thuộc hộ nuôi nào: nộp hồ sơ hộ nuôi ở đây, được duyệt rồi mới vào cổng người nuôi.
      { path: '/dang-ky-ho-nuoi', element: <RequireRole><SiteShell><OperatorRegistration /></SiteShell></RequireRole> },

      // ----- Các cổng theo vai trò -----
      area('customer', customerRoutes),
      area('investor', investorRoutes),
      area('operator', [{ path: '/operator/batches/:code/:tab?', element: <BatchWorkspace /> }, ...operatorRoutesA, ...operatorRoutesB]),
      area('qc', qcRoutes),
      area('admin', [...adminRoutesA, ...adminRoutesB]),

      // ----- Đường dẫn của bản cũ -----
      { path: '/cua-hang/*', element: <Navigate to="/lo" replace /> },
      { path: '/san-pham', element: <Navigate to="/lo" replace /> },
      { path: '/investor', element: <Navigate to="/nha-dau-tu" replace /> },
      { path: '/lich-su-don-hang', element: <Navigate to="/khach" replace /> },
      { path: '/theo-doi-don-hang/*', element: <Navigate to="/khach" replace /> },
      { path: '/tai-khoan/dia-chi', element: <Navigate to="/khach/dia-diem" replace /> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

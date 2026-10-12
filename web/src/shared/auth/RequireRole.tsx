import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuthStore, type Role } from './authStore'

/**
 * Bọc các trang cần đăng nhập. Chưa đăng nhập → về /dang-nhap (kèm ?next= để quay lại);
 * sai vai trò → về trang chủ. Backend vẫn kiểm tra quyền lần nữa, đây chỉ để giao diện gọn.
 */
export function RequireRole({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  if (!user) return <Navigate to={`/dang-nhap?next=${encodeURIComponent(location.pathname)}`} replace />
  if (roles && !user.roles.some((r) => roles.includes(r))) return <Navigate to="/" replace />
  return <>{children}</>
}

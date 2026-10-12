import { useAuthStore } from './authStore'
import { useCartCount } from './cartCount'

/**
 * Lớp tương thích cho các trang lấy từ bản demo cũ (SiteChrome, CommercePage) vốn gọi useDemoSession().
 * Giờ đọc từ phiên đăng nhập thật. Trang mới thì dùng thẳng useAuthStore, không dùng hook này.
 */
export function useDemoSession() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const cart = useCartCount()
  const role = user?.roles.includes('OperatorMember') ? 'operator' : user?.roles.includes('Investor') ? 'financial' : 'customer'
  return {
    signedIn: !!user,
    role,
    cartCount: cart.count,
    signIn: () => window.location.assign('/dang-nhap'),
    signOut: () => {
      logout()
      window.location.assign('/')
    },
    addToCart: cart.add,
    clearCart: cart.clear,
  } as const
}

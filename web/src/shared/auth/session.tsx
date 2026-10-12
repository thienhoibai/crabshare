import { useAuthStore } from './authStore'
import { useCartCount, useCartStore } from '../cart/cartStore'

/**
 * Lớp tương thích cho các trang lấy từ bản demo cũ (SiteChrome, CommercePage) vốn gọi useDemoSession().
 * Giờ đọc từ phiên đăng nhập thật. Trang mới thì dùng thẳng useAuthStore, không dùng hook này.
 */
export function useDemoSession() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const cartCount = useCartCount()
  const role = user?.roles.includes('OperatorMember') ? 'operator' : user?.roles.includes('Investor') ? 'financial' : 'customer'
  return {
    signedIn: !!user,
    role,
    cartCount,
    signIn: () => window.location.assign('/dang-nhap'),
    signOut: () => {
      logout()
      window.location.assign('/')
    },
    // Trang sản phẩm mẫu không phải niêm yết thật: đưa khách sang cửa hàng để chọn hàng đang bán.
    addToCart: () => window.location.assign('/cua-hang'),
    clearCart: () => useCartStore.getState().clear(),
  } as const
}

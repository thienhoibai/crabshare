import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Vai trò — trùng tên với backend (Common/Auth/Roles.cs). */
export type Role = 'Investor' | 'Customer' | 'OperatorMember' | 'PlatformAdmin' | 'EvidenceReviewer'

export interface Me {
  userId: number
  email: string
  fullName: string
  phone: string | null
  status: string
  roles: Role[]
  operatorId: number | null
}

interface AuthState {
  token: string | null
  expiresAt: string | null
  user: Me | null
  setSession: (token: string, expiresAt: string, user: Me) => void
  logout: () => void
  hasRole: (...roles: Role[]) => boolean
}

/** Phiên đăng nhập, lưu trong localStorage để tải lại trang không bị đăng xuất. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      user: null,
      setSession: (token, expiresAt, user) => set({ token, expiresAt, user }),
      logout: () => set({ token: null, expiresAt: null, user: null }),
      hasRole: (...roles) => !!get().user?.roles.some((r) => roles.includes(r)),
    }),
    { name: 'crabshare-auth' },
  ),
)

/** Trang mặc định sau khi đăng nhập, theo vai trò quan trọng nhất của người dùng. */
export function homePathFor(user: Me): string {
  if (user.roles.includes('PlatformAdmin')) return '/admin'
  if (user.roles.includes('EvidenceReviewer')) return '/admin/evidence'
  if (user.roles.includes('OperatorMember')) return '/operator'
  if (user.roles.includes('Investor')) return '/nha-dau-tu'
  return '/cua-hang'
}

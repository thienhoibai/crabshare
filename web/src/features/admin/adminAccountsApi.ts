import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'

export interface AdminUser {
  userId: number; fullName: string; email: string; phone: string | null; status: string; roles: string[]
  verificationStatus: string | null; createdAt: string; lastLoginAt: string | null
}
export interface AdminKycCheck {
  id: number; userId: number; fullName: string; email: string; checkType: string; result: string
  providerReference: string | null; consentAt: string | null; checkedAt: string
  failureReason: string | null; reviewedBy: number | null; canApproveException: boolean
}
export interface AdminUserDetail { user: AdminUser; verifiedAt: string | null; kycChecks: AdminKycCheck[] }
export interface AdminPage<T> { items: T[]; page: number; pageSize: number; total: number }
export interface AdminAccountDecision { action: 'lock' | 'unlock' | 'approve-exception'; id: number; reason: string }
const key = (id: number | undefined) => ['admin', 'accounts', id] as const

function useAdmin() {
  const user = useAuthStore(s => s.user)
  return { id: user?.userId, enabled: !!user?.roles.includes('PlatformAdmin') }
}
export function useAdminUsers(role: string, status: string, q: string, page: number) {
  const admin = useAdmin()
  return useQuery({ queryKey: [...key(admin.id), 'users', role, status, q, page], enabled: admin.enabled, retry: false, gcTime: 0,
    queryFn: async ({ signal }) => (await http.get<AdminPage<AdminUser>>('/api/admin/users', { signal, params: { role: role || undefined, status: status || undefined, q: q || undefined, page, pageSize: 10 } })).data })
}
export function useAdminUserDetail(id: number) {
  const admin = useAdmin()
  return useQuery({ queryKey: [...key(admin.id), 'user', id], enabled: admin.enabled && Number.isSafeInteger(id) && id > 0, retry: false, gcTime: 0,
    queryFn: async ({ signal }) => (await http.get<AdminUserDetail>(`/api/admin/users/${id}`, { signal })).data })
}
export function useAdminKycChecks(result: string, checkType: string, page: number) {
  const admin = useAdmin()
  return useQuery({ queryKey: [...key(admin.id), 'checks', result, checkType, page], enabled: admin.enabled, retry: false, gcTime: 0,
    queryFn: async ({ signal }) => (await http.get<AdminPage<AdminKycCheck>>('/api/admin/kyc-checks', { signal, params: { result, checkType: checkType || undefined, page, pageSize: 10 } })).data })
}
export function useAdminAccountDecision() {
  const admin = useAdmin()
  const cache = useQueryClient()
  const refresh = () => cache.invalidateQueries({ queryKey: key(admin.id) })
  return useMutation({ gcTime: 0, retry: false,
    mutationFn: async ({ action, id, reason }: AdminAccountDecision) => (await http.post(
      `/api/admin/${action === 'approve-exception' ? 'kyc-checks' : 'users'}/${id}/${action}`, { reason })).data,
    onSuccess: async () => { await refresh(); await cache.invalidateQueries({ queryKey: ['accounts', 'kyc'] }) },
    onError: () => { void refresh() },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'

export type PayoutOwner = 'Investor' | 'Operator'
export interface PayoutInput { bankCode: string; accountNo: string; accountHolderName: string }
export interface PayoutProfile {
  ownerType: PayoutOwner
  expectedHolderName: string
  account: (PayoutInput & { payoutAccountId: number; nameMatchStatus: 'Pending' | 'Matched' | 'Mismatched'; status: 'Active' | 'Locked' | 'Closed'; updatedAt: string }) | null
}
export interface AddressInput { recipientName: string; recipientPhone: string; addressLine: string; province: string; isDefault: boolean }
export interface DeliveryAddress extends AddressInput { addressId: number; createdAt: string }
const payoutKey = (id: number | undefined, owner: PayoutOwner) => ['accounts', 'payout', id, owner] as const
export const addressesKey = (id: number | undefined) => ['accounts', 'addresses', id] as const

export function usePayoutProfile(owner: PayoutOwner) {
  const user = useAuthStore(s => s.user)
  return useQuery({ queryKey: payoutKey(user?.userId, owner), gcTime: 0, retry: false,
    enabled: !!user?.roles.includes(owner === 'Investor' ? 'Investor' : 'OperatorMember'),
    queryFn: async ({ signal }) => (await http.get<PayoutProfile>('/api/me/payout-account', { params: { ownerType: owner }, signal })).data })
}

export function useSavePayout(owner: PayoutOwner) {
  const id = useAuthStore(s => s.user?.userId)
  const cache = useQueryClient()
  return useMutation({ gcTime: 0, retry: false,
    mutationFn: async (input: PayoutInput) => (await http.put<PayoutProfile>('/api/me/payout-account', input, { params: { ownerType: owner } })).data,
    onSuccess: data => cache.setQueryData(payoutKey(id, owner), data) })
}

export function useAddresses() {
  const user = useAuthStore(s => s.user)
  return useQuery({ queryKey: addressesKey(user?.userId), gcTime: 0, retry: false, enabled: !!user?.roles.includes('Customer'),
    queryFn: async ({ signal }) => (await http.get<DeliveryAddress[]>('/api/me/addresses', { signal })).data })
}

export function useChangeAddress() {
  const id = useAuthStore(s => s.user?.userId)
  const cache = useQueryClient()
  return useMutation({ gcTime: 0, retry: false,
    mutationFn: async ({ action, addressId, input }: { action: 'save' | 'delete'; addressId?: number; input?: AddressInput }) => {
      if (action === 'delete') await http.delete(`/api/me/addresses/${addressId}`)
      else if (addressId) await http.put(`/api/me/addresses/${addressId}`, input)
      else await http.post('/api/me/addresses', input)
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: addressesKey(id) }) })
}

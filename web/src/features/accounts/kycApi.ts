import type { KycStatusResponse } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import { useGet, useSend } from '../../shared/ui/console'

export type KycHandoff = { id: number; token: string; expiresAt: string }
export type KycHandoffStatus = {
  id: number
  status: 'Pending' | 'Claimed' | 'Cancelled' | 'Expired'
  expiresAt: string
  claimedAt?: string | null
}

const kycPath = '/api/me/kyc'

export function useKycStatus() {
  const isInvestor = useAuthStore((state) => !!state.user?.roles.includes('Investor'))
  return useGet<KycStatusResponse>(isInvestor ? kycPath : null, undefined, {
    refetchInterval: (query) => {
      const status = query.state.data?.verificationStatus
      return status === 'Verified' || status === 'Rejected' ? false : 3000
    },
  })
}

export function useCreateKycHandoff(onCreated: (handoff: KycHandoff) => void) {
  return useSend<KycHandoff, void>('post', '/api/me/kyc/handoffs', {
    quietError: true,
    onSuccess: onCreated,
  })
}

export function useKycHandoffStatus(id: number | null) {
  return useGet<KycHandoffStatus>(id == null ? null : `/api/me/kyc/handoffs/${id}`, undefined, {
    retry: false,
    refetchInterval: (query) => query.state.data?.status === 'Pending' ? 2500 : false,
  })
}

export function useCancelKycHandoff(id: number | null, onCancelled: () => void) {
  return useSend<KycHandoffStatus, void>('post', () => `/api/me/kyc/handoffs/${id}/cancel`, {
    quietError: true,
    onSuccess: onCancelled,
  })
}

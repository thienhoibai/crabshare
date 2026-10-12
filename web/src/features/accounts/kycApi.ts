import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'

export interface KycStatus {
  verificationStatus: 'Unverified' | 'Verified' | 'Rejected'
  verifiedAt: string | null
  lastCheck: { id: number; checkType: string; result: string; providerReference: string | null; consentAt: string | null; checkedAt: string; failureReason: string | null } | null
}

export interface KycInput { images: [File, File, File]; consent: boolean }

const kycKey = (userId: number | undefined) => ['accounts', 'kyc', userId] as const

export function useKycStatus() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: kycKey(user?.userId),
    queryFn: async () => (await http.get<KycStatus>('/api/me/kyc')).data,
    enabled: !!user?.roles.includes('Investor'),
    staleTime: 0,
  })
}

export function useVerifyKyc() {
  const userId = useAuthStore((s) => s.user?.userId)
  const queryClient = useQueryClient()
  return useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async ({ images, consent }: KycInput) => {
      const form = new FormData()
      form.append('consent', String(consent))
      ;(['idCardFront', 'idCardBack', 'selfie'] as const).forEach((field, index) => {
        form.append(field, images[index], `${field}.${images[index].type.split('/')[1]}`)
      })
      return (await http.post<KycStatus>('/api/kyc/ekyc', form, { timeout: 60_000 })).data
    },
    onSuccess: (data) => queryClient.setQueryData(kycKey(userId), data),
  })
}

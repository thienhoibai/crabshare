import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../../shared/api/http'
import { paymentKeys } from '../../../shared/payments/paymentsApi'
import { useAuthStore } from '../../../shared/auth/authStore'

export interface OfftakePayment {
  referenceCode: string
  accountNo: string
  amount: number
  qrContent: string | null
  expiresAt: string
  paymentRequestId: number
}

export interface OfftakeCommitment {
  offtakeId: number
  batchCode: string
  contributionId: number
  gradeCode: string
  gradeName: string
  committedQtyKg: number
  fixedUnitPrice: number
  commitmentValue: number
  depositAmount: number
  depositPct: number
  depositStatus: string
  status: string
  createdAt: string
  payment: OfftakePayment | null
}

export interface OfftakeGradePrice {
  gradeCode: string
  gradeName: string
  unitPrice: number
}

export interface OfftakeCap {
  batchCode: string
  expectedOutputKg: number
  capPct: number
  capKg: number
  offtakeKg: number
  preorderKg: number
  remainingKg: number
  depositPct: number
  prices: OfftakeGradePrice[]
}

export interface CreateOfftakeBody {
  contributionId: number
  gradeCode: string
  qtyKg: number
}

export const offtakeKeys = {
  mine: ['offtake', 'mine'] as const,
  cap: (code: string) => ['offtake', 'cap', code] as const,
}

export function useMyOfftakes() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: [...offtakeKeys.mine, user?.userId],
    enabled: !!user?.roles.includes('Investor'),
    queryFn: async ({ signal }) =>
      (await http.get<OfftakeCommitment[]>('/api/me/offtake-commitments', { signal })).data,
  })
}

export function useOfftakeCap(code: string) {
  return useQuery({
    queryKey: offtakeKeys.cap(code),
    enabled: !!code,
    queryFn: async ({ signal }) =>
      (await http.get<OfftakeCap>(`/api/batches/${encodeURIComponent(code)}/offtake-cap`, { signal })).data,
    retry: false,
  })
}

export function useCreateOfftake(batchCode: string) {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (body: CreateOfftakeBody) =>
      (await http.post<OfftakeCommitment>(
        `/api/batches/${encodeURIComponent(batchCode)}/offtake-commitments`,
        body,
      )).data,
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: offtakeKeys.mine })
      void qc.invalidateQueries({ queryKey: offtakeKeys.cap(batchCode) })
      if (created.payment)
        void qc.invalidateQueries({ queryKey: paymentKeys.request(created.payment.paymentRequestId) })
    },
  })
}

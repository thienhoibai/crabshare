import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../../shared/api/http'

/* API Features/Funding (TH-04). Tiền là số nguyên đồng. Không có trường lợi suất kỳ vọng (BR-49). */

export interface RiskDisclosure {
  riskDisclosureId: number
  versionCode: string
  effectiveFrom: string
  contentHash: string
  content: string
  acknowledgedAt: string | null
}

export interface Contribution {
  contributionId: number
  batchCode: string
  batchTitle: string
  amount: number
  status: 'Reserved' | 'Confirmed' | 'Expired' | 'Refunded'
  reservedAt: string
  expiresAt: string
  confirmedAt: string | null
}

export interface FundingBatch {
  batchCode: string
  title: string
  crabType: string
  status: string
  operatorName: string
  minContribution: number
  minViableCapital: number
  targetCapital: number
  maxCapital: number
  confirmedCapital: number
  reservedCapital: number
  remainingCapacity: number
  investorCount: number
  fundingOpenAt: string | null
  fundingDeadline: string | null
  isOpen: boolean
  reservationMinutes: number
  me: { kycVerified: boolean; riskAcknowledged: boolean }
  myActiveReservation: Contribution | null
}

export interface FundingBatchSummary {
  batchCode: string
  title: string
  crabType: string
  operatorName: string
  minContribution: number
  targetCapital: number
  maxCapital: number
  confirmedCapital: number
  remainingCapacity: number
  fundingDeadline: string | null
}

export const fundingKeys = {
  open: ['funding', 'open'] as const,
  batch: (code: string) => ['funding', 'batch', code] as const,
  disclosure: ['funding', 'disclosure'] as const,
  mine: ['funding', 'mine'] as const,
}

export function useOpenBatches() {
  return useQuery({ queryKey: fundingKeys.open, queryFn: async () => (await http.get<FundingBatchSummary[]>('/api/funding/batches')).data })
}

export function useFundingBatch(code: string) {
  return useQuery({
    queryKey: fundingKeys.batch(code),
    queryFn: async () => (await http.get<FundingBatch>(`/api/funding/batches/${encodeURIComponent(code)}`)).data,
    retry: false,
  })
}

export function useActiveDisclosure() {
  return useQuery({ queryKey: fundingKeys.disclosure, queryFn: async () => (await http.get<RiskDisclosure>('/api/risk-disclosures/active')).data })
}

/** Sau mỗi thao tác góp vốn: tải lại số liệu lô, danh sách lô mở và khoản góp của tôi. */
function useRefreshFunding(code?: string) {
  const queryClient = useQueryClient()
  return () => Promise.all([
    code ? queryClient.invalidateQueries({ queryKey: fundingKeys.batch(code) }) : Promise.resolve(),
    queryClient.invalidateQueries({ queryKey: fundingKeys.open }),
    queryClient.invalidateQueries({ queryKey: fundingKeys.mine }),
    queryClient.invalidateQueries({ queryKey: fundingKeys.disclosure }),
  ])
}

export function useAcknowledgeRisk(code: string) {
  const refresh = useRefreshFunding(code)
  return useMutation({
    retry: false,
    mutationFn: async (riskDisclosureId: number) =>
      (await http.post('/api/risk-acknowledgements', { riskDisclosureId, scrolledToEnd: true })).data,
    onSuccess: refresh,
  })
}

export function useReserve(code: string) {
  const refresh = useRefreshFunding(code)
  return useMutation({
    retry: false,
    mutationFn: async (amount: number) =>
      (await http.post<Contribution>(`/api/batches/${encodeURIComponent(code)}/contributions`, { amount })).data,
    onSuccess: refresh,
  })
}

export function useCancelReservation(code: string) {
  const refresh = useRefreshFunding(code)
  return useMutation({
    retry: false,
    mutationFn: async (contributionId: number) => { await http.delete(`/api/contributions/${contributionId}`) },
    onSuccess: refresh,
  })
}

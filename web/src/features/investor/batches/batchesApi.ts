import { useQuery } from '@tanstack/react-query'
import { http } from '../../../shared/api/http'
import { useAuthStore } from '../../../shared/auth/authStore'

export interface InvestorBatch {
  batchCode: string; title: string; operatorName: string; crabType: string; status: string
  seedQuantity: number; expectedOutputKg: number; cycleDays: number; restockCutoffDays: number
  minViableCapital: number; targetCapital: number; maxCapital: number; minContribution: number; operatorSharePct: number
  fundingOpenAt: string; fundingDeadline: string
  fundingProgress: { confirmedCapital: number; reservedCapital: number; investorCount: number; pctOfTarget: number; percentLabel: string }
  standardCost: { versionNo: number; status: 'Locked'; total: number; items: { category: string; amount: number }[]; lockedAt: string } | null
  offtakePreorderCapPct?: number
  offtakeDepositPct?: number
  offtakePrices?: { gradeCode: string; gradeName: string; unitPrice: number }[]
}
interface BatchPage { items: InvestorBatch[]; page: number; pageSize: number; total: number }
function readBatch(data: InvestorBatch): InvestorBatch {
  if (!data || typeof data.batchCode !== 'string' || !data.fundingProgress || !Number.isFinite(data.fundingProgress.pctOfTarget) || typeof data.fundingProgress.percentLabel !== 'string') throw new Error('Invalid batch response')
  return data
}
export function useInvestorBatches(status: string, crabType: string, page: number) {
  const user = useAuthStore(s => s.user)
  return useQuery({
    queryKey: ['investor-batches', user?.userId, 'list', status, crabType, page],
    enabled: !!user?.roles.includes('Investor'), retry: false,
    queryFn: async ({ signal }) => {
      const { data } = await http.get<BatchPage>('/api/batches', { signal, params: { status: status || undefined, crabType: crabType || undefined, page, pageSize: 20 } })
      if (!data || !Array.isArray(data.items) || !Number.isInteger(data.total) || data.pageSize <= 0) throw new Error('Invalid batch page response')
      data.items.forEach(readBatch)
      return data
    },
  })
}
export function useInvestorBatch(code: string) {
  const user = useAuthStore(s => s.user)
  return useQuery({
    queryKey: ['investor-batches', user?.userId, 'detail', code],
    enabled: !!user?.roles.includes('Investor') && !!code, retry: false,
    queryFn: async ({ signal }) => {
      const data = readBatch((await http.get<InvestorBatch>(`/api/batches/${encodeURIComponent(code)}`, { signal })).data)
      if (!data.standardCost || data.standardCost.status !== 'Locked' || !Array.isArray(data.standardCost.items)) throw new Error('Invalid published cost response')
      return data
    },
  })
}

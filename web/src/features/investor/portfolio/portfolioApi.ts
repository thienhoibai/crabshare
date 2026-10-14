import { useQuery } from '@tanstack/react-query'
import { http } from '../../../shared/api/http'
import { useAuthStore } from '../../../shared/auth/authStore'

export interface PortfolioBatch {
  code: string; title: string; operatorName: string; crabType: string; status: string
  targetCapital: number; raisedCapital: number; minContribution: number; cycleDays: number; seedQuantity: number
  fundingDeadline: string | null; stockedAt: string | null; expectedHarvestDate: string | null
  dayOfCycle: number | null; aliveCount: number | null; openAlerts: number
}
export interface PortfolioSettlement {
  status: string; capitalReturn: number; profitShare: number; taxWithheld: number; netPayout: number; inKindQtyKg: number
}
export interface PortfolioItem {
  batch: PortfolioBatch; confirmedAmount: number; capitalRatio: number | null
  capitalBasis: 'Frozen' | 'LiveConfirmed'; lastConfirmedAt: string | null; settlement: PortfolioSettlement | null
}
export interface PortfolioPage {
  items: PortfolioItem[]; page: number; pageSize: number; total: number
  summary: { totalConfirmedAmount: number; activeConfirmedAmount: number; totalBatches: number; activeBatches: number; approvedNetPayout: number }
}
export interface PortfolioDetail {
  position: PortfolioItem
  contributions: { id: number; amount: number; status: string; reservedAt: string; confirmedAt: string | null; contractNo: string | null; contractStatus: string | null; fullySignedAt: string | null }[]
  timeline: { type: string; label: string; at: string }[]
  latestProduction: { logDate: string; ph: number | null; waterTempC: number | null; salinityPpt: number | null; feedKg: number | null; source: string; plausibilityFlag: string; verifiedAt: string | null } | null
}
export const portfolioKeys = { root: ['investor-portfolio'] as const }
// A misconfigured API host may serve an HTML page with status 200. Treat it as a
// failed read so neither the overview nor its eKYC banner crashes.
function readPage(data: PortfolioPage): PortfolioPage {
  if (!data || !Array.isArray(data.items) || !data.summary || !Number.isInteger(data.total)) throw new Error('Invalid portfolio response')
  return data
}
function readDetail(data: PortfolioDetail): PortfolioDetail {
  if (!data?.position?.batch || !Array.isArray(data.contributions) || !Array.isArray(data.timeline)) throw new Error('Invalid portfolio detail response')
  return data
}
export function usePortfolio(page = 1, q = '', status = '', pageSize = 10) {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: [...portfolioKeys.root, user?.userId, 'list', page, q, status, pageSize],
    enabled: !!user?.roles.includes('Investor'), retry: false,
    queryFn: async ({ signal }) => readPage((await http.get<PortfolioPage>('/api/investor/portfolio', { signal, params: { page, pageSize, q: q || undefined, status: status || undefined } })).data),
  })
}
export function usePortfolioDetail(code: string) {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: [...portfolioKeys.root, user?.userId, 'detail', code],
    enabled: !!user?.roles.includes('Investor') && !!code, retry: false,
    queryFn: async ({ signal }) => readDetail((await http.get<PortfolioDetail>(`/api/investor/portfolio/${encodeURIComponent(code)}`, { signal })).data),
  })
}

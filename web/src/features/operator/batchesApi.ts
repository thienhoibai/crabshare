import { http } from '../../shared/api/http'

export const crabTypes = { SoftShellCrab: 'Cua lột', RoeCrab: 'Cua gạch', FatteningMudCrab: 'Cua thịt' } as const
export const costCategories = { Seed: 'Con giống', Feed: 'Thức ăn', Utilities: 'Điện nước', Labour: 'Nhân công', MortalityReserve: 'Dự phòng hao hụt', Depreciation: 'Khấu hao', Other: 'Khác' } as const
export const batchStatuses = { Draft: 'Nháp', PendingApproval: 'Chờ duyệt', Rejected: 'Bị từ chối', Funding: 'Đang gọi vốn', Cancelled: 'Đã hủy', Stocked: 'Đã thả giống', InProduction: 'Đang sản xuất', Harvesting: 'Đang thu hoạch', Settlement: 'Đang tất toán', Closed: 'Đã tất toán' } as const
export type BatchRequest = {
  title: string; crabType: keyof typeof crabTypes; seedQuantity: number; expectedOutputKg: number; cycleDays: number;
  restockCutoffDays: number; minViableCapital: number; targetCapital: number; maxCapital: number; minContribution: number; operatorSharePct: number
}
export type CostItem = { category: keyof typeof costCategories; description: string; quantity: number; unit: string; unitPrice: number; trancheNo: number | null }
export type CostTranche = { trancheNo: number; plannedDate?: string | null; anchorCode?: 'FundingReady' | 'Stocked' | null; offsetDays?: number | null; unlockCondition: string }
export type Batch = BatchRequest & {
  batchCode: string; operatorId: number; status: keyof typeof batchStatuses; canEdit: boolean; canSubmit: boolean; rejectionReason?: string | null;
  standardCost: { versionNo: number; status: string; total: number; items: (CostItem & { amount: number })[]; tranches?: (CostTranche & { amount: number })[]; lockedAt?: string | null } | null
}
export type BatchPage = { items: Batch[]; total: number; page: number; pageSize: number }
const path = (code: string) => `/api/batches/${encodeURIComponent(code)}`
export const getBatch = async (code: string, signal?: AbortSignal) => (await http.get<Batch>(`/api/operators/me/batches/${encodeURIComponent(code)}`, { signal })).data
export const listBatches = async (status: string, page: number, signal?: AbortSignal) =>
  (await http.get<BatchPage>('/api/operators/me/batches', { params: { status: status || undefined, page, pageSize: 20 }, signal })).data
export const saveBatch = async (code: string | null, request: BatchRequest) =>
  (code ? await http.put<Batch>(path(code), request) : await http.post<Batch>('/api/batches', request)).data
export const saveStandardCost = async (code: string, items: CostItem[], tranches: CostTranche[] = []) => (await http.put<Batch>(`${path(code)}/standard-cost`, { items, tranches })).data
export const submitBatch = async (code: string) => (await http.post<Batch>(`${path(code)}/submit`)).data

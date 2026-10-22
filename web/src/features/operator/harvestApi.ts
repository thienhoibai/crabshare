import { http } from '../../shared/api/http'
import type { BoxPage } from './boxesApi'

export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number }
export type HarvestSession = {
  id: number; batchCode: string; name: string | null; note: string | null; status: 'Open' | 'Completed' | 'Legacy';
  startedAt: string; completedAt: string | null; declaredBy: number; completedBy: number | null;
  harvestedCount: number; totalWeightKg: number; revision: number; canRecord: boolean; canComplete: boolean;
  gradeSummaries: { gradeCode: string; gradeName: string; crabCount: number; totalWeightKg: number }[]
}
export type HarvestContext = {
  batchCode: string; batchStatus: string; activeHarvest: HarvestSession | null; canStart: boolean; canRecord: boolean; canComplete: boolean;
  remainingGrowingCount: number; harvestedCount: number; totalWeightKg: number; slotStatus?: string | null;
  currentCrab?: { id: number; itemUuid: string; allocationId: number } | null; latestMoltedAt?: string | null
}
export type StartHarvestRequest = { requestId: string; name: string | null; note: string | null }
export type RecordHarvestRequest = { requestId: string; slotCode: string; expectedCrabItemId: number; weightG: number; shellCondition: 'HardShell' | 'SoftShell' }
export type HarvestRecord = {
  crabItemId: number; itemUuid: string; harvestId: number; batchCode: string; slotCode: string | null;
  weightG: number | null; shellCondition: RecordHarvestRequest['shellCondition'] | null; gradeCode: string | null; gradeName: string | null;
  tagCode: string | null; tagStatus: string | null; tracePath: string | null; recordedAt: string | null;
  harvestedCount: number | null; totalWeightKg: number | null; remainingGrowingCount: number | null
}
const batchPath = (code: string) => `/api/batches/${encodeURIComponent(code)}`
const harvestPath = (id: number) => `/api/harvests/${id}`
export const harvestApi = {
  context: async (code: string, slotCode: string, signal?: AbortSignal) => (await http.get<HarvestContext>(`${batchPath(code)}/harvest-context`, { params: { slotCode: slotCode || undefined }, signal })).data,
  sessions: async (code: string, page: number, signal?: AbortSignal) => (await http.get<PageResult<HarvestSession>>(`${batchPath(code)}/harvests`, { params: { page, pageSize: 20 }, signal })).data,
  session: async (id: number, signal?: AbortSignal) => (await http.get<HarvestSession>(harvestPath(id), { signal })).data,
  records: async (id: number, page: number, signal?: AbortSignal) => (await http.get<PageResult<HarvestRecord>>(`${harvestPath(id)}/crabs`, { params: { page, pageSize: 20 }, signal })).data,
  boxes: async (code: string, page: number, signal?: AbortSignal) => (await http.get<BoxPage>('/api/boxes', { params: { status: 'Occupied', batchCode: code, page, pageSize: 50 }, signal })).data,
  start: async (code: string, body: StartHarvestRequest) => (await http.post<HarvestSession>(`${batchPath(code)}/harvests`, body)).data,
  update: async (id: number, body: { expectedRevision: number; name: string | null; note: string | null }) => (await http.patch<HarvestSession>(harvestPath(id), body)).data,
  record: async (id: number, body: RecordHarvestRequest) => (await http.post<HarvestRecord>(`${harvestPath(id)}/crabs`, body)).data,
  complete: async (id: number, expectedRevision: number) => (await http.post<HarvestSession>(`${harvestPath(id)}/complete`, { expectedRevision })).data,
}

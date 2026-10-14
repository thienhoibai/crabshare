import { http } from '../../shared/api/http'
import type { Batch } from '../operator/batchesApi'
export type AdminBatch = {
  batch: Batch; operator: { operatorId: number; legalName: string; farmAddress: string; status: string };
  fundingOpenAt: string | null; fundingDeadline: string | null; feeTierId: number | null; feeTierCode: string | null;
  platformFeeAmount: number | null; rejectionReason: string | null; approvedAt: string | null; approvedBy: number | null;
  tranches: { trancheNo: number; plannedAmount: number; plannedDate: string; unlockCondition: string; status: string }[]
}
export type AdminBatchPage = { items: AdminBatch[]; page: number; pageSize: number; total: number }
const path = (code: string) => `/api/admin/batches/${encodeURIComponent(code)}`
export const listAdminBatches = async (status: string, page: number, signal?: AbortSignal) =>
  (await http.get<AdminBatchPage>('/api/admin/batches', { params: { status: status || undefined, page, pageSize: 20 }, signal })).data
export const getAdminBatch = async (code: string, signal?: AbortSignal) => (await http.get<AdminBatch>(path(code), { signal })).data
export const approveBatch = async (code: string, fundingOpenAt: string, fundingDeadline: string) =>
  (await http.post<AdminBatch>(`${path(code)}/approve`, { fundingOpenAt, fundingDeadline })).data
export const rejectBatch = async (code: string, reason: string) => (await http.post<AdminBatch>(`${path(code)}/reject`, { reason })).data

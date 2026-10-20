import axios from 'axios'
import { http, type ApiProblem } from '../../shared/api/http'
import type { batchStatuses } from './batchesApi'

export type WaterRanges = {
  phMin: number; phMax: number; waterTempMinC: number; waterTempMaxC: number; salinityMinPpt: number; salinityMaxPpt: number
}
export type ThresholdVersion = WaterRanges & { id: number; versionNo: number; createdBy: number; createdAt: string }
export type ThresholdState = { businessDate: string; canConfigure: boolean; canRecord: boolean; current: ThresholdVersion | null }
export type DailyLogRequest = { ph: number; waterTempC: number; salinityPpt: number; feedKg: number; note?: string }
export type DailyLog = {
  id: number; batchCode: string; logDate: string; ph: number | null; waterTempC: number | null; salinityPpt: number | null;
  feedKg: number | null; note: string | null; source: string; plausibilityFlag: string; recordedBy: number | null;
  createdAt: string; thresholdVersion: number | null; thresholdsApplied: ThresholdVersion | null
}
export type ProductionBatch = {
  batchCode: string; title: string; crabType: string; status: keyof typeof batchStatuses; cycleDays: number; seedQuantity: number;
  aliveCount: number; dayOfCycle: number | null; latestLog: DailyLog | null; loggedToday: boolean; canRecord: boolean; businessDate: string
}
export type ProductionPage<T> = { items: T[]; page: number; pageSize: number; total: number }
export type LogFilters = { from: string; to: string; page: number }
const batchPath = (code: string) => `/api/batches/${encodeURIComponent(code)}`

// The selector must include batches after the first API page, including partial harvests.
export async function productionBatches(signal?: AbortSignal): Promise<ProductionBatch[]> {
  const batches: ProductionBatch[] = []
  let page = 1
  while (true) {
    const { data } = await http.get<ProductionPage<ProductionBatch>>('/api/operators/me/production-batches', { params: { page, pageSize: 50 }, signal })
    batches.push(...data.items)
    if (!data.items.length || data.page * data.pageSize >= data.total) return batches
    page++
  }
}
export const productionThresholds = async (code: string, signal?: AbortSignal) =>
  (await http.get<ThresholdState>(`${batchPath(code)}/production-thresholds`, { signal })).data
export const saveProductionThresholds = async (code: string, request: WaterRanges & { expectedVersionNo: number }) =>
  (await http.put<ThresholdVersion>(`${batchPath(code)}/production-thresholds`, request)).data
export const createProductionLog = async (code: string, request: DailyLogRequest) =>
  (await http.post<DailyLog>(`${batchPath(code)}/production-logs`, request)).data
export const productionLogs = async (code: string, filters: LogFilters, signal?: AbortSignal) =>
  (await http.get<ProductionPage<DailyLog>>(`${batchPath(code)}/production-logs`, { params: { from: filters.from || undefined, to: filters.to || undefined, page: filters.page, pageSize: 10 }, signal })).data
export const productionProblemCode = (error: unknown) => axios.isAxiosError<ApiProblem>(error) ? error.response?.data.code : undefined
export const productionDate = (value: string) => value.split('-').reverse().join('/')
export const productionTime = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })

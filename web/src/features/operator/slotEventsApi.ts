import axios from 'axios'
import { http } from '../../shared/api/http'

export type SlotEventType = 'Molted' | 'Mortality' | 'Restocked' | 'Relocated'
export const slotEventLabels: Record<SlotEventType, string> = { Molted: 'Lột xác', Mortality: 'Cua chết', Restocked: 'Thả bù', Relocated: 'Chuyển hộp' }
export type SlotEventPolicyRequest = {
  expectedVersionNo: number; restockCutoffBasis: 'AfterStocking' | 'BeforeHarvest'; restockCutoffDays: number;
  mortalityWindowHours: number | null; mortalityThresholdPercent: number | null; mortalitySeverity: string | null; mortalityAckWithinHours: number | null
}
export type SlotEventPolicy = Omit<SlotEventPolicyRequest, 'expectedVersionNo'> & { id: number; versionNo: number; createdBy: number; createdAt: string }
export type SlotEventPolicyState = { batchCode: string; canConfigure: boolean; current: SlotEventPolicy | null; restockDeadline: string | null; suggestedRestockCutoffDays: number; businessDate: string }
export type SlotEventContext = {
  batchCode: string; slotCode: string; status: string; currentCrab: { id: number; itemUuid: string; status: string } | null;
  replacementCandidates: { id: number; itemUuid: string; diedAt: string }[];
  availableEvidence: { id: number; capturedAt: string; reviewStatus: string }[];
  restockDeadline: string | null; canRecord: boolean; aliveCount: number
}
export type SlotEventRequest = { requestId: string; slotCode: string; eventType: SlotEventType; occurredAt: string; quantity: 1; note?: string; destinationSlotCode?: string; replacesCrabItemId?: number; evidenceId?: number }
export type SlotEvent = Omit<SlotEventRequest, 'requestId' | 'eventType' | 'destinationSlotCode' | 'replacesCrabItemId' | 'evidenceId'> & { id: number; batchCode: string; eventType: string; crabItemId: number | null; itemUuid: string | null; destinationSlotCode: string | null; replacesCrabItemId: number | null; evidenceId: number | null; actorId: number | null; aliveCount: number | null }
const path = (code: string) => `/api/batches/${encodeURIComponent(code)}`
export const getSlotEventPolicy = async (code: string, signal?: AbortSignal) => (await http.get<SlotEventPolicyState>(`${path(code)}/slot-event-policy`, { signal })).data
export const saveSlotEventPolicy = async (code: string, request: SlotEventPolicyRequest) => (await http.put<SlotEventPolicy>(`${path(code)}/slot-event-policy`, request)).data
export const getSlotEventContext = async (code: string, slotCode: string, signal?: AbortSignal) => (await http.get<SlotEventContext>(`${path(code)}/slot-event-context`, { params: { slotCode }, signal })).data
export const getSlotEvents = async (code: string, page: number, signal?: AbortSignal) => (await http.get<{ items: SlotEvent[]; page: number; pageSize: number; total: number }>(`${path(code)}/slot-events`, { params: { page, pageSize: 10 }, signal })).data
export const recordSlotEvent = async (code: string, request: SlotEventRequest) => (await http.post<SlotEvent>(`${path(code)}/slot-events`, request)).data
export const isSlotConflict = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 409
export const slotTime = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
export const slotDate = (value: string) => value.split('-').reverse().join('/')

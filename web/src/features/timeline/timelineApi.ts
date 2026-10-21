import { useInfiniteQuery } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'

export interface TimelineItem {
  id: string; type: 'ProductionLog' | 'SlotEvent' | 'Evidence' | 'Alert'; sourceId: string
  businessDate: string; occurredAt: string | null; timeBasis: string
  productionLog: { ph: number | null; waterTempC: number | null; salinityPpt: number | null; feedKg: number | null; source: string; plausibilityFlag: string; note: string | null } | null
  slotEvent: { eventType: string; slotCode: string; destinationSlotCode: string | null; quantity: number; note: string | null } | null
  evidence: { mediaType: string; source: string; slotCode: string | null; reviewStatus: 'Accepted'; fileUrl: string } | null
  alert: { type: string; severity: string; message: string; status: string; acknowledgedAt: string | null; escalatedAt: string | null } | null
}
export interface TimelineDay { date: string; items: TimelineItem[] }
export interface TimelinePage { batchCode: string; timeZone: string; groups: TimelineDay[]; nextBefore: string | null; hasMore: boolean }

export function useTimeline(code: string) {
  const userId = useAuthStore(s => s.user?.userId)
  return useInfiniteQuery({
    queryKey: ['batch-timeline', userId, code], initialPageParam: null as string | null,
    enabled: !!userId && !!code, retry: false, gcTime: 0, staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await http.get<TimelinePage>(`/api/batches/${encodeURIComponent(code)}/timeline`, {
        params: { days: 7, ...(pageParam ? { before: pageParam } : {}) }, signal,
      })
      if (data.batchCode !== code || !Array.isArray(data.groups)) throw new Error('Invalid timeline response')
      return data
    },
    getNextPageParam: last => last.hasMore ? last.nextBefore ?? undefined : undefined,
  })
}

export const timelineFile = (code: string, id: string, signal: AbortSignal) =>
  http.get<Blob>(`/api/batches/${encodeURIComponent(code)}/timeline/evidence/${encodeURIComponent(id)}/file`, { signal, responseType: 'blob' }).then(r => r.data)

export function mergeTimeline(pages: TimelinePage[]): TimelineDay[] {
  const seen = new Set<string>()
  const days = new Map<string, TimelineItem[]>()
  for (const page of pages) for (const group of page.groups) for (const item of group.items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const items = days.get(group.date) ?? []
    items.push(item); days.set(group.date, items)
  }
  return [...days].sort(([a], [b]) => b.localeCompare(a)).map(([date, items]) => ({ date, items }))
}

export const dayLabel = (day: string) => new Date(`${day}T00:00:00+07:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
export const timeLabel = (at: string) => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
export const slotLabels: Record<string, string> = { Stocked: 'Thả giống', Molted: 'Lột xác', Mortality: 'Ghi nhận hao hụt', Restocked: 'Thả bù', Harvested: 'Thu hoạch', Relocated: 'Chuyển hộp' }
export const alertLabels: Record<string, string> = { WaterQuality: 'Chất lượng nước', Mortality: 'Hao hụt', DataSilence: 'Thiếu nhật ký', MilestoneDelay: 'Chậm mốc sản xuất', LowStock: 'Tồn kho thấp', EvidenceFlag: 'Cần kiểm tra bằng chứng' }
export const statusLabels: Record<string, string> = { Open: 'Chờ phản hồi', Acknowledged: 'Đã phản hồi', Escalated: 'Đã chuyển quản trị', Resolved: 'Đã xử lý' }
export const severityLabels: Record<string, string> = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao', Critical: 'Nghiêm trọng' }

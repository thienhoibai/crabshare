/* UC21 — Nhật trình của một Lô: GET /api/batches/{code}/timeline?days=&before= (phân trang trọn nhóm ngày, giờ Việt Nam).
   v1.5 thêm sự kiện từng con cua (crabEvent, BR-142). Tải thêm ngày cũ cần useInfiniteQuery nên không dùng useGet ở đây. */
import { useInfiniteQuery } from '@tanstack/react-query'
import type { TimelineDay, TimelineItem, TimelinePage } from '../../shared/api/api.gen'
import { http } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import type { Tone } from '../../shared/ui/console'

export type { TimelineDay, TimelineItem, TimelinePage }

export const timelinePath = (code: string) => `/api/batches/${encodeURIComponent(code)}/timeline`

/** Đường dẫn tệp của một bằng chứng đã được chấp nhận (cần đăng nhập, dùng với AuthImage hoặc openFile). */
export const timelineFilePath = (code: string, evidenceId: string) => `${timelinePath(code)}/evidence/${encodeURIComponent(evidenceId)}/file`

export function useTimeline(code: string) {
  const userId = useAuthStore((s) => s.user?.userId)
  return useInfiniteQuery({
    queryKey: [timelinePath(code), 'pages', userId],
    initialPageParam: null as string | null,
    enabled: !!userId && !!code,
    retry: false,
    queryFn: async ({ pageParam, signal }) =>
      (await http.get<TimelinePage>(timelinePath(code), { params: { days: 7, ...(pageParam ? { before: pageParam } : {}) }, signal })).data,
    getNextPageParam: (last) => (last.hasMore ? last.nextBefore ?? undefined : undefined),
  })
}

/** Gộp các trang đã tải thành nhóm ngày, ngày mới nhất ở trên, bỏ ghi nhận trùng. */
export function mergeTimeline(pages: TimelinePage[]): TimelineDay[] {
  const seen = new Set<string>()
  const days = new Map<string, TimelineItem[]>()
  for (const page of pages) {
    for (const group of page.groups) {
      for (const item of group.items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        days.set(group.date, [...(days.get(group.date) ?? []), item])
      }
    }
  }
  return [...days].sort(([a], [b]) => b.localeCompare(a)).map(([date, items]) => ({ date, items }))
}

export const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00+07:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })

export const timeLabel = (at: string) => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })

/* Nhãn của các mã chỉ xuất hiện trong nhật trình (status.ts chưa có kind tương ứng). */

/** Sự kiện theo hộp nuôi (slot_event.event_type). */
export const SLOT_EVENT: Record<string, string> = {
  Stocked: 'Thả cua vào hộp',
  Molted: 'Cua lột xác',
  Mortality: 'Ghi nhận cua chết',
  Restocked: 'Thả bù',
  Harvested: 'Thu hoạch',
  Relocated: 'Chuyển hộp',
}

/** Sự kiện của từng con cua (inventory_event.event_type, BR-142). */
export const CRAB_EVENT: Record<string, [label: string, tone: Tone]> = {
  Received: ['Nhận cua về trại', 'info'],
  Boxed: ['Xếp vào hộp', 'info'],
  Moved: ['Chuyển hộp', 'mute'],
  AbnormalFeeding: ['Ăn bất thường', 'warn'],
  Inspected: ['Kiểm tra', 'info'],
  Died: ['Cua chết', 'danger'],
  Molted: ['Lột xác', 'info'],
  Graded: ['Đã phân hạng', 'gold'],
  Downgraded: ['Hạ hạng', 'warn'],
  Shipped: ['Xuất hàng', 'gold'],
  Delivered: ['Đã giao', 'ok'],
  Sold: ['Đã bán', 'ok'],
  Destroyed: ['Loại bỏ', 'danger'],
  Returned: ['Trả về tồn', 'warn'],
}

/** Nguồn ghi sự kiện cua. */
export const EVENT_SOURCE: Record<string, string> = {
  App: 'người nuôi ghi',
  Station: 'trạm đo',
  Device: 'thiết bị',
  System: 'hệ thống',
  Qc: 'Nhân viên kiểm phẩm',
}

export const PLAUSIBILITY: Record<string, [label: string, tone: Tone]> = {
  Ok: ['Trong ngưỡng', 'ok'],
  OutOfRange: ['Ngoài ngưỡng', 'warn'],
  Inconsistent: ['Cần đối chiếu', 'danger'],
}

export const MEDIA: Record<string, string> = { Photo: 'Ảnh bằng chứng', Video: 'Video bằng chứng', Invoice: 'Chứng từ' }

/* Phần dùng chung của nhóm trang thu hoạch, giao hàng, bán có hoá đơn và tiền trong cổng người nuôi. */
import { useQueries } from '@tanstack/react-query'
import type { OperatorResponse, PagedResultOfBatchResponse } from '../../../shared/api/api.gen'
import { http, useGet } from '../../../shared/ui/console'

export const enc = encodeURIComponent

/** Đường dẫn tới một mục của trang làm việc Lô. */
export const batchHref = (code: string, tab = '') => `/operator/batches/${enc(code)}${tab ? `/${tab}` : ''}`

/**
 * Mốc giải ngân của một Lô (Features/Payments/DisbursementDtos.cs → TrancheResponse).
 * api.gen.ts chỉ giữ một kiểu tên TrancheResponse là đợt giao của đơn đặt trước, nên kiểu của mốc giải ngân khai báo ở đây.
 */
export interface MilestoneTranche {
  trancheId: number
  batchCode: string
  batchTitle: string
  operatorName: string
  trancheNo: number
  plannedAmount: number
  plannedDate: string | null
  unlockCondition: string
  status: string
  requestedAt: string | null
  explanationDeadline: string | null
  releasedAt: string | null
  canRequest: boolean
  blockedReason: string | null
  instructionId: number | null
  instructionStatus: string | null
}

const NOT_OPENED = ['Draft', 'PendingApproval', 'NeedsRevision', 'Rejected', 'Cancelled']

/** Lô đã được duyệt và mở (từ lúc gọi vốn hoặc mua nguồn trở đi). */
export const isOpened = (status: string) => !NOT_OPENED.includes(status)

/** Các Lô của hộ nuôi tôi (tối đa 100 Lô gần nhất). */
export const useMyBatches = () => useGet<PagedResultOfBatchResponse>('/api/operators/me/batches', { pageSize: 100 })

/** Chỉ chủ hộ nuôi mới lập chuyến, xin giải ngân, ký hợp đồng. Nhân viên chỉ xem. */
export function useIsOwner() {
  const me = useGet<OperatorResponse>('/api/operators/me', undefined, { retry: false })
  return { known: me.isSuccess, owner: me.data?.memberRole === 'Owner' }
}

/** GET nhiều đường dẫn cùng lúc (mỗi Lô một đường dẫn); dùng chung bộ nhớ đệm với useGet. */
export function useGetMany<T>(urls: string[]) {
  return useQueries({
    queries: urls.map((url) => ({
      queryKey: [url, undefined],
      queryFn: async () => (await http.get<T>(url)).data,
    })),
  })
}

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })

/** Số có dấu phẩy thập phân kiểu Việt Nam, kèm đơn vị; null thì hiện gạch. */
export const fmtNum = (value: number | null | undefined, unit = '') =>
  value === null || value === undefined ? '—' : `${nf.format(value)}${unit ? ` ${unit}` : ''}`

export const fmtKg = (value: number | null | undefined) => fmtNum(value, 'kg')

/** Khoảng thời gian tới một hạn: "còn 5 giờ" hoặc "quá hạn 2 giờ". */
export function dueText(iso: string | null | undefined): { text: string; late: boolean } | null {
  if (!iso) return null
  const ms = Date.parse(iso) - Date.now()
  if (Number.isNaN(ms)) return null
  const abs = Math.abs(ms)
  const hours = Math.floor(abs / 3_600_000)
  const span = hours >= 48 ? `${Math.floor(hours / 24)} ngày` : hours >= 1 ? `${hours} giờ` : `${Math.max(1, Math.floor(abs / 60_000))} phút`
  return ms >= 0 ? { text: `còn ${span}`, late: false } : { text: `quá hạn ${span}`, late: true }
}

/** Giá trị cho ô datetime-local theo giờ máy người dùng. */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* Phần dùng chung của cổng khách hàng: truy vấn đơn và chuyến giao, cách đọc số lượng, trạng thái cọc,
   và ghi nhớ trên máy những mã mà API chưa có danh sách (mã khiếu nại, đánh giá đã gửi). */
import { useQueries } from '@tanstack/react-query'
import type {
  OrderDeliveriesResponse, OrderRatingResponse, PagedResultOfPreorderResponse, PreorderLineResponse, PreorderResponse, ShipmentResponse, TrancheResponse,
} from '../../shared/api/api.gen'
import { http, useGet } from '../../shared/ui/console'

/** Đường dẫn trang chi tiết đơn, kèm neo tới một mục (coc, dot-giao, chuyen-<mã chuyến>, hoa-don, khieu-nai, danh-gia). */
export const orderHref = (orderNo: string, section?: string) => `/khach/don/${encodeURIComponent(orderNo)}${section ? `#${section}` : ''}`

const kgFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })

/** "12,5 kg"; null thì hiện gạch. */
export const fmtKg = (kg: number | null | undefined) => (kg === null || kg === undefined ? '—' : `${kgFormat.format(kg)} kg`)

/** "312,5 km". */
export const fmtKm = (km: number) => `${kgFormat.format(km)} km`

/** Số lượng của một dòng theo đúng đơn vị khách đã đặt. */
export const lineQty = (l: Pick<PreorderLineResponse, 'mode' | 'qtyCrabs' | 'qtyKg'>) => (l.mode === 'ByKg' ? fmtKg(l.qtyKg) : `${l.qtyCrabs ?? 0} con`)

/** Đơn còn đang chạy (chưa kết thúc, chưa huỷ). */
export const OPEN_ORDER = ['PendingDeposit', 'Deposited', 'Confirmed', 'Delivering', 'Delivered', 'CancelRequested']

/** Đơn có thể đã có chuyến giao cần khách theo dõi. */
export const DELIVERY_ORDER = ['Confirmed', 'Delivering', 'Delivered']

/** Khách còn tự huỷ được (BR-096, BR-097). */
export const CANCELLABLE = ['PendingDeposit', 'Deposited', 'Confirmed']

/** Mã trạng thái cọc (kind "deposit") suy ra từ trạng thái đơn; đơn huỷ khi chưa cọc thì không có. */
export function depositState(order: Pick<PreorderResponse, 'status'>): string | null {
  switch (order.status) {
    case 'PendingDeposit': return 'Pending'
    case 'Deposited': case 'CancelRequested': case 'Confirmed': case 'Delivering': return 'Held'
    case 'Delivered': case 'Completed': return 'Applied'
    case 'Forfeited': return 'Forfeited'
    case 'Refunded': return 'Refunded'
    default: return null
  }
}

/** Đợt giao sắp tới: đợt chưa hoàn tất có thứ tự nhỏ nhất. */
export const nextTranche = (order: Pick<PreorderResponse, 'tranches'>): TrancheResponse | undefined =>
  [...order.tranches].sort((a, b) => a.seq - b.seq).find((t) => ['Planned', 'Allocated', 'Dispatched', 'Accepted'].includes(t.status))

/** Chuyến giao đang ở bước nào đối với khách. */
export type ShipmentStage = 'accept' | 'pay' | 'transit' | 'scheduled' | 'done' | 'closed'

export function shipmentStage(s: ShipmentResponse): ShipmentStage {
  if (s.status === 'Dispatched') return s.acceptance?.status === 'Pending' ? 'accept' : 'transit'
  if (s.status === 'Scheduled') return 'scheduled'
  if (s.status === 'Accepted') {
    const a = s.acceptance
    return a?.status === 'Confirmed' && (a.balanceDue ?? 0) > 0 && !a.balancePaidAt ? 'pay' : 'done'
  }
  return 'closed'
}

/** Chuyến đã nghiệm thu và còn trong hạn đổi trả (BR-172). */
export const inReturnWindow = (s: ShipmentResponse) =>
  s.status === 'Accepted' && !!s.returnWindowEndsAt && Date.parse(s.returnWindowEndsAt) > Date.now()

/** Đơn đặt trước của tôi, mới nhất trước (GET /api/preorders, tối đa 100 đơn mỗi trang). */
export const useMyOrders = (page = 1) => useGet<PagedResultOfPreorderResponse>('/api/preorders', { page, pageSize: 100 })

const deliveriesUrl = (orderNo: string) => `/api/preorders/${encodeURIComponent(orderNo)}/deliveries`

/** Chuyến giao, nghiệm thu và hoá đơn của một đơn. */
export const useOrderDeliveries = (orderNo: string | null) => useGet<OrderDeliveriesResponse>(orderNo ? deliveriesUrl(orderNo) : null)

/** Chuyến giao của nhiều đơn một lúc; dùng chung bộ nhớ đệm với useOrderDeliveries. */
export function useDeliveriesOf(orderNos: string[]) {
  return useQueries({
    queries: orderNos.map((no) => ({
      queryKey: [deliveriesUrl(no), undefined],
      queryFn: async ({ signal }: { signal: AbortSignal }) => (await http.get<OrderDeliveriesResponse>(deliveriesUrl(no), { signal })).data,
    })),
  })
}

/* ---------- ghi nhớ trên máy ----------
   API chưa có danh sách khiếu nại của khách và chưa trả lại đánh giá đã gửi, nên trang nhớ mã khiếu nại và đánh giá
   vừa gửi trong localStorage của trình duyệt này. Dữ liệu thật vẫn lấy từ API theo mã. */

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const write = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* trình duyệt chặn lưu: bỏ qua, trang vẫn chạy trong phiên này */
  }
}

const claimKey = (userId: number) => `crabshare-claims-${userId}`
const ratingKey = (userId: number) => `crabshare-ratings-${userId}`

export const rememberedClaims = (userId: number, orderNo: string): string[] => read<Record<string, string[]>>(claimKey(userId), {})[orderNo] ?? []

export function rememberClaim(userId: number, orderNo: string, claimNo: string): string[] {
  const all = read<Record<string, string[]>>(claimKey(userId), {})
  const list = [...new Set([...(all[orderNo] ?? []), claimNo])]
  write(claimKey(userId), { ...all, [orderNo]: list })
  return list
}

export const rememberedRating = (userId: number, orderNo: string): OrderRatingResponse | null =>
  read<Record<string, OrderRatingResponse>>(ratingKey(userId), {})[orderNo] ?? null

export function rememberRating(userId: number, rating: OrderRatingResponse) {
  write(ratingKey(userId), { ...read<Record<string, OrderRatingResponse>>(ratingKey(userId), {}), [rating.orderNo]: rating })
}

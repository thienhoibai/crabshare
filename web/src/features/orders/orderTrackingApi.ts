import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import type { Paged } from '../store/storeApi'

/** Gọi API theo dõi / lịch sử / huỷ đơn (UC28, NH-07). Tách khỏi ordersApi.ts (checkout). */

export interface OrderSummary {
  orderNo: string
  batchCode: string
  farmName: string
  status: string
  totalAmount: number
  lineCount: number
  totalKg: number
  placedAt: string
  cancelledAt: string | null
  cancelReason: string | null
}

export interface OrderTrackingLine {
  listingId: number
  title: string
  gradeCode: string
  gradeName: string
  quantityKg: number
  unitPrice: number
  amount: number
}

export interface OrderTrackingPayment {
  paymentRequestId: number
  referenceCode: string
  status: string
  amount: number
  expiresAt: string
  paidAt: string | null
}

export interface OrderTimelineStep {
  step: string
  at: string | null
  done: boolean
}

export interface OrderTracking {
  orderNo: string
  batchCode: string
  farmName: string
  status: string
  totalAmount: number
  placedAt: string
  recipientName: string
  recipientPhone: string
  shippingAddress: string
  cancelledAt: string | null
  cancelReason: string | null
  canCancel: boolean
  lines: OrderTrackingLine[]
  payment: OrderTrackingPayment | null
  timeline: OrderTimelineStep[]
}

export interface CancelOrderResult {
  orderNo: string
  status: string
  cancelledAt: string
  cancelReason: string
  releasedKg: number
  refundInstructionId: number | null
}

export interface OrderListQuery {
  status?: string
  page?: number
  pageSize?: number
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PendingPayment: 'Chờ chuyển khoản',
  Paid: 'Đã thanh toán',
  Packed: 'Đã đóng gói',
  Shipping: 'Đang giao',
  Delivered: 'Đã giao',
  Completed: 'Hoàn tất',
  Cancelled: 'Đã huỷ',
  Returned: 'Đã trả hàng',
  Expired: 'Hết hạn',
}

export const TIMELINE_LABELS: Record<string, string> = {
  placed: 'Đã đặt hàng',
  paid: 'Đã thanh toán',
  packed: 'Đã đóng gói',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
  returned: 'Đã trả hàng',
}

export const statusTone = (status: string) => {
  if (status === 'Cancelled' || status === 'Returned' || status === 'Expired') return 'cancelled'
  if (status === 'Completed' || status === 'Delivered') return 'done'
  if (status === 'Shipping' || status === 'Packed' || status === 'Paid') return 'progress'
  return 'wait'
}

export const orderTrackingApi = {
  list: (q: OrderListQuery) =>
    http.get<Paged<OrderSummary>>('/api/orders', { params: q }).then((r) => r.data),
  get: (orderNo: string) =>
    http.get<OrderTracking>(`/api/orders/${encodeURIComponent(orderNo)}`).then((r) => r.data),
  cancel: (orderNo: string, reason: string) =>
    http.post<CancelOrderResult>(`/api/orders/${encodeURIComponent(orderNo)}/cancel`, { reason }).then((r) => r.data),
}

export const orderKeys = {
  list: (q: OrderListQuery) => ['orders', 'mine', q] as const,
  detail: (orderNo: string) => ['orders', 'tracking', orderNo] as const,
}

export const useMyOrders = (q: OrderListQuery) =>
  useQuery({ queryKey: orderKeys.list(q), queryFn: () => orderTrackingApi.list(q) })

export const useOrderTracking = (orderNo: string | undefined) =>
  useQuery({
    queryKey: orderKeys.detail(orderNo ?? ''),
    queryFn: () => orderTrackingApi.get(orderNo!),
    enabled: !!orderNo,
  })

export function useCancelOrder(orderNo: string) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: (reason: string) => orderTrackingApi.cancel(orderNo, reason),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

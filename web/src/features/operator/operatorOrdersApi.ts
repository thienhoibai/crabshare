import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import type { ReturnRequestInfo } from '../orders/orderTrackingApi'

export type OperatorOrderStatus = 'All' | 'ReturnRequested' | 'Paid' | 'Packed' | 'Shipping' | 'Delivered' | 'Returned' | 'Completed'

export interface OperatorOrderCounts {
  all: number
  returnRequested: number
  paid: number
  packed: number
  shipping: number
  delivered: number
  returned: number
  completed: number
}

export interface OperatorOrderShipment {
  carrierName: string | null
  vehiclePlate: string | null
  driverPhone: string | null
  expectedArrivalAt: string | null
  note: string | null
  shippedAt: string | null
  deliveredAt: string | null
  receivedAt: string | null
  returnWindowEndsAt: string | null
  completedAt: string | null
}

export interface ShipOrderInput {
  carrierName: string
  vehiclePlate?: string
  driverPhone: string
  expectedArrivalAt?: string
  note?: string
}

export interface OperatorOrderSummary {
  orderNo: string
  status: string
  placedAt: string
  paidAt: string | null
  batchCode: string
  customerName: string
  lineCount: number
  totalKg: number
  totalAmount: number
  returnRequest?: ReturnRequestInfo | null
}

export interface PackedTag {
  tagCode: string
  weightG: number
  gradeCode: string
}

export interface OperatorOrderLine {
  orderLineId: number
  listingId: number
  title: string
  batchCode: string
  gradeCode: string
  gradeName: string
  quantityKg: number
  assignedKg: number
  assignedCount: number
  tags: PackedTag[]
}

export interface OperatorOrderDetail {
  orderNo: string
  status: string
  placedAt: string
  paidAt: string | null
  batchCode: string
  customerName: string
  recipientName: string
  recipientPhone: string
  shippingAddress: string
  totalAmount: number
  totalKg: number
  lines: OperatorOrderLine[]
  shipment: OperatorOrderShipment | null
  returnReason?: string | null
  refundAmount?: number | null
  returnRequest?: ReturnRequestInfo | null
}

export const operatorOrdersApi = {
  list: (status: OperatorOrderStatus = 'Paid') =>
    http.get<OperatorOrderSummary[]>('/api/operators/me/orders', { params: { status } }).then((r) => r.data),
  getCounts: () => http.get<OperatorOrderCounts>('/api/operators/me/orders/counts').then((r) => r.data),
  get: (orderNo: string) => http.get<OperatorOrderDetail>(`/api/operators/me/orders/${orderNo}`).then((r) => r.data),
  pack: (orderNo: string, tagCodes: string[]) =>
    http.post<OperatorOrderDetail>(`/api/orders/${orderNo}/pack`, { tagCodes }).then((r) => r.data),
  ship: (orderNo: string, body: ShipOrderInput) =>
    http.post<OperatorOrderDetail>(`/api/orders/${orderNo}/ship`, body).then((r) => r.data),
  deliver: (orderNo: string) => http.post<OperatorOrderDetail>(`/api/orders/${orderNo}/deliver`).then((r) => r.data),
  approveReturn: (orderNo: string, note?: string) =>
    http.post<OperatorOrderDetail>(`/api/orders/${orderNo}/return/approve`, { note: note?.trim() || null }).then((r) => r.data),
  rejectReturn: (orderNo: string, body: { reason: string; evidenceUri?: string | null }) =>
    http.post<OperatorOrderDetail>(`/api/orders/${orderNo}/return/reject`, body).then((r) => r.data),
}

const keys = {
  counts: () => ['operator-orders', 'counts'] as const,
  list: (status: string) => ['operator-orders', status] as const,
  detail: (orderNo: string) => ['operator-orders', 'detail', orderNo] as const,
}

export const useOperatorOrderCounts = () =>
  useQuery({ queryKey: keys.counts(), queryFn: () => operatorOrdersApi.getCounts() })

export const useOperatorOrders = (status: OperatorOrderStatus) =>
  useQuery({ queryKey: keys.list(status), queryFn: () => operatorOrdersApi.list(status) })

export const useOperatorOrder = (orderNo: string | undefined) =>
  useQuery({ queryKey: keys.detail(orderNo ?? ''), queryFn: () => operatorOrdersApi.get(orderNo!), enabled: !!orderNo })

export function usePackOrder(orderNo: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagCodes: string[]) => operatorOrdersApi.pack(orderNo, tagCodes),
    onSuccess: (detail) => {
      qc.invalidateQueries({ queryKey: keys.list('Paid') })
      qc.invalidateQueries({ queryKey: keys.list('Packed') })
      qc.setQueryData(keys.detail(orderNo), detail)
    },
  })
}

export function useShipOrder(orderNo: string) {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: (body: ShipOrderInput) => operatorOrdersApi.ship(orderNo, body),
    onSuccess: (detail) => {
      qc.setQueryData(keys.detail(orderNo), detail)
      void qc.invalidateQueries({ queryKey: ['operator-orders'], predicate: (q) => q.queryKey[1] !== 'detail' })
    },
  })
}

export function useDeliverOrder(orderNo: string) {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: () => operatorOrdersApi.deliver(orderNo),
    onSuccess: (detail) => {
      qc.setQueryData(keys.detail(orderNo), detail)
      void qc.invalidateQueries({ queryKey: ['operator-orders'], predicate: (q) => q.queryKey[1] !== 'detail' })
    },
  })
}

export function useApproveReturnOrder(orderNo: string) {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: (note?: string) => operatorOrdersApi.approveReturn(orderNo, note),
    onSuccess: (detail) => {
      qc.setQueryData(keys.detail(orderNo), detail)
      void qc.invalidateQueries({ queryKey: ['operator-orders'], predicate: (q) => q.queryKey[1] !== 'detail' })
      void qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function useRejectReturnOrder(orderNo: string) {
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: (body: { reason: string; evidenceUri?: string | null }) => operatorOrdersApi.rejectReturn(orderNo, body),
    onSuccess: (detail) => {
      qc.setQueryData(keys.detail(orderNo), detail)
      void qc.invalidateQueries({ queryKey: ['operator-orders'], predicate: (q) => q.queryKey[1] !== 'detail' })
      void qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

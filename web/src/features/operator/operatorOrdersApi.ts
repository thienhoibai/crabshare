import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'

export type OperatorOrderStatus = 'Paid' | 'Packed'

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
}

export const operatorOrdersApi = {
  list: (status: OperatorOrderStatus = 'Paid') =>
    http.get<OperatorOrderSummary[]>('/api/operators/me/orders', { params: { status } }).then((r) => r.data),
  get: (orderNo: string) => http.get<OperatorOrderDetail>(`/api/operators/me/orders/${orderNo}`).then((r) => r.data),
  pack: (orderNo: string, tagCodes: string[]) =>
    http.post<OperatorOrderDetail>(`/api/orders/${orderNo}/pack`, { tagCodes }).then((r) => r.data),
}

const keys = {
  list: (status: string) => ['operator-orders', status] as const,
  detail: (orderNo: string) => ['operator-orders', 'detail', orderNo] as const,
}

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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { orderKeys } from './orderTrackingApi'

export interface OrderItemRating {
  listingId: number
  title: string
  gradeName: string
  stars: number
  comment: string | null
}

export interface RateOrderItemInput {
  listingId: number
  stars: number
  comment: string | null
}

export interface Rating {
  ratingId: number
  orderNo: string
  stars: number
  comment: string | null
  createdAt: string
  items?: OrderItemRating[]
}

export interface OrderRatingView {
  canRate: boolean
  rating: Rating | null
}

export interface ReturnOrderInput {
  reason: string
  evidenceUri: string
  requireApproval?: boolean
}

export interface ReturnResult {
  orderNo: string
  status: string
  refundAmount: number
  refundInstructionId: number
  returnRequest?: import('./orderTrackingApi').ReturnRequestInfo | null
}

export const ratingApi = {
  get: (orderNo: string) =>
    http.get<OrderRatingView>(`/api/orders/${encodeURIComponent(orderNo)}/rating`).then((r) => r.data),
  submit: (orderNo: string, stars: number, comment: string, items?: RateOrderItemInput[]) =>
    http.post<Rating>(`/api/orders/${encodeURIComponent(orderNo)}/rating`, {
      stars,
      comment: comment.trim() === '' ? null : comment.trim(),
      ...(items && items.length > 0 ? { items } : {}),
    }).then((r) => r.data),
  returnOrder: (orderNo: string, input: ReturnOrderInput) =>
    http.post<ReturnResult>(`/api/orders/${encodeURIComponent(orderNo)}/return`, {
      reason: input.reason.trim(),
      evidenceUri: input.evidenceUri.trim(),
      requireApproval: input.requireApproval ?? true,
    }).then((r) => r.data),
}

export const useOrderRating = (orderNo: string | undefined) =>
  useQuery({
    queryKey: ['orders', 'rating', orderNo ?? ''],
    queryFn: () => ratingApi.get(orderNo!),
    enabled: !!orderNo,
  })

export function useSubmitRating(orderNo: string) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: (input: { stars: number; comment: string; items?: RateOrderItemInput[] }) =>
      ratingApi.submit(orderNo, input.stars, input.comment, input.items),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['orders', 'rating', orderNo] })
      void cache.invalidateQueries({ queryKey: ['listings'] })
      void cache.invalidateQueries({ queryKey: ['store'] })
    },
  })
}

export function useReturnOrder(orderNo: string) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: (input: ReturnOrderInput) => ratingApi.returnOrder(orderNo, input),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: orderKeys.detail(orderNo) })
      void cache.invalidateQueries({ queryKey: ['orders', 'mine'] })
      void cache.invalidateQueries({ queryKey: ['operator-orders'] })
    },
  })
}

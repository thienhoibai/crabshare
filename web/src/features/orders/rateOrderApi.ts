import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { orderKeys } from './orderTrackingApi'

export interface Rating {
  ratingId: number
  orderNo: string
  stars: number
  comment: string | null
  createdAt: string
}

export interface OrderRatingView {
  canRate: boolean
  rating: Rating | null
}

export interface ReturnResult {
  orderNo: string
  status: string
  refundAmount: number
  refundInstructionId: number
}

export const ratingApi = {
  get: (orderNo: string) =>
    http.get<OrderRatingView>(`/api/orders/${encodeURIComponent(orderNo)}/rating`).then((r) => r.data),
  submit: (orderNo: string, stars: number, comment: string) =>
    http.post<Rating>(`/api/orders/${encodeURIComponent(orderNo)}/rating`, {
      stars,
      comment: comment.trim() === '' ? null : comment.trim(),
    }).then((r) => r.data),
  returnOrder: (orderNo: string, reason: string) =>
    http.post<ReturnResult>(`/api/orders/${encodeURIComponent(orderNo)}/return`, { reason: reason.trim() }).then((r) => r.data),
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
    mutationFn: (input: { stars: number; comment: string }) => ratingApi.submit(orderNo, input.stars, input.comment),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['orders', 'rating', orderNo] })
      void cache.invalidateQueries({ queryKey: ['listings'] })
    },
  })
}

export function useReturnOrder(orderNo: string) {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: (reason: string) => ratingApi.returnOrder(orderNo, reason),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: orderKeys.detail(orderNo) })
      void cache.invalidateQueries({ queryKey: ['orders', 'mine'] })
    },
  })
}

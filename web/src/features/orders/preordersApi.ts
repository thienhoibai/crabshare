import { useMutation, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { http } from '../../shared/api/http'
import type { OrderPayment, PlacedOrderLine } from './ordersApi'

export interface PlacePreorderInput {
  listingId: number
  quantityKg: number
  addressId: number
}

export interface PlacedPreorder {
  orderNo: string
  batchCode: string
  farmName: string
  status: string
  totalAmount: number
  depositAmount: number
  depositPct: number
  expiresAt: string
  lines: PlacedOrderLine[]
  payment: OrderPayment
}

export const preordersApi = {
  place: (req: PlacePreorderInput) => http.post<PlacedPreorder>('/api/preorders', req).then((r) => r.data),
}

export function usePlacePreorder() {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: preordersApi.place,
    onSettled: () => cache.invalidateQueries({ queryKey: ['store'] }),
  })
}

interface LastPreorderStore {
  userId: number | null
  result: PlacedPreorder | null
  save: (userId: number, result: PlacedPreorder) => void
}

export const useLastPreorder = create<LastPreorderStore>()(
  persist(
    (set) => ({ userId: null, result: null, save: (userId, result) => set({ userId, result }) }),
    { name: 'crabshare-last-preorder' },
  ),
)

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { http } from '../../shared/api/http'
import type { CartLine } from '../../shared/ui/kit/kit'

/** Gọi API đặt hàng của Features/Orders (UC26, TL-28). */
export interface CheckoutLineInput { listingId: number; quantityKg: number }
export interface CheckoutRequest { lines: CheckoutLineInput[]; addressId: number }

export interface PlacedOrderLine { listingId: number; title: string; quantityKg: number; unitPrice: number; amount: number }
export interface OrderPayment { referenceCode: string; accountNo: string; amount: number; qrContent: string; expiresAt: string }
export interface PlacedOrder {
  orderNo: string
  batchCode: string
  farmName: string
  /** Vừa đặt luôn là PendingPayment; sang Paid khi webhook thanh toán báo về (TH-06). */
  status: string
  totalAmount: number
  expiresAt: string
  lines: PlacedOrderLine[]
  payment: OrderPayment
}
export interface CheckoutResponse { orders: PlacedOrder[] }

export const ordersApi = {
  checkout: (req: CheckoutRequest) => http.post<CheckoutResponse>('/api/orders/checkout', req).then((r) => r.data),
}

/** Dòng giỏ đặt được: chỉ hàng lấy từ API cửa hàng (có listingId), không tính sản phẩm minh hoạ. */
export const orderableLines = (lines: CartLine[]) => lines.filter((l) => l.item?.listingId !== undefined && l.qty > 0)

export const toCheckoutLines = (lines: CartLine[]): CheckoutLineInput[] =>
  orderableLines(lines).map((l) => ({ listingId: l.item!.listingId!, quantityKg: l.qty }))

export function useCheckout() {
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: ordersApi.checkout,
    // Tồn khả dụng ở cửa hàng đổi dù đặt thành công hay hết hàng (409): tải lại danh sách.
    onSettled: () => cache.invalidateQueries({ queryKey: ['store'] }),
  })
}

interface LastCheckoutStore {
  userId: number | null
  result: CheckoutResponse | null
  save: (userId: number, result: CheckoutResponse) => void
}

/**
 * Kết quả lần đặt gần nhất, để trang xác nhận còn hiện mã QR khi tải lại trang.
 * Khi có API xem đơn (NH-07) thì trang xác nhận đọc từ API thay cho bản lưu này.
 */
export const useLastCheckout = create<LastCheckoutStore>()(
  persist(
    (set) => ({ userId: null, result: null, save: (userId, result) => set({ userId, result }) }),
    { name: 'crabshare-last-checkout' },
  ),
)

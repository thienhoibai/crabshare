import { useQuery } from '@tanstack/react-query'
import { http } from '../api/http'

/* Yêu cầu chuyển khoản VietQR dùng chung cho góp vốn, đơn hàng, cọc (Features/Payments, TH-05). Tiền là số nguyên đồng. */

export type PaymentStatus = 'Pending' | 'Paid' | 'Expired' | 'Cancelled'

export interface PaymentRequest {
  paymentRequestId: number
  /** Contribution, OrderPayment, PreOrderDeposit, PreOrderBalance, OfftakeDeposit, OfftakePayment */
  purpose: string
  status: PaymentStatus
  batchCode: string
  /** Mã đối chiếu ≤ 13 ký tự, nằm trong nội dung chuyển khoản. */
  referenceCode: string
  amount: number
  /** Chuỗi nội dung QR; chỉ có khi còn chờ thanh toán. */
  qrContent: string | null
  expiresAt: string
  providerName: string
  accountNo: string
}

export const paymentKeys = {
  request: (id: number) => ['payments', 'request', id] as const,
}

/** Khi còn chờ thanh toán thì hỏi lại 5 giây một lần: webhook ngân hàng (TH-06) đổi sang Paid là màn hình biết ngay. */
export function usePaymentRequest(id: number | null) {
  return useQuery({
    queryKey: paymentKeys.request(id ?? 0),
    queryFn: async () => (await http.get<PaymentRequest>(`/api/payment-requests/${id}`)).data,
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.status === 'Pending' ? 5_000 : false),
  })
}

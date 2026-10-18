import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

/** Kết quả webhook TH-06: Matched (đã khớp) · LatePayment (trả trễ, sẽ hoàn) · Unmatched (chờ đối soát) · Duplicate (đã xử lý). */
export interface WebhookResult {
  outcome: 'Matched' | 'LatePayment' | 'Unmatched' | 'Duplicate'
  transactionId: number | null
  referenceCode: string | null
  paymentRequestId: number | null
  purpose: string | null
  refundInstructionId: number | null
}

export const paymentKeys = {
  request: (id: number) => ['payments', 'request', id] as const,
}

/** Khi còn chờ thanh toán thì hỏi lại 3 giây một lần: webhook ngân hàng (TH-06) đổi sang Paid là màn hình biết ngay. */
export function usePaymentRequest(id: number | null) {
  return useQuery({
    queryKey: paymentKeys.request(id ?? 0),
    queryFn: async () => (await http.get<PaymentRequest>(`/api/payment-requests/${id}`)).data,
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.status === 'Pending' ? 3_000 : false),
  })
}

/**
 * Giả lập "khách đã chuyển khoản" khi chạy dev (TH-06): backend đi đúng luồng webhook, không đi tắt đổi trạng thái.
 * Chỉ Development mới có endpoint này (ngoài dev trả 404).
 */
export function useSimulatePayment() {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async ({ referenceCode }: { paymentRequestId: number; referenceCode: string }) =>
      (await http.post<WebhookResult>('/api/dev/payments/simulate', { referenceCode })).data,
    onSuccess: (_result, { paymentRequestId }) => {
      void queryClient.invalidateQueries({ queryKey: paymentKeys.request(paymentRequestId) })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

/* Khung chuyển khoản VietQR của cổng khách hàng: tiền cọc đặt trước và phần còn lại sau nghiệm thu.
   Hỏi lại GET /api/payment-requests/{id} 3 giây một lần khi còn chờ; tiền về thì tải lại mọi dữ liệu và gọi onPaid. */
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePaymentRequest, type PaymentStatus } from '../../shared/payments/paymentsApi'
import { SimulatePaymentButton } from '../../shared/payments/SimulatePaymentButton'
import { VietQrBox, type VietQrInfo } from '../../shared/payments/VietQrBox'

export interface PayStart extends VietQrInfo {
  paymentRequestId: number
  status: string
}

export function PayBox({ start, onPaid }: { start: PayStart; onPaid?: () => void }) {
  const queryClient = useQueryClient()
  const live = usePaymentRequest(start.paymentRequestId)
  const payment: VietQrInfo = live.data ?? start
  const status = (live.data?.status ?? start.status) as PaymentStatus
  const told = useRef(false)

  useEffect(() => {
    if (status !== 'Paid' || told.current) return
    told.current = true
    void queryClient.invalidateQueries()
    onPaid?.()
  }, [status, queryClient, onPaid])

  return (
    <div className="op-stack" style={{ gap: 10 }}>
      <VietQrBox payment={payment} status={status} onExpire={() => void queryClient.invalidateQueries()} />
      {status === 'Pending' && <SimulatePaymentButton payment={{ paymentRequestId: start.paymentRequestId, referenceCode: payment.referenceCode }} />}
    </div>
  )
}

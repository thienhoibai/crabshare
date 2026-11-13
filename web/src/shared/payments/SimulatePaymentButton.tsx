/* Nút "Giả lập đã chuyển khoản" (TH-06): công cụ demo (shared/demoTools.ts), gọi POST /api/dev/payments/simulate
   để backend đi đúng luồng webhook như ngân hàng báo có. Bản build không bật công cụ demo thì không render gì. */
import { FlaskConical } from 'lucide-react'
import { errorMessage } from '../api/http'
import { demoTools } from '../demoTools'
import { useSimulatePayment, type PaymentRequest } from './paymentsApi'
import './vietqr.css'

export function SimulatePaymentButton({ payment }: { payment: Pick<PaymentRequest, 'paymentRequestId' | 'referenceCode'> }) {
  const simulate = useSimulatePayment()
  if (!demoTools) return null
  return (
    <>
      <button type="button" className="rd-btn rd-btn--ghost rd-btn--sm vq-sim" disabled={simulate.isPending}
        title="Công cụ demo: giả lập ngân hàng báo có đúng số tiền cho mã này"
        onClick={() => simulate.mutate({ paymentRequestId: payment.paymentRequestId, referenceCode: payment.referenceCode })}>
        <FlaskConical size={14} /> {simulate.isPending ? 'Đang giả lập…' : 'Giả lập đã chuyển khoản'}
      </button>
      {simulate.isError && <p className="vq-sim__error">{errorMessage(simulate.error)}</p>}
    </>
  )
}

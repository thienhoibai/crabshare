/* Bước 4 của luồng góp vốn (UC12): mã VietQR cho khoản đang giữ chỗ, chờ ngân hàng báo có, huỷ giữ chỗ.
   POST /api/contributions/{id}/payment-requests (gọi lại khi mã còn hạn thì nhận đúng mã cũ), GET /api/payment-requests/{id} hỏi lại 3 giây một lần,
   DELETE /api/contributions/{id}. Khoản góp chỉ được xác nhận theo thông báo của trung gian thanh toán, không theo việc người dùng bấm nút. */
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ContributionResponse, PaymentRequestResponse } from '../../../shared/api/api.gen'
import { usePaymentRequest } from '../../../shared/payments/paymentsApi'
import { SimulatePaymentButton } from '../../../shared/payments/SimulatePaymentButton'
import { VietQrBox } from '../../../shared/payments/VietQrBox'
import { OpBtn, OpConfirm, OpLoading, OpMore, OpNote, OpPanel, errorMessage, formatVnd, toast, useSend } from '../../../shared/ui/console'

export function PaymentStep({ reservation, paymentId, onPayment, onExpire, onPaid, onContract, onReserveAgain }: {
  reservation: ContributionResponse | null
  paymentId: number | null
  onPayment: (paymentRequestId: number | null) => void
  onExpire: () => void
  onPaid: () => void
  onContract: () => void
  onReserveAgain: () => void
}) {
  const queryClient = useQueryClient()
  const contributionId = reservation?.contributionId ?? null
  const [cancelling, setCancelling] = useState(false)
  const create = useSend<PaymentRequestResponse>('post', `/api/contributions/${contributionId ?? 0}/payment-requests`, {
    quietError: true,
    onSuccess: (p) => onPayment(p.paymentRequestId),
  })
  const cancel = useSend('delete', `/api/contributions/${contributionId ?? 0}`, {
    success: 'Đã huỷ giữ chỗ.',
    quietError: true,
    onSuccess: () => { setCancelling(false); onPayment(null) },
  })
  const payment = usePaymentRequest(paymentId)
  const status = payment.data?.status

  // Vào bước là lấy mã ngay. Nhớ đã gọi cho khoản góp nào vì StrictMode chạy effect hai lần.
  const asked = useRef<number | null>(null)
  const { mutate } = create
  useEffect(() => {
    if (contributionId === null || paymentId !== null || asked.current === contributionId) return
    asked.current = contributionId
    mutate()
  }, [contributionId, paymentId, mutate])

  // Ngân hàng báo tiền về: tải lại số liệu rồi chuyển sang bước hợp đồng.
  const told = useRef(false)
  useEffect(() => {
    if (status !== 'Paid' || told.current) return
    told.current = true
    toast('Đã nhận tiền. Khoản góp đã được xác nhận.')
    void queryClient.invalidateQueries()
    onPaid()
    // onPaid đổi theo mỗi lần vẽ; chỉ cần chạy khi trạng thái đổi sang Paid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, queryClient])

  const lapsed = status === 'Expired' || status === 'Cancelled' || (reservation === null && status !== 'Paid' && status !== 'Pending')

  return (
    <OpPanel title="Chuyển khoản" subtitle="Quét mã bằng ứng dụng ngân hàng. Trang tự cập nhật khi tiền về tài khoản của Lô, không cần gửi biên lai.">
      {payment.data ? (
        <VietQrBox payment={payment.data} status={payment.data.status} onExpire={onExpire} />
      ) : create.isError ? (
        <OpNote tone="danger">{errorMessage(create.error)}</OpNote>
      ) : reservation === null ? (
        <OpNote tone="danger">Đã hết thời gian giữ chỗ.</OpNote>
      ) : (
        <OpLoading label="Đang tạo mã…" />
      )}

      {(lapsed || status === 'Paid') && (
        <div className="op-formfoot">
          {lapsed ? <OpBtn onClick={onReserveAgain}>Giữ chỗ lại</OpBtn> : <OpBtn onClick={onContract}>Tiếp tục: hợp đồng</OpBtn>}
        </div>
      )}
      {payment.data?.status === 'Pending' && <div className="op-formfoot"><SimulatePaymentButton payment={payment.data} /></div>}

      {!lapsed && status !== 'Paid' && reservation && (
        <OpMore label="Tuỳ chọn khác">
          <div className="op-inline">
            <OpBtn variant="ghost" sm onClick={onContract}>Lập hợp đồng trước</OpBtn>
            <OpBtn variant="ghost" sm onClick={() => { cancel.reset(); setCancelling(true) }}>Huỷ giữ chỗ</OpBtn>
          </div>
        </OpMore>
      )}

      {cancelling && reservation && (
        <OpConfirm
          title="Huỷ giữ chỗ"
          sub={`${formatVnd(reservation.amount)} ở Lô ${reservation.batchCode}`}
          confirmLabel="Huỷ giữ chỗ"
          variant="danger"
          pending={cancel.isPending}
          error={cancel.error}
          onConfirm={() => cancel.mutate()}
          onClose={() => setCancelling(false)}
        >
          <p className="rd-muted">Mã chuyển khoản và hợp đồng chưa đủ chữ ký của khoản này bị huỷ. Đừng chuyển tiền theo mã cũ.</p>
        </OpConfirm>
      )}
    </OpPanel>
  )
}

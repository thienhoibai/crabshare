/* UC26 — Xác nhận đơn: mỗi lô một đơn, mỗi đơn một yêu cầu chuyển khoản VietQR vào tài khoản của lô (BR-67, TL-29).
   Mã QR hết hạn cùng lúc hết giữ hàng (BR-59). Trạng thái "đã thanh toán" cập nhật khi có webhook (TH-06):
   usePaymentRequest hỏi lại 3 giây/lần khi còn chờ, chip và khung QR đổi ngay khi tiền về. */
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { Landmark, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import { usePaymentRequest, type PaymentStatus } from '../../shared/payments/paymentsApi'
import { SimulatePaymentButton } from '../../shared/payments/SimulatePaymentButton'
import { VietQrBox } from '../../shared/payments/VietQrBox'
import { vnd } from '../../shared/ui/kit/mock-data'
import { Shell, TopBar } from '../../shared/ui/kit/kit'
import { formatKg } from '../store/storeApi'
import { useLastCheckout, type PlacedOrder } from './ordersApi'
import './checkout.css'

const STATUS_LABELS: Record<PaymentStatus, string> = {
  Pending: 'Chờ chuyển khoản',
  Paid: 'Đã thanh toán',
  Expired: 'Hết hạn',
  Cancelled: 'Đã huỷ',
}
const STATUS_TONES: Record<PaymentStatus, string> = {
  Pending: 'var(--accent)',
  Paid: 'var(--ok)',
  Expired: 'var(--muted)',
  Cancelled: 'var(--muted)',
}

/** Trạng thái đơn lúc đặt (PendingPayment) đổi sang trạng thái khoản thu khi chưa có câu trả lời từ API. */
const initialStatus = (orderStatus: string): PaymentStatus => {
  switch (orderStatus) {
    case 'Paid': return 'Paid'
    case 'Cancelled': return 'Cancelled'
    default: return 'Pending'
  }
}

function OrderCard({ order }: { order: PlacedOrder }) {
  // Bản lưu từ trước CS-43 không có paymentRequestId: vẫn hiện mã QR, chỉ không hỏi lại được trạng thái
  const live = usePaymentRequest(order.payment.paymentRequestId ?? null)
  const status: PaymentStatus = live.data?.status ?? initialStatus(order.status)
  return (
    <article className="co-card co-order" aria-label={`Đơn ${order.orderNo}`}>
      <header className="co-card__head">
        <div>
          <p className="rd-eyebrow">Lô {order.batchCode} · {order.farmName}</p>
          <h2 className="rd-h3">Đơn {order.orderNo}</h2>
        </div>
        <span className="rd-chip" style={{ '--tone': STATUS_TONES[status] } as CSSProperties}><i />{STATUS_LABELS[status]}</span>
      </header>
      <ul className="co-order__lines">
        {order.lines.map((l) => (
          <li key={l.listingId}>
            <span>{l.title}<small>{formatKg(l.quantityKg)} kg × {vnd(l.unitPrice)}</small></span>
            <b>{vnd(l.amount)}</b>
          </li>
        ))}
      </ul>
      <dl className="rd-sum"><dt className="rd-sum__total">Tổng đơn</dt><dd className="rd-sum__total">{vnd(order.totalAmount)}</dd></dl>
      <VietQrBox payment={{ ...order.payment, batchCode: order.batchCode }} status={status} />
      {status === 'Pending' && order.payment.paymentRequestId != null && (
        <footer className="co-order__actions">
          {/* Chỉ dev: giả lập ngân hàng báo có, đi đúng luồng webhook TH-06; chip đổi "Đã thanh toán" ở lần hỏi lại kế tiếp */}
          <SimulatePaymentButton payment={{ paymentRequestId: order.payment.paymentRequestId, referenceCode: order.payment.referenceCode }} />
        </footer>
      )}
    </article>
  )
}

export default function OrderConfirmationPage() {
  const userId = useAuthStore((s) => s.user?.userId)
  const result = useLastCheckout((s) => (s.userId === userId ? s.result : null))
  const orders = result?.orders ?? []
  return (
    <Shell theme="light">
      <TopBar area="store" right={<Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/cua-hang">Về cửa hàng</Link>} />
      <main className="co">
        {orders.length === 0 ? (
          <section className="co-card rd-empty">
            <p>Chưa có đơn nào vừa đặt.</p>
            <Link className="rd-btn rd-btn--primary" to="/cua-hang">Xem hàng đang bán</Link>
          </section>
        ) : (
          <>
            <header className="co-head">
              <p className="rd-eyebrow">Đặt hàng thành công</p>
              <h1 className="rd-h2">{orders.length > 1 ? `Đã tạo ${orders.length} đơn, mỗi lô một đơn` : 'Đơn của bạn đã được tạo'}</h1>
              <p className="rd-muted">Chuyển khoản từng đơn theo đúng số tiền và nội dung bên dưới. Tiền vào thẳng tài khoản riêng của lô, CrabShare không giữ tiền. Trang tự cập nhật khi tiền về.</p>
            </header>
            <div className="co-orders">{orders.map((o) => <OrderCard key={o.orderNo} order={o} />)}</div>
            <p className="rd-note co-foot"><Landmark size={14} /> Mỗi đơn chuyển khoản riêng và ghi đúng nội dung, để hệ thống đối chiếu được khoản tiền với đơn.</p>
            <p className="rd-note co-foot"><ShieldCheck size={14} /> Bạn có 2 giờ sau khi nhận hàng để báo lỗi.</p>
          </>
        )}
      </main>
    </Shell>
  )
}

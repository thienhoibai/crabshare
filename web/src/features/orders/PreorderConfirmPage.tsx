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
import { useLastPreorder, type PlacedPreorder } from './preordersApi'
import './checkout.css'

const STATUS_LABELS: Record<PaymentStatus, string> = {
  Pending: 'Chờ chuyển cọc',
  Paid: 'Đã cọc',
  Expired: 'Hết hạn',
  Cancelled: 'Đã huỷ',
}
const STATUS_TONES: Record<PaymentStatus, string> = {
  Pending: 'var(--accent)',
  Paid: 'var(--ok)',
  Expired: 'var(--muted)',
  Cancelled: 'var(--muted)',
}

function Card({ order }: { order: PlacedPreorder }) {
  const live = usePaymentRequest(order.payment.paymentRequestId ?? null)
  const status: PaymentStatus = live.data?.status ?? (order.status === 'DepositPaid' || order.status === 'Paid' ? 'Paid' : 'Pending')
  return (
    <article className="co-card co-order" aria-label={`Đơn đặt trước ${order.orderNo}`}>
      <header className="co-card__head">
        <div>
          <p className="rd-eyebrow">Đặt trước · lô {order.batchCode} · {order.farmName}</p>
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
      <dl className="rd-sum">
        <dt>Giá trị đơn</dt><dd>{vnd(order.totalAmount)}</dd>
        <dt className="rd-sum__total">Cọc phải chuyển</dt><dd className="rd-sum__total">{vnd(order.depositAmount)}</dd>
      </dl>
      <VietQrBox payment={{ ...order.payment, batchCode: order.batchCode }} status={status} />
      <footer className="co-order__actions">
        {status === 'Pending' && order.payment.paymentRequestId != null && (
          <SimulatePaymentButton payment={{ paymentRequestId: order.payment.paymentRequestId, referenceCode: order.payment.referenceCode }} />
        )}
        <Link className="rd-btn rd-btn--ghost rd-btn--sm" to={`/theo-doi-don-hang/${order.orderNo}`}>Theo dõi đơn</Link>
      </footer>
    </article>
  )
}

export default function PreorderConfirmPage() {
  const userId = useAuthStore((s) => s.user?.userId)
  const result = useLastPreorder((s) => (s.userId === userId ? s.result : null))
  return (
    <Shell theme="light">
      <TopBar area="store" right={<Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/cua-hang">Về cửa hàng</Link>} />
      <main className="co">
        {!result ? (
          <section className="co-card rd-empty">
            <p>Chưa có đơn đặt trước nào vừa tạo.</p>
            <Link className="rd-btn rd-btn--primary" to="/cua-hang">Về cửa hàng</Link>
          </section>
        ) : (
          <>
            <header className="co-head">
              <p className="rd-eyebrow">Đặt trước thành công</p>
              <h1 className="rd-h2">Chuyển khoản đúng số cọc</h1>
              <p className="rd-muted">Nội dung phải khớp mã bắt đầu bằng DC. Không chuyển đủ giá trị đơn ở bước này.</p>
            </header>
            <Card order={result} />
            <p className="rd-note co-foot"><Landmark size={14} /> Cọc vào tài khoản lô, chưa tính doanh thu.</p>
            <p className="rd-note co-foot"><ShieldCheck size={14} /> Phần còn lại được thu khi lô thu hoạch.</p>
          </>
        )}
      </main>
    </Shell>
  )
}

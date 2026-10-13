/* UC26 — Xác nhận đơn: mỗi lô một đơn, mỗi đơn một yêu cầu chuyển khoản VietQR vào tài khoản của lô (BR-67, TL-29).
   Mã QR hết hạn cùng lúc hết giữ hàng (BR-59). Trạng thái "đã thanh toán" cập nhật khi có webhook (TH-06). */
import { useState } from 'react'
import { Link } from 'react-router'
import { Check, Clock, Copy, Landmark, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import { vnd } from '../../shared/ui/kit/mock-data'
import { QrMock, Shell, TopBar, useCountdown } from '../../shared/ui/kit/kit'
import { formatKg } from '../store/storeApi'
import { useLastCheckout, type PlacedOrder } from './ordersApi'
import './checkout.css'

const STATUS_LABELS: Record<string, string> = {
  PendingPayment: 'Chờ chuyển khoản',
  Paid: 'Đã thanh toán',
  Expired: 'Hết hạn',
  Cancelled: 'Đã huỷ',
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <>
      <dt>{label}</dt>
      <dd className="co-copy">
        <b>{value}</b>
        <button type="button" className="rd-iconbtn" onClick={copy} aria-label={`Sao chép ${label.toLowerCase()}`}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </dd>
    </>
  )
}

/** Khung chuyển khoản tạm thời; thay bằng <VietQrBox> khi TH-05 xong. */
function PaymentBox({ order }: { order: PlacedOrder }) {
  const until = Date.parse(order.payment.expiresAt)
  const cd = useCountdown(until)
  const expired = cd.left <= 0
  return (
    <div className="co-pay">
      <div className="co-pay__qr" title={order.payment.qrContent}><QrMock size={168} /></div>
      <div className="co-pay__info">
        <dl className="co-pay__list">
          <CopyValue label="Số tài khoản lô" value={order.payment.accountNo} />
          <dt>Số tiền</dt><dd><b>{vnd(order.payment.amount)}</b></dd>
          <CopyValue label="Nội dung chuyển khoản" value={order.payment.referenceCode} />
        </dl>
        {expired
          ? <p className="co-error" role="alert"><Clock size={14} /> Đã hết 15 phút giữ hàng. Đừng chuyển khoản cho đơn này nữa; hãy đặt lại nếu vẫn muốn mua.</p>
          : <p className="co-timer" role="timer" aria-live="off"><Clock size={14} /> Còn <b>{cd.text}</b> để chuyển khoản</p>}
      </div>
    </div>
  )
}

function OrderCard({ order }: { order: PlacedOrder }) {
  return (
    <article className="co-card co-order" aria-label={`Đơn ${order.orderNo}`}>
      <header className="co-card__head">
        <div>
          <p className="rd-eyebrow">Lô {order.batchCode} · {order.farmName}</p>
          <h2 className="rd-h3">Đơn {order.orderNo}</h2>
        </div>
        <span className="rd-chip">{STATUS_LABELS[order.status] ?? order.status}</span>
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
      {order.status === 'PendingPayment' && <PaymentBox order={order} />}
      <Link className="rd-btn rd-btn--ghost rd-btn--sm" to={`/theo-doi-don-hang/${order.orderNo}`}>Theo dõi đơn</Link>
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
            <Link className="rd-btn rd-btn--ghost" to="/lich-su-don-hang">Lịch sử đơn hàng</Link>
          </section>
        ) : (
          <>
            <header className="co-head">
              <p className="rd-eyebrow">Đặt hàng thành công</p>
              <h1 className="rd-h2">{orders.length > 1 ? `Đã tạo ${orders.length} đơn, mỗi lô một đơn` : 'Đơn của bạn đã được tạo'}</h1>
              <p className="rd-muted">Chuyển khoản từng đơn theo đúng số tiền và nội dung bên dưới. Tiền vào thẳng tài khoản riêng của lô, CrabShare không giữ tiền.</p>
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

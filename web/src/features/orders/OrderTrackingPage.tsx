/* UC28 + UC30 — Theo dõi một đơn: dòng thời gian, hàng, khoản thu, huỷ khi chưa đóng gói (NH-07), giao hàng và xác nhận đã nhận (NH-10). */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { MapPin, PackageCheck, PackageSearch, Phone, Truck, Video } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import { vnd } from '../../shared/ui/kit/mock-data'
import { Shell, TopBar } from '../../shared/ui/kit/kit'
import { formatKg } from '../store/storeApi'
import {
  ORDER_STATUS_LABELS, TIMELINE_LABELS, statusTone, useCancelOrder, useConfirmReceipt, useOrderTracking,
  type OrderShipment, type OrderTimelineStep, type OrderTracking,
} from './orderTrackingApi'
import './checkout.css'

function Lookup() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const go = (e: FormEvent) => {
    e.preventDefault()
    const orderNo = value.trim().toUpperCase()
    if (orderNo) navigate(`/theo-doi-don-hang/${orderNo}`)
  }
  return (
    <section className="co-card">
      <h2 className="rd-h3">Nhập mã đơn</h2>
      <p className="rd-muted">Mã bắt đầu bằng OD, in trên trang xác nhận và lịch sử đơn.</p>
      <form className="ot-lookup" onSubmit={go}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="VD: OD7K2M9QX4R1T" aria-label="Mã đơn hàng" autoCapitalize="characters" />
        <button type="submit" className="rd-btn rd-btn--primary" disabled={!value.trim()}>Theo dõi</button>
      </form>
      <p className="rd-muted">Hoặc mở <Link to="/lich-su-don-hang">lịch sử đơn hàng</Link> rồi chọn đơn.</p>
    </section>
  )
}

function Timeline({ steps }: { steps: OrderTimelineStep[] }) {
  const current = steps.map((s) => s.done).lastIndexOf(true)
  return (
    <ol className="ot-timeline" style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => (
        <li key={s.step} className={`${s.done ? 'is-done' : ''} ${i === current ? 'is-current' : ''}`}>
          <b aria-hidden="true" />
          <strong>{TIMELINE_LABELS[s.step] ?? s.step}</strong>
          <span>{s.at ? formatDateTime(s.at) : s.done ? 'Đã xong' : 'Chưa tới'}</span>
        </li>
      ))}
    </ol>
  )
}

function CancelBox({ order }: { order: OrderTracking }) {
  const cancel = useCancelOrder(order.orderNo)
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = reason.trim()
    if (!text || cancel.isPending) return
    cancel.mutate(text)
  }
  if (cancel.isSuccess) {
    return (
      <p role="status" className="rd-note">
        Đã huỷ đơn{cancel.data.refundInstructionId ? '. Lệnh hoàn tiền đã được lập, bộ phận tài chính sẽ gửi.' : ' và trả lại hàng đang giữ.'}
      </p>
    )
  }
  if (!open) {
    return <button type="button" className="rd-btn rd-btn--ghost" onClick={() => setOpen(true)}>Huỷ đơn</button>
  }
  return (
    <form className="ot-cancel" onSubmit={submit}>
      <label>
        Lý do huỷ
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required rows={3}
          placeholder="Ví dụ: đặt nhầm, không còn nhu cầu…" />
      </label>
      {cancel.isError && <p className="co-error" role="alert">{errorMessage(cancel.error)}</p>}
      <div className="ot-cancel__actions">
        <button type="button" className="rd-btn rd-btn--ghost" disabled={cancel.isPending} onClick={() => setOpen(false)}>Đóng</button>
        <button type="submit" className="rd-btn rd-btn--primary" disabled={cancel.isPending || !reason.trim()}>
          {cancel.isPending ? 'Đang huỷ…' : 'Xác nhận huỷ'}
        </button>
      </div>
    </form>
  )
}

function ShipmentBox({ shipment }: { shipment: OrderShipment }) {
  return (
    <section className="ot-ship" aria-label="Thông tin giao hàng">
      <h3 className="rd-h3">Giao hàng</h3>
      <p className="rd-muted">Hộ nuôi gửi hàng qua nhà xe. Nền tảng không thu phí vận chuyển.</p>
      <div className="ot-meta">
        {shipment.carrierName && (
          <p><Truck size={14} /><span>Nhà xe</span><b>{shipment.carrierName}{shipment.vehiclePlate ? ` · ${shipment.vehiclePlate}` : ''}</b></p>
        )}
        {shipment.driverPhone && (
          <p><Phone size={14} /><span>Tài xế</span><b><a href={`tel:${shipment.driverPhone}`}>{shipment.driverPhone}</a></b></p>
        )}
        {shipment.expectedArrivalAt && !shipment.deliveredAt && (
          <p><span /><span>Dự kiến đến</span><b>{formatDateTime(shipment.expectedArrivalAt)}</b></p>
        )}
        {shipment.note && <p><span /><span>Ghi chú</span><b>{shipment.note}</b></p>}
        {shipment.shippedAt && <p><span /><span>Gửi lúc</span><b>{formatDateTime(shipment.shippedAt)}</b></p>}
        {shipment.receivedAt && <p><PackageCheck size={14} /><span>Bạn nhận lúc</span><b>{formatDateTime(shipment.receivedAt)}</b></p>}
        {shipment.returnWindowEndsAt && !shipment.completedAt && (
          <p><span /><span>Hạn báo lỗi</span><b>{formatDateTime(shipment.returnWindowEndsAt)} — sau mốc này đơn tự hoàn tất</b></p>
        )}
      </div>
    </section>
  )
}

function ReceiveBox({ order }: { order: OrderTracking }) {
  const receive = useConfirmReceipt(order.orderNo)
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <div className="ot-receive">
        <p className="rd-note"><Video size={14} /> Khi nhận hàng, hãy quay video lúc mở thùng (trong vòng 2 giờ) để làm bằng chứng nếu cua có vấn đề.</p>
        <button type="button" className="rd-btn rd-btn--primary" onClick={() => setOpen(true)}>Đã nhận hàng</button>
      </div>
    )
  }
  return (
    <div className="ot-receive" role="group" aria-label="Xác nhận đã nhận hàng">
      <p>Bạn xác nhận đã nhận đủ hàng của đơn {order.orderNo}?</p>
      {receive.isError && <p className="co-error" role="alert">{errorMessage(receive.error)}</p>}
      <div className="ot-cancel__actions">
        <button type="button" className="rd-btn rd-btn--ghost" disabled={receive.isPending} onClick={() => setOpen(false)}>Chưa</button>
        <button type="button" className="rd-btn rd-btn--primary" disabled={receive.isPending} onClick={() => receive.mutate()}>
          {receive.isPending ? 'Đang xác nhận…' : 'Xác nhận đã nhận'}
        </button>
      </div>
    </div>
  )
}

function Detail({ orderNo }: { orderNo: string }) {
  const query = useOrderTracking(orderNo)
  if (query.isPending) return <p role="status" className="rd-muted">Đang tải đơn {orderNo}…</p>
  if (query.isError) {
    return (
      <section className="co-card rd-empty">
        <PackageSearch size={32} />
        <p role="alert">{errorMessage(query.error)}</p>
        <Link className="rd-btn rd-btn--ghost" to="/lich-su-don-hang">Về lịch sử đơn</Link>
      </section>
    )
  }
  const order = query.data
  return (
    <article className="co-card ot-detail" aria-label={`Đơn ${order.orderNo}`}>
      <header className="co-card__head">
        <div>
          <p className="rd-eyebrow">Lô {order.batchCode} · {order.farmName}</p>
          <h2 className="rd-h3">Đơn {order.orderNo}</h2>
          <p className="rd-muted">Đặt lúc {formatDateTime(order.placedAt)}</p>
        </div>
        <span className={`rd-chip ot-status ot-status--${statusTone(order.status)}`}>
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </span>
      </header>

      <Timeline steps={order.timeline} />

      <ul className="co-order__lines">
        {order.lines.map((l) => (
          <li key={l.listingId}>
            <span>{l.title}<small>{l.gradeName} · {formatKg(l.quantityKg)} kg × {vnd(l.unitPrice)}</small></span>
            <b>{vnd(l.amount)}</b>
          </li>
        ))}
      </ul>
      <dl className="rd-sum"><dt className="rd-sum__total">Tổng đơn</dt><dd className="rd-sum__total">{vnd(order.totalAmount)}</dd></dl>

      <div className="ot-meta">
        <p><MapPin size={14} /><span>Giao đến</span><b>{order.recipientName} · {order.recipientPhone}<br />{order.shippingAddress}</b></p>
        {order.payment && (
          <p><Truck size={14} /><span>Thanh toán</span>
            <b>{ORDER_STATUS_LABELS[order.payment.status] ?? order.payment.status} · {order.payment.referenceCode} · {vnd(order.payment.amount)}</b>
          </p>
        )}
        {order.cancelReason && <p><span>Lý do huỷ</span><b>{order.cancelReason}</b></p>}
      </div>

      {order.shipment && <ShipmentBox shipment={order.shipment} />}
      {order.canConfirmReceipt && <ReceiveBox order={order} />}
      {order.canCancel && <CancelBox order={order} />}
    </article>
  )
}

export default function OrderTrackingPage() {
  const { orderNo } = useParams()
  const code = orderNo?.trim().toUpperCase()
  return (
    <Shell theme="light">
      <TopBar area="store" right={<Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/lich-su-don-hang">Lịch sử đơn</Link>} />
      <main className="co">
        <header className="co-head">
          <p className="rd-eyebrow">Theo dõi đơn hàng</p>
          <h1 className="rd-h2">{code ? `Đơn ${code}` : 'Theo dõi đơn hàng'}</h1>
        </header>
        {code ? <Detail orderNo={code} /> : <Lookup />}
      </main>
    </Shell>
  )
}

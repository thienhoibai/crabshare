/* UC28 + UC30 — Theo dõi một đơn: dòng thời gian, hàng, khoản thu, huỷ khi chưa đóng gói (NH-07), giao hàng và xác nhận đã nhận (NH-10). */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AlertTriangle, ExternalLink, Image as ImageIcon, MapPin, MessageSquareWarning, PackageCheck, PackageSearch, Phone, Truck, Video } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { vnd } from '../../shared/ui/kit/mock-data'
import { Shell, TopBar } from '../../shared/ui/kit/kit'
import { formatKg } from '../store/storeApi'
import {
  ORDER_STATUS_LABELS, TIMELINE_LABELS, statusTone, useCancelOrder, useConfirmReceipt, useOrderTracking,
  type OrderShipment, type OrderTimelineStep, type OrderTracking,
} from './orderTrackingApi'
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_TYPE_LABELS,
  useOrderComplaint,
  useSubmitComplaint,
  type ComplaintType,
} from './complaintsApi'
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

function ComplaintSection({ order }: { order: OrderTracking }) {
  const { data: complaint, isLoading, refetch } = useOrderComplaint(order.orderNo)
  const submitComplaint = useSubmitComplaint(order.orderNo)

  const [isOpenForm, setIsOpenForm] = useState(false)
  const [complaintType, setComplaintType] = useState<ComplaintType>('Damaged')
  const [description, setDescription] = useState('')
  const [evidenceUri, setEvidenceUri] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canSubmit = !complaint && (order.status === 'Delivered' || order.status === 'Completed' || order.status === 'Shipping')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (!description.trim()) {
      setErrorMsg('Vui lòng nhập mô tả chi tiết vấn đề.')
      return
    }

    try {
      await submitComplaint.mutateAsync({
        complaintType,
        description: description.trim(),
        evidenceUri: evidenceUri.trim() || null,
      })
      setIsOpenForm(false)
      setDescription('')
      setEvidenceUri('')
      refetch()
    } catch (err: unknown) {
      setErrorMsg(errorMessage(err))
    }
  }

  if (isLoading) return null

  if (complaint) {
    return (
      <section className="ot-ship bg-amber-50/70 border border-amber-200 rounded-xl p-4 mt-4" aria-label="Khiếu nại đơn hàng">
        <div className="flex items-center justify-between mb-3 border-b border-amber-200/80 pb-2">
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="w-5 h-5 text-amber-700" />
            <strong className="text-amber-950 font-bold">Khiếu nại #{complaint.complaintId}</strong>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            {COMPLAINT_STATUS_LABELS[complaint.status] ?? complaint.status}
          </span>
        </div>

        <div className="space-y-2 text-sm text-amber-900">
          <p>
            <strong>Lý do: </strong>{COMPLAINT_TYPE_LABELS[complaint.complaintType] ?? complaint.complaintType}
          </p>
          <div className="bg-white/80 p-3 rounded-lg border border-amber-100">
            <strong>Nội dung phản ánh: </strong>
            <p className="whitespace-pre-line mt-1">{complaint.description}</p>
            {complaint.evidenceUri && (
              <a
                href={complaint.evidenceUri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-700 underline font-semibold mt-2"
              >
                <ImageIcon size={14} /> Xem link hình ảnh/video bằng chứng
                <ExternalLink size={12} />
              </a>
            )}
          </div>

          {complaint.operatorResponse && (
            <div className="bg-blue-50/80 p-3 rounded-lg border border-blue-200 text-blue-950 mt-2">
              <strong className="text-blue-900 block mb-1">Hộ nuôi giải trình:</strong>
              <p className="whitespace-pre-line text-xs">{complaint.operatorResponse}</p>
              {complaint.operatorEvidenceUri && (
                <a
                  href={complaint.operatorEvidenceUri}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-700 underline font-semibold mt-2"
                >
                  <ImageIcon size={14} /> Bằng chứng đối chứng của hộ nuôi
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          {complaint.status === 'Escalated' && !complaint.operatorResponse && (
            <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
              Quá hạn 24 giờ hộ nuôi không phản hồi. Khiếu nại đã được chuyển lên Ban quản trị (Admin) để xử lý hoàn tiền / phân xử.
            </p>
          )}

          {(complaint.status === 'Resolved' || complaint.status === 'Rejected') && (
            <div className={`p-3 rounded-lg text-xs mt-2 border ${
              complaint.status === 'Resolved' ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-slate-100 border-slate-300 text-slate-800'
            }`}>
              <strong className="block mb-1">
                {complaint.status === 'Resolved' ? '✓ Ban quản trị đã giải quyết:' : '✕ Ban quản trị đã bác bỏ khiếu nại:'}
              </strong>
              {complaint.refundAmount !== null && complaint.refundAmount !== undefined && (
                <p>Số tiền hoàn trả: <strong className="text-red-600 font-bold text-sm">{formatVnd(complaint.refundAmount)}</strong></p>
              )}
              {complaint.adminNotes && <p className="italic mt-1">"{complaint.adminNotes}"</p>}
            </div>
          )}
        </div>
      </section>
    )
  }

  if (!canSubmit) return null

  if (!isOpenForm) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Cua có vấn đề khi nhận hàng hoặc giao trễ?
        </p>
        <button
          type="button"
          onClick={() => setIsOpenForm(true)}
          className="rd-btn rd-btn--ghost text-xs font-semibold text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 flex items-center gap-1.5"
        >
          <AlertTriangle size={14} /> Gửi khiếu nại / Báo lỗi
        </button>
      </div>
    )
  }

  return (
    <form className="ot-cancel mt-4 bg-red-50/40 p-4 rounded-xl border border-red-200" onSubmit={handleSubmit}>
      <h3 className="rd-h3 text-red-950 flex items-center gap-2 mb-2">
        <AlertTriangle size={18} className="text-red-600" />
        Gửi khiếu nại đơn hàng {order.orderNo}
      </h3>
      <p className="rd-muted text-xs mb-3">
        UC31: Khiếu nại sẽ được gửi trực tiếp tới hộ nuôi. Hộ nuôi có 24 giờ để phản hồi giải trình trước khi tự động chuyển lên Admin phân xử.
      </p>

      <label className="block mb-2 text-xs font-bold text-slate-700">
        Loại khiếu nại
        <select
          value={complaintType}
          onChange={(e) => setComplaintType(e.target.value as ComplaintType)}
          className="rd-input w-full mt-1"
        >
          <option value="Damaged">Hàng hư hỏng / cua chết / ươn</option>
          <option value="WrongGrade">Sai hạng / sai kích cỡ / trọng lượng</option>
          <option value="LateDelivery">Giao hàng trễ hẹn</option>
          <option value="NotReceived">Chưa nhận được hàng</option>
          <option value="Other">Lý do khác</option>
        </select>
      </label>

      <label className="block mb-2 text-xs font-bold text-slate-700">
        Mô tả chi tiết vấn đề (*)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ví dụ: Khi mở thùng xốp thì 2 con cua đã chết có mùi ươn, dây buộc nặng..."
          rows={3}
          maxLength={1000}
          required
          className="rd-input w-full mt-1"
        />
      </label>

      <label className="block mb-3 text-xs font-bold text-slate-700">
        Link ảnh / video mở thùng làm bằng chứng (Google Drive, Imgur...):
        <input
          type="url"
          value={evidenceUri}
          onChange={(e) => setEvidenceUri(e.target.value)}
          placeholder="https://drive.google.com/..."
          maxLength={400}
          className="rd-input w-full mt-1"
        />
      </label>

      {errorMsg && <p className="co-error text-xs mb-3" role="alert">{errorMsg}</p>}

      <div className="ot-cancel__actions">
        <button
          type="button"
          className="rd-btn rd-btn--ghost text-xs"
          disabled={submitComplaint.isPending}
          onClick={() => { setIsOpenForm(false); setErrorMsg(null); }}
        >
          Đóng
        </button>
        <button
          type="submit"
          className="rd-btn rd-btn--primary text-xs bg-red-600 hover:bg-red-700"
          disabled={submitComplaint.isPending || !description.trim()}
        >
          {submitComplaint.isPending ? 'Đang gửi...' : 'Xác nhận gửi khiếu nại'}
        </button>
      </div>
    </form>
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
      <ComplaintSection order={order} />
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

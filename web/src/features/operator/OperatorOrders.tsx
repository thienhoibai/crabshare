import { type FormEvent, useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, ExternalLink, PackageCheck, RefreshCw, ScanLine, Truck, AlertTriangle, Image as ImageIcon } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import OperatorLayout from './OperatorLayout'
import { OpBack, OpBadge, OpBtn, OpFacts, OpHeading, OpNote, OpPanel, OpRow } from './operatorUi'
import {
  useDeliverOrder,
  useOperatorOrder,
  useOperatorOrders,
  usePackOrder,
  useShipOrder,
  type OperatorOrderDetail,
  type OperatorOrderStatus,
  type OperatorOrderSummary,
} from './operatorOrdersApi'
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_TYPE_LABELS,
  useOrderComplaint,
  useRespondComplaint,
} from '../orders/complaintsApi'

const kg = (n: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n)} kg`

function statusTone(status: string): 'ok' | 'warn' | 'mute' {
  if (status === 'Paid' || status === 'Shipping') return 'warn'
  if (status === 'Packed' || status === 'Delivered' || status === 'Completed') return 'ok'
  return 'mute'
}

const STATUS_LABELS: Record<string, string> = {
  Paid: 'Chờ đóng gói',
  Packed: 'Đã đóng gói',
  Shipping: 'Đang giao',
  Delivered: 'Đã giao',
  Completed: 'Hoàn tất',
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status
}

function OrderList({ status, onStatus }: { status: OperatorOrderStatus; onStatus: (s: OperatorOrderStatus) => void }) {
  const query = useOperatorOrders(status)
  const list = query.data ?? []
  return (
    <>
      <OpHeading
        eyebrow="Đơn hàng"
        title="Đóng gói và giao đơn"
        description="Quét tem để đóng gói đơn đã thanh toán, giao cho nhà xe rồi báo đã giao khi khách nhận được hàng."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 font-bold">
          Trạng thái
          <select aria-label="Trạng thái đơn" className="rd-input" value={status} onChange={(e) => onStatus(e.target.value as OperatorOrderStatus)}>
            <option value="Paid">Chờ đóng gói</option>
            <option value="Packed">Đã đóng gói</option>
            <option value="Shipping">Đang giao</option>
            <option value="Delivered">Đã giao</option>
            <option value="Completed">Hoàn tất</option>
          </select>
        </label>
        <OpBtn variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw size={16} /> Làm mới
        </OpBtn>
      </div>
      {query.isPending ? (
        <p role="status" className="op-panel p-6">Đang tải đơn hàng…</p>
      ) : query.isError ? (
        <div role="alert" className="op-panel p-6">
          <p>{errorMessage(query.error)}</p>
          <OpBtn className="mt-3" onClick={() => void query.refetch()}>Thử lại</OpBtn>
        </div>
      ) : (
        <div className="op-panel op-list">
          {list.map((o) => <OrderRow key={o.orderNo} order={o} />)}
          {!list.length && (
            <div className="op-empty">
              <b>Không có đơn {statusLabel(status).toLowerCase()}</b>
              {status === 'Paid' && <span>Đơn Paid mới xuất hiện khi khách đã chuyển khoản thành công.</span>}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function OrderRow({ order }: { order: OperatorOrderSummary }) {
  return (
    <OpRow
      href={`/operator/orders/${order.orderNo}`}
      media={<ScanLine size={22} />}
      title={<span className="op-mono">{order.orderNo}</span>}
      sub={`${order.customerName} · ${order.batchCode}`}
      mid={<span>{kg(order.totalKg)} · {order.lineCount} dòng · {order.paidAt ? formatDateTime(order.paidAt) : formatDateTime(order.placedAt)}</span>}
      end={<><OpBadge tone={statusTone(order.status)}>{statusLabel(order.status)}</OpBadge><b>{formatVnd(order.totalAmount)}</b></>}
    />
  )
}

function PackForm({ order }: { order: OperatorOrderDetail }) {
  const pack = usePackOrder(order.orderNo)
  const [raw, setRaw] = useState('')
  const codes = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
  if (order.status !== 'Paid') {
    return <OpNote tone="ok">Đơn đã {statusLabel(order.status).toLowerCase()}. Không cần quét thêm tem.</OpNote>
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (codes.length) pack.mutate(codes)
  }
  return (
    <form className="op-form" onSubmit={submit}>
      <div className="op-field">
        <label htmlFor="pack-tags">Mã tem (mỗi dòng một mã, 12 ký tự)</label>
        <textarea
          id="pack-tags"
          className="rd-input"
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="CSAB23CD45EF"
          disabled={pack.isPending}
        />
      </div>
      {pack.isError && <p role="alert" className="text-red-700">{errorMessage(pack.error)}</p>}
      {pack.isSuccess && <p role="status" className="text-green-700">Đã đóng gói {pack.data.lines.reduce((n, l) => n + l.assignedCount, 0)} con. Đơn chuyển sang Packed.</p>}
      <OpBtn type="submit" variant="ink" disabled={!codes.length || pack.isPending}>
        <ScanLine size={16} /> {pack.isPending ? 'Đang đóng gói…' : `Đóng gói ${codes.length || ''} tem`}
      </OpBtn>
    </form>
  )
}

const ETA_MAX_DAYS = 7

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ShipForm({ order }: { order: OperatorOrderDetail }) {
  const ship = useShipOrder(order.orderNo)
  const [carrierName, setCarrierName] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [eta, setEta] = useState('')
  const [note, setNote] = useState('')
  const phoneOk = /^(0\d{9}|\+84\d{9})$/.test(driverPhone.trim())
  const now = new Date()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!carrierName.trim() || !phoneOk || ship.isPending) return
    ship.mutate({
      carrierName: carrierName.trim(),
      vehiclePlate: vehiclePlate.trim() || undefined,
      driverPhone: driverPhone.trim(),
      expectedArrivalAt: eta ? new Date(eta).toISOString() : undefined,
      note: note.trim() || undefined,
    })
  }
  return (
    <form className="op-form" onSubmit={submit}>
      <OpNote tone="info">Hộ nuôi tự gửi hàng qua nhà xe. Nền tảng không thu phí vận chuyển; khách gọi thẳng cho tài xế theo số bạn nhập.</OpNote>
      <div className="op-field">
        <label htmlFor="ship-carrier">Tên nhà xe</label>
        <input id="ship-carrier" className="rd-input" maxLength={150} value={carrierName} onChange={(e) => setCarrierName(e.target.value)} required disabled={ship.isPending} />
      </div>
      <div className="op-field">
        <label htmlFor="ship-plate">Biển số xe (không bắt buộc)</label>
        <input id="ship-plate" className="rd-input" maxLength={20} value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} disabled={ship.isPending} />
      </div>
      <div className="op-field">
        <label htmlFor="ship-phone">Số điện thoại tài xế</label>
        <input id="ship-phone" className="rd-input" inputMode="tel" maxLength={12} value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} required disabled={ship.isPending} />
        {driverPhone.trim() && !phoneOk && <small className="text-red-700">Cần 10 chữ số bắt đầu bằng 0, hoặc dạng +84.</small>}
      </div>
      <div className="op-field">
        <label htmlFor="ship-eta">Giờ dự kiến tới khách (không bắt buộc)</label>
        <input id="ship-eta" className="rd-input" type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)}
          min={toLocalInput(now)} max={toLocalInput(new Date(now.getTime() + ETA_MAX_DAYS * 86_400_000))} disabled={ship.isPending} />
      </div>
      <div className="op-field">
        <label htmlFor="ship-note">Ghi chú cho khách (không bắt buộc)</label>
        <textarea id="ship-note" className="rd-input" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} disabled={ship.isPending} />
      </div>
      {ship.isError && <p role="alert" className="text-red-700">{errorMessage(ship.error)}</p>}
      <OpBtn type="submit" variant="ink" disabled={!carrierName.trim() || !phoneOk || ship.isPending}>
        <Truck size={16} /> {ship.isPending ? 'Đang lưu…' : 'Giao cho nhà xe'}
      </OpBtn>
    </form>
  )
}

function ShipmentFacts({ order }: { order: OperatorOrderDetail }) {
  const s = order.shipment
  if (!s) return null
  return (
    <ul className="grid gap-1 text-sm">
      {s.carrierName && <li>Nhà xe: <b>{s.carrierName}</b>{s.vehiclePlate ? ` · ${s.vehiclePlate}` : ''}</li>}
      {s.driverPhone && <li>Tài xế: <b>{s.driverPhone}</b></li>}
      {s.shippedAt && <li>Gửi lúc: {formatDateTime(s.shippedAt)}</li>}
      {s.expectedArrivalAt && !s.deliveredAt && <li>Dự kiến tới: {formatDateTime(s.expectedArrivalAt)}</li>}
      {s.deliveredAt && <li>Đã giao lúc: {formatDateTime(s.deliveredAt)}</li>}
      {s.receivedAt && <li>Khách xác nhận lúc: {formatDateTime(s.receivedAt)}</li>}
      {s.returnWindowEndsAt && !s.completedAt && <li>Hạn đổi trả: {formatDateTime(s.returnWindowEndsAt)}</li>}
      {s.completedAt && <li>Hoàn tất lúc: {formatDateTime(s.completedAt)}</li>}
    </ul>
  )
}

function DeliverBox({ order }: { order: OperatorOrderDetail }) {
  const deliver = useDeliverOrder(order.orderNo)
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="op-form">
      <ShipmentFacts order={order} />
      {deliver.isError && <p role="alert" className="text-red-700">{errorMessage(deliver.error)}</p>}
      {!confirming ? (
        <OpBtn variant="ink" onClick={() => setConfirming(true)}><PackageCheck size={16} /> Đã giao tới khách</OpBtn>
      ) : (
        <>
          <OpNote>Chỉ xác nhận khi nhà xe báo khách đã nhận hàng. Từ lúc này khách có 72 giờ để báo lỗi trước khi đơn tự hoàn tất.</OpNote>
          <div className="flex flex-wrap gap-2">
            <OpBtn variant="outline" disabled={deliver.isPending} onClick={() => setConfirming(false)}>Huỷ</OpBtn>
            <OpBtn variant="ink" disabled={deliver.isPending} onClick={() => deliver.mutate()}>
              {deliver.isPending ? 'Đang lưu…' : 'Xác nhận đã giao'}
            </OpBtn>
          </div>
        </>
      )}
    </div>
  )
}

function FulfilmentPanel({ order }: { order: OperatorOrderDetail }) {
  if (order.status === 'Paid') {
    return (
      <OpPanel accent className="op-span-6" title="Quét tem" subtitle="Dán đủ cua đúng lô và đúng hạng, tổng kg không được thiếu.">
        <PackForm order={order} />
      </OpPanel>
    )
  }
  if (order.status === 'Packed') {
    return (
      <OpPanel accent className="op-span-6" title="Giao cho nhà xe" subtitle={`Người nhận: ${order.recipientName} · ${order.recipientPhone}`}>
        <ShipForm order={order} />
      </OpPanel>
    )
  }
  if (order.status === 'Shipping') {
    return (
      <OpPanel accent className="op-span-6" title="Đang giao" subtitle="Báo đã giao khi khách nhận được hàng.">
        <DeliverBox order={order} />
      </OpPanel>
    )
  }
  return (
    <OpPanel className="op-span-6" title={statusLabel(order.status)}>
      {order.shipment ? <ShipmentFacts order={order} /> : <OpNote tone="ok">Đơn {statusLabel(order.status).toLowerCase()}.</OpNote>}
    </OpPanel>
  )
}

function OperatorComplaintBox({ orderNo }: { orderNo: string }) {
  const { data: complaint, isLoading, refetch } = useOrderComplaint(orderNo)
  const respondMutation = useRespondComplaint(complaint?.complaintId ?? 0)

  const [response, setResponse] = useState('')
  const [evidenceUri, setEvidenceUri] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isLoading || !complaint) return null

  const handleRespond = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (!response.trim()) {
      setErrorMsg('Vui lòng nhập nội dung giải trình.')
      return
    }

    setIsSubmitting(true)
    try {
      await respondMutation.mutateAsync({
        response: response.trim(),
        evidenceUri: evidenceUri.trim() || null,
      })
      setResponse('')
      setEvidenceUri('')
      refetch()
    } catch (err: unknown) {
      setErrorMsg(errorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <OpPanel
      accent={complaint.status === 'Open' || complaint.status === 'Escalated'}
      className="op-span-12"
      title={`Khiếu nại #${complaint.complaintId}: ${COMPLAINT_STATUS_LABELS[complaint.status] ?? complaint.status}`}
      subtitle={`Khách phản ánh về ${COMPLAINT_TYPE_LABELS[complaint.complaintType] ?? complaint.complaintType} · Mở lúc ${formatDateTime(complaint.openedAt)}`}
    >
      <div className="space-y-4 text-sm">
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-amber-950">
          <strong className="block mb-1 font-bold text-amber-900">Nội dung khiếu nại của khách hàng:</strong>
          <p className="whitespace-pre-line text-xs bg-white/80 p-3 rounded-lg border border-amber-100">
            "{complaint.description}"
          </p>
          {complaint.evidenceUri && (
            <div className="mt-2">
              <a
                href={complaint.evidenceUri}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-700 underline font-semibold"
              >
                <ImageIcon size={14} /> Xem link hình ảnh/video bằng chứng bóc hàng
                <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        {complaint.operatorResponse ? (
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 text-blue-950">
            <div className="flex items-center justify-between mb-1">
              <strong className="font-bold text-blue-900">Giải trình của hộ nuôi:</strong>
              {complaint.respondedAt && <span className="text-xs text-blue-700">{formatDateTime(complaint.respondedAt)}</span>}
            </div>
            <p className="whitespace-pre-line text-xs bg-white/80 p-3 rounded-lg border border-blue-100">
              "{complaint.operatorResponse}"
            </p>
            {complaint.operatorEvidenceUri && (
              <div className="mt-2">
                <a
                  href={complaint.operatorEvidenceUri}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-700 underline font-semibold"
                >
                  <ImageIcon size={14} /> Bằng chứng đối chứng đóng gói
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        ) : complaint.status === 'Open' ? (
          <form className="bg-white p-4 rounded-xl border border-slate-300 shadow-sm space-y-3" onSubmit={handleRespond}>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span>
                Hạn phản hồi: 24 giờ kể từ khi mở khiếu nại. Nếu không giải trình, khiếu nại sẽ được chuyển thẳng lên Admin phân xử!
              </span>
            </div>

            <label className="block text-xs font-bold text-slate-700">
              Nội dung giải trình / phản hồi (*)
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Nêu rõ tình trạng cua khi đóng gói, cấp oxy, bàn giao cho nhà xe..."
                rows={3}
                required
                maxLength={1000}
                className="rd-input w-full mt-1"
              />
            </label>

            <label className="block text-xs font-bold text-slate-700">
              Link hình ảnh / video đóng gói đối chứng (Google Drive, Imgur...):
              <input
                type="url"
                value={evidenceUri}
                onChange={(e) => setEvidenceUri(e.target.value)}
                placeholder="https://drive.google.com/..."
                maxLength={400}
                className="rd-input w-full mt-1"
              />
            </label>

            {errorMsg && <p className="co-error text-xs" role="alert">{errorMsg}</p>}

            <div className="flex justify-end">
              <OpBtn type="submit" disabled={isSubmitting || !response.trim()}>
                {isSubmitting ? 'Đang gửi giải trình...' : 'Gửi giải trình khiếu nại'}
              </OpBtn>
            </div>
          </form>
        ) : complaint.status === 'Escalated' ? (
          <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-xs text-red-800 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600 shrink-0" />
            <div>
              <strong>Đã quá hạn 24 giờ phản hồi!</strong> Khiếu nại đã chuyển lên Admin để tiến hành phân xử bồi thường.
            </div>
          </div>
        ) : null}

        {(complaint.status === 'Resolved' || complaint.status === 'Rejected') && (
          <div className={`p-4 rounded-xl border text-xs ${
            complaint.status === 'Resolved' ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-slate-100 border-slate-300 text-slate-800'
          }`}>
            <strong className="block mb-1">
              {complaint.status === 'Resolved' ? '✓ Phán quyết của Ban quản trị: Đã giải quyết / Hoàn tiền' : '✕ Phán quyết của Ban quản trị: Bác bỏ khiếu nại'}
            </strong>
            {complaint.refundAmount !== null && complaint.refundAmount !== undefined && (
              <p>Số tiền hoàn cho khách: <strong className="text-red-600 font-bold text-sm">{formatVnd(complaint.refundAmount)}</strong> (khấu trừ từ tài khoản lô)</p>
            )}
            {complaint.adminNotes && <p className="italic mt-1">Ghi chú của Admin: "{complaint.adminNotes}"</p>}
          </div>
        )}
      </div>
    </OpPanel>
  )
}

function OrderDetail({ orderNo }: { orderNo: string }) {
  const query = useOperatorOrder(orderNo)
  const order = query.data
  return (
    <>
      <OpHeading
        crumb={<OpBack href="/operator/orders"><ArrowLeft size={16} /> Quay lại danh sách đơn</OpBack>}
        eyebrow="Đơn hàng"
        title={order ? `Đơn ${order.orderNo}` : 'Chi tiết đơn'}
        description={order ? `${order.customerName} · lô ${order.batchCode}` : 'Đang tải…'}
        action={
          order ? (
            <a
              className="rd-btn rd-btn--ghost rd-btn--sm flex items-center gap-1.5"
              href={`/theo-doi-don-hang/${order.orderNo}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} /> Xem trang Khách hàng
            </a>
          ) : undefined
        }
      />
      {query.isPending ? (
        <p role="status" className="op-panel p-6">Đang tải đơn…</p>
      ) : query.isError ? (
        <div role="alert" className="op-panel p-6">
          <p>{errorMessage(query.error)}</p>
          <OpBtn className="mt-3" onClick={() => void query.refetch()}>Thử lại</OpBtn>
        </div>
      ) : order ? (
        <>
          <OpFacts items={[
            { label: 'Trạng thái', value: statusLabel(order.status), tone: statusTone(order.status) === 'ok' ? 'ok' : statusTone(order.status) === 'warn' ? 'warn' : undefined },
            { label: 'Khối lượng', value: kg(order.totalKg) },
            { label: 'Giá trị', value: formatVnd(order.totalAmount) },
            { label: 'Người nhận', value: order.recipientName },
          ]} />
          <div className="op-grid">
            <OperatorComplaintBox orderNo={order.orderNo} />
            <OpPanel className="op-span-6" title="Dòng hàng" subtitle={order.shippingAddress}>
              {order.lines.map((line) => (
                <div key={line.orderLineId} className="mb-4">
                  <b>{line.title}</b>
                  <p className="op-muted text-sm">{line.gradeName} · cần {kg(line.quantityKg)} · đã gán {kg(line.assignedKg)} ({line.assignedCount} con)</p>
                  {line.tags.length > 0 && (
                    <ul className="mt-2 grid gap-1 text-sm">
                      {line.tags.map((t) => (
                        <li key={t.tagCode} className="op-mono">{t.tagCode} · {t.weightG} g · {t.gradeCode}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </OpPanel>
            <FulfilmentPanel order={order} />
          </div>
        </>
      ) : null}
    </>
  )
}

export default function OperatorOrders() {
  const { orderNo } = useParams()
  const [status, setStatus] = useState<OperatorOrderStatus>('Paid')
  return (
    <OperatorLayout activeTab="orders">
      {orderNo ? <OrderDetail orderNo={orderNo} /> : <OrderList status={status} onStatus={setStatus} />}
    </OperatorLayout>
  )
}

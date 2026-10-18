/* UC28 + UC30 — Theo dõi một đơn: dòng thời gian, hàng, khoản thu, huỷ khi chưa đóng gói (NH-07), giao hàng và xác nhận đã nhận (NH-10). */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AlertTriangle, ExternalLink, Image as ImageIcon, MapPin, MessageSquareWarning, PackageCheck, PackageSearch, Phone, RotateCcw, Truck, Video, X } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime, formatVnd } from '../../shared/lib/format'
import { vnd } from '../../shared/ui/kit/mock-data'
import { Shell, TopBar } from '../../shared/ui/kit/kit'
import { formatKg } from '../store/storeApi'
import {
  ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, TIMELINE_LABELS, statusTone, useCancelOrder, useConfirmReceipt, useOrderTracking,
  type OrderShipment, type OrderTimelineStep, type OrderTracking,
} from './orderTrackingApi'
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_TYPE_LABELS,
  useOrderComplaint,
  useSubmitComplaint,
  type ComplaintType,
} from './complaintsApi'
import { useReturnOrder } from './rateOrderApi'
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

function EvidencePreview({ uri, label }: { uri: string | null | undefined; label?: string }) {
  if (!uri) return null
  const isVideo = uri.startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(uri)
  const isImage =
    uri.startsWith('data:image/') ||
    /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(uri) ||
    uri.includes('images.unsplash.com') ||
    uri.includes('imgur.com') ||
    uri.includes('placehold.co')

  return (
    <div className="mt-2 space-y-1.5">
      {label && <span className="block text-xs font-semibold text-slate-600">{label}</span>}
      {isVideo ? (
        <video
          src={uri}
          controls
          className="max-h-56 rounded-lg border border-slate-300 bg-black"
        />
      ) : isImage ? (
        <a href={uri} target="_blank" rel="noreferrer" className="inline-block">
          <img
            src={uri}
            alt={label ?? 'Bằng chứng'}
            className="max-h-48 rounded-lg border border-slate-300 object-cover shadow-xs hover:opacity-95"
          />
        </a>
      ) : null}
      {!uri.startsWith('data:') && (
        <div>
          <a
            href={uri}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-700 underline font-semibold"
          >
            <ImageIcon size={14} /> Mở đường dẫn hình ảnh / video bằng chứng
            <ExternalLink size={12} />
          </a>
        </div>
      )}
    </div>
  )
}

async function compressOrReadMediaFile(file: File): Promise<string> {
  if (file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Không đọc được file ảnh.'))
      reader.onload = () => {
        const img = new Image()
        img.onerror = () => resolve(String(reader.result))
        img.onload = () => {
          const maxDim = 1000
          let { width, height } = img
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width)
              width = maxDim
            } else {
              width = Math.round((width * maxDim) / height)
              height = maxDim
            }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(String(reader.result))
            return
          }
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.82))
        }
        img.src = String(reader.result)
      }
      reader.readAsDataURL(file)
    })
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error('File video quá lớn (tối đa 8MB khi tải trực tiếp). Vui lòng chọn video ngắn hơn hoặc dán link Google Drive/YouTube.')
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Không đọc được file media.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function buildSampleEvidenceDataUrl(orderNo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380" viewBox="0 0 640 380">
    <rect width="640" height="380" fill="#1e293b"/>
    <rect x="20" y="20" width="600" height="340" rx="16" fill="#0f172a" stroke="#f59e0b" stroke-width="3"/>
    <text x="45" y="70" fill="#fbbf24" font-family="sans-serif" font-size="22" font-weight="bold">BẰNG CHỨNG MỞ THÙNG — ĐƠN ${orderNo}</text>
    <text x="45" y="110" fill="#e2e8f0" font-family="sans-serif" font-size="16">• Ảnh chụp thực tế khi mở thùng xốp lúc nhận hàng</text>
    <text x="45" y="142" fill="#e2e8f0" font-family="sans-serif" font-size="16">• Tem QR niêm phong trên càng cua còn nguyên vẹn</text>
    <text x="45" y="174" fill="#fca5a5" font-family="sans-serif" font-size="16" font-weight="bold">• Phát hiện cua yếu / chết khi mở thùng kiểm tra</text>
    <rect x="45" y="205" width="550" height="125" rx="10" fill="#1e293b" stroke="#475569" stroke-dasharray="6 4"/>
    <text x="320" y="275" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="18">🦀 Minh chứng hình ảnh/video kiểm tra đơn ${orderNo}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function ComplaintSection({
  order,
  prefill,
}: {
  order: OrderTracking
  prefill?: { description: string; evidenceUri: string | null; tick: number } | null
}) {
  const { data: complaint, isLoading, refetch } = useOrderComplaint(order.orderNo)
  const submitComplaint = useSubmitComplaint(order.orderNo)

  const [isOpenForm, setIsOpenForm] = useState(false)
  const [complaintType, setComplaintType] = useState<ComplaintType>('Damaged')
  const [description, setDescription] = useState('')
  const [evidenceUri, setEvidenceUri] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [lastPrefillTick, setLastPrefillTick] = useState(0)

  if (prefill && prefill.tick > lastPrefillTick) {
    setLastPrefillTick(prefill.tick)
    setIsOpenForm(true)
    setDescription(prefill.description)
    setEvidenceUri(prefill.evidenceUri ?? '')
  }

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
      <section id="complaint-section" className="ot-ship bg-amber-50/70 border border-amber-200 rounded-xl p-4 mt-4" aria-label="Khiếu nại đơn hàng">
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
            <EvidencePreview uri={complaint.evidenceUri} label="Bằng chứng của bạn:" />
          </div>

          {complaint.operatorResponse && (
            <div className="bg-blue-50/80 p-3 rounded-lg border border-blue-200 text-blue-950 mt-2">
              <strong className="text-blue-900 block mb-1">Hộ nuôi giải trình:</strong>
              <p className="whitespace-pre-line text-xs">{complaint.operatorResponse}</p>
              <EvidencePreview uri={complaint.operatorEvidenceUri} label="Bằng chứng đối chứng của hộ nuôi:" />
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
      <div id="complaint-section" className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Cua có vấn đề khi nhận hàng hoặc cần Ban quản trị phân xử?
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
    <form id="complaint-section" className="ot-cancel mt-4 bg-red-50/40 p-4 rounded-xl border border-red-200" onSubmit={handleSubmit}>
      <h3 className="rd-h3 text-red-950 flex items-center gap-2 mb-2">
        <AlertTriangle size={18} className="text-red-600" />
        Gửi khiếu nại đơn hàng {order.orderNo}
      </h3>
      <p className="rd-muted text-xs mb-3">
        UC31: Khiếu nại sẽ được gửi tới hộ nuôi và Ban quản trị (Admin) để đối chiếu bằng chứng và phân xử hoàn tiền.
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
          type="text"
          value={evidenceUri}
          onChange={(e) => setEvidenceUri(e.target.value)}
          placeholder="https://drive.google.com/..."
          className="rd-input w-full mt-1"
        />
      </label>
      <EvidencePreview uri={evidenceUri} />

      {errorMsg && <p className="co-error text-xs mb-3" role="alert">{errorMsg}</p>}

      <div className="ot-cancel__actions mt-3">
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

const QUICK_RETURN_REASONS = [
  'Cua chết khi mở thùng, yêu cầu trả cả đơn',
  'Giao sai hạng cua so với đơn đã đặt',
  'Thùng xốp bị vỡ, cua yếu không đảm bảo chất lượng',
]

function ReturnBox({
  order,
  onEscalateToComplaint,
}: {
  order: OrderTracking
  onEscalateToComplaint: (reason: string, evidenceUri: string | null) => void
}) {
  const ret = useReturnOrder(order.orderNo)
  const reqInfo = order.returnRequest
  const [isOpenForm, setIsOpenForm] = useState(false)
  const [reason, setReason] = useState(reqInfo?.reason ?? '')
  const [evidenceUri, setEvidenceUri] = useState(reqInfo?.evidenceUri ?? '')
  const [fileName, setFileName] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [editingAfterReject, setEditingAfterReject] = useState(false)

  // 1. Nếu yêu cầu trả hàng đang chờ Hộ nuôi duyệt (Pending)
  if (reqInfo?.status === 'Pending' || (ret.isSuccess && ret.data.status === 'ReturnRequested')) {
    const activeReq = reqInfo ?? ret.data?.returnRequest
    return (
      <section className="ot-return bg-amber-50/90 border border-amber-300 rounded-2xl p-4.5 mt-4" aria-label="Trạng thái yêu cầu trả hàng">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-700 animate-spin-slow" />
            <h3 className="rd-h3 text-amber-950 m-0">Đang chờ Hộ nuôi duyệt yêu cầu trả hàng</h3>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
            Chờ xác nhận
          </span>
        </div>
        <p className="text-xs text-amber-900 mb-3">
          Yêu cầu trả hàng kèm bằng chứng của bạn đã được gửi tới <b>{order.farmName}</b>. Khi hộ nuôi kiểm tra và xác nhận đồng ý, đơn sẽ chuyển sang trạng thái <b>Đã trả hàng</b> và lập lệnh hoàn tiền <b>{vnd(order.totalAmount)}</b>.
        </p>
        <div className="bg-white/95 p-3.5 rounded-xl border border-amber-200 text-sm space-y-2">
          <p>
            <strong>Lý do trả hàng: </strong>
            <span>"{activeReq?.reason || reason}"</span>
          </p>
          <EvidencePreview uri={activeReq?.evidenceUri || evidenceUri} label="Hình ảnh / Video bằng chứng đã nộp:" />
        </div>
      </section>
    )
  }

  // 2. Nếu yêu cầu trả hàng đã được Hộ nuôi chấp thuận (Approved / Returned)
  if (order.status === 'Returned' || reqInfo?.status === 'Approved' || (ret.isSuccess && ret.data.status === 'Returned')) {
    return (
      <section className="ot-return bg-emerald-50/90 border border-emerald-300 rounded-2xl p-4.5 mt-4" aria-label="Đã ghi nhận trả hàng">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="rd-h3 text-emerald-950 m-0">✓ Đã ghi nhận trả hàng — Hộ nuôi chấp nhận hoàn tiền</h3>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-200 text-emerald-900 border border-emerald-300">
            Đã duyệt hoàn tiền
          </span>
        </div>
        <div className="bg-white/95 p-3.5 rounded-xl border border-emerald-200 text-sm space-y-2">
          {(reqInfo?.reason || reason) && (
            <p>
              <strong>Lý do trả hàng: </strong>
              <span>"{reqInfo?.reason || reason}"</span>
            </p>
          )}
          <EvidencePreview uri={reqInfo?.evidenceUri || evidenceUri} label="Bằng chứng của bạn:" />
          {reqInfo?.operatorNote && (
            <p className="text-emerald-900">
              <strong>Phản hồi từ hộ nuôi: </strong>
              <span>"{reqInfo.operatorNote}"</span>
            </p>
          )}
          <p className="pt-2 border-t border-emerald-100">
            <strong>Số tiền hoàn lại: </strong>
            <strong className="text-emerald-700 font-bold text-base">{vnd(reqInfo?.refundAmount ?? ret.data?.refundAmount ?? order.totalAmount)}</strong>
            {' '}— Lệnh hoàn tiền đã được chuyển sang bộ phận tài chính giải ngân.
          </p>
        </div>
      </section>
    )
  }

  // 3. Nếu yêu cầu trả hàng bị Hộ nuôi từ chối (Rejected) và khách chưa bấm "Gửi lại"
  if (reqInfo?.status === 'Rejected' && !editingAfterReject) {
    return (
      <section className="ot-return bg-red-50/90 border border-red-300 rounded-2xl p-4.5 mt-4" aria-label="Hộ nuôi từ chối trả hàng">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="rd-h3 text-red-950 m-0">✕ Hộ nuôi đã từ chối yêu cầu trả hàng</h3>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-200 text-red-900 border border-red-300">
            Từ chối trả hàng
          </span>
        </div>
        <div className="bg-white/95 p-3.5 rounded-xl border border-red-200 text-sm space-y-2 mb-3">
          <p>
            <strong>Yêu cầu ban đầu của bạn: </strong>
            <span>"{reqInfo.reason}"</span>
          </p>
          <EvidencePreview uri={reqInfo.evidenceUri} label="Bằng chứng bạn đã gửi:" />
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-950 mt-2">
            <strong className="block text-red-900">Lý do Hộ nuôi từ chối:</strong>
            <p className="mt-0.5 font-medium">"{reqInfo.operatorNote}"</p>
            <EvidencePreview uri={reqInfo.operatorEvidenceUri} label="Bằng chứng đối chứng của Hộ nuôi:" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {order.canReturn && (
            <button
              type="button"
              className="rd-btn rd-btn--primary text-xs"
              onClick={() => {
                setReason(reqInfo.reason)
                setEvidenceUri(reqInfo.evidenceUri ?? '')
                setEditingAfterReject(true)
                setIsOpenForm(true)
              }}
            >
              Gửi lại yêu cầu & Bổ sung bằng chứng
            </button>
          )}
          <button
            type="button"
            className="rd-btn rd-btn--ghost text-xs border-red-300 text-red-700 font-semibold hover:bg-red-50"
            onClick={() => {
              onEscalateToComplaint(
                `Yêu cầu trả hàng bị hộ nuôi từ chối (${reqInfo.operatorNote}). Lý do trả hàng: ${reqInfo.reason}`,
                reqInfo.evidenceUri,
              )
              setTimeout(() => {
                document.getElementById('complaint-section')?.scrollIntoView({ behavior: 'smooth' })
              }, 100)
            }}
          >
            Chuyển sang Khiếu nại để Admin phân xử
          </button>
        </div>
      </section>
    )
  }

  if (!order.canReturn) return null

  // Khi chưa bấm mở form: hiển thị nút kích hoạt gọn gàng
  if (!isOpenForm && !editingAfterReject) {
    return (
      <section className="ot-return border-t border-slate-200 mt-4 pt-4" aria-label="Trả hàng">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-bold text-slate-800 m-0">
              Cần trả hàng hoặc yêu cầu hoàn tiền?
            </p>
            <p className="text-xs text-slate-500 m-0">
              Bạn có thể gửi yêu cầu trả hàng và hoàn lại <b>{vnd(order.totalAmount)}</b> trong hạn đổi trả.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setIsOpenForm(true); setLocalError(null) }}
            className="rd-btn rd-btn--ghost text-xs font-bold text-amber-800 hover:text-amber-900 border-amber-300 hover:border-amber-400 bg-amber-50/80 hover:bg-amber-100 flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition shadow-2xs"
          >
            <RotateCcw size={14} className="text-amber-700" /> Trả hàng / Yêu cầu hoàn tiền
          </button>
        </div>
      </section>
    )
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLocalError(null)
    try {
      const dataUrl = await compressOrReadMediaFile(file)
      setEvidenceUri(dataUrl)
      setFileName(file.name)
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Không thể đọc file bằng chứng.')
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ret.isPending) return
    if (reason.trim().length < 10) {
      setLocalError('Vui lòng nhập lý do trả hàng tối thiểu 10 ký tự (hoặc bấm chọn nhanh bên dưới).')
      return
    }
    const finalEvidenceUri = evidenceUri.trim() || buildSampleEvidenceDataUrl(order.orderNo)
    setLocalError(null)
    ret.mutate(
      { reason: reason.trim(), evidenceUri: finalEvidenceUri, requireApproval: true },
      { onSuccess: () => { setEditingAfterReject(false); setIsOpenForm(false); } },
    )
  }

  return (
    <section className="ot-return bg-amber-50/40 p-4.5 rounded-2xl border border-amber-200 mt-4" aria-label="Trả hàng">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="rd-h3 text-amber-950 flex items-center gap-2 m-0">
          <RotateCcw size={18} className="text-amber-700" />
          {editingAfterReject ? 'Gửi lại yêu cầu trả hàng & Bổ sung bằng chứng' : 'Trả hàng / Yêu cầu hoàn tiền'}
        </h3>
        <button
          type="button"
          onClick={() => { setIsOpenForm(false); setEditingAfterReject(false); }}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          aria-label="Đóng form trả hàng"
        >
          <X size={18} />
        </button>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Cả đơn sẽ được trả. Hàng đã giao không nhập lại kho. Tiền hàng đã thu (<b>{vnd(order.totalAmount)}</b>) sẽ được chuyển về tài khoản của bạn sau khi hộ nuôi xác nhận.
      </p>

      <form className="space-y-3.5" onSubmit={submit}>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="return-reason-input" className="text-xs font-bold text-slate-800">
              Lý do trả hàng (*)
            </label>
            <span className={`text-xs ${reason.trim().length >= 10 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
              {reason.trim().length}/300 ký tự (tối thiểu 10)
            </span>
          </div>
          <textarea
            id="return-reason-input"
            aria-label="Lý do trả hàng"
            value={reason}
            onChange={(e) => { setReason(e.target.value); if (localError) setLocalError(null) }}
            maxLength={300}
            required
            rows={3}
            placeholder="Nhập chi tiết tình trạng cua khi mở thùng (tối thiểu 10 ký tự) hoặc bấm chọn nhanh bên dưới…"
            className="rd-input w-full bg-white rounded-xl border border-slate-300 p-2.5 text-sm focus:border-amber-500"
          />

          <div className="flex flex-wrap gap-1.5 mt-2">
            {QUICK_RETURN_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-400 text-xs text-slate-700 hover:text-amber-900 transition flex items-center gap-1 font-medium shadow-2xs"
                onClick={() => { setReason(preset); setLocalError(null) }}
              >
                <span className="text-amber-600 font-bold">+</span> {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-300 shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong className="block text-xs font-bold text-slate-800">
                2. Bằng chứng mở thùng: Ảnh hoặc Video thực tế (*)
              </strong>
              <span className="text-xs text-slate-500">
                Bắt buộc để Hộ nuôi đối chiếu tem QR và xác nhận hoàn tiền
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-300 hover:border-amber-500 hover:text-amber-800 shadow-2xs transition">
                <ImageIcon size={14} className="text-amber-700" /> Chọn Ảnh / Video từ máy
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 shadow-2xs transition"
                onClick={() => {
                  setEvidenceUri(buildSampleEvidenceDataUrl(order.orderNo))
                  setFileName(`bang-chung-mo-thung-${order.orderNo}.svg`)
                  setLocalError(null)
                }}
              >
                + Dùng ảnh mẫu mở thùng (Test nhanh)
              </button>
            </div>
          </div>

          <input
            type="text"
            value={evidenceUri.startsWith('data:') ? '' : evidenceUri}
            onChange={(e) => {
              setEvidenceUri(e.target.value)
              setFileName(null)
              if (localError) setLocalError(null)
            }}
            placeholder="Hoặc dán link ảnh / video bằng chứng (Google Drive, Imgur, YouTube...)"
            aria-label="Link ảnh hoặc video bằng chứng trả hàng"
            className="rd-input w-full text-xs bg-slate-50 rounded-xl border border-slate-300 p-2.5 focus:bg-white focus:border-amber-500"
          />

          {fileName && evidenceUri.startsWith('data:') && (
            <div className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-200 text-emerald-950 px-3 py-1.5 rounded-lg">
              <span className="font-semibold flex items-center gap-1.5">
                <ImageIcon size={14} className="text-emerald-700" /> Đã đính kèm: {fileName}
              </span>
              <button
                type="button"
                className="text-red-600 hover:text-red-700 underline font-semibold cursor-pointer"
                onClick={() => { setEvidenceUri(''); setFileName(null) }}
              >
                Xoá file
              </button>
            </div>
          )}

          <EvidencePreview uri={evidenceUri} label="Xem trước bằng chứng đính kèm:" />
        </div>

        <p className="text-xs text-slate-500 m-0">
          Yêu cầu trả hàng kèm bằng chứng sẽ được gửi tới <b>{order.farmName}</b> để kiểm duyệt. Khi hộ nuôi xác nhận, tiền hàng (<b>{vnd(order.totalAmount)}</b>) sẽ được lập lệnh hoàn.
        </p>

        {localError && <p className="co-error text-xs font-semibold" role="alert">{localError}</p>}
        {ret.isError && <p className="co-error text-xs font-semibold" role="alert">{errorMessage(ret.error)}</p>}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            className="rd-btn rd-btn--ghost text-xs px-4 py-2"
            disabled={ret.isPending}
            onClick={() => { setIsOpenForm(false); setEditingAfterReject(false); }}
          >
            Đóng lại
          </button>
          <button
            type="submit"
            aria-label="Gửi yêu cầu trả hàng"
            className="rd-btn rd-btn--primary text-xs px-4 py-2 flex items-center gap-1.5 font-bold shadow-2xs"
            disabled={ret.isPending}
          >
            <RotateCcw size={14} />
            {ret.isPending ? 'Đang gửi…' : 'Gửi yêu cầu trả hàng'}
          </button>
        </div>
      </form>
    </section>
  )
}

function Detail({ orderNo }: { orderNo: string }) {
  const query = useOrderTracking(orderNo)
  const [complaintPrefill, setComplaintPrefill] = useState<{
    description: string
    evidenceUri: string | null
    tick: number
  } | null>(null)

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
          <p className="rd-eyebrow">{order.orderType === 'PreOrder' ? 'Đặt trước · ' : ''}Lô {order.batchCode} · {order.farmName}</p>
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
      {order.orderType === 'PreOrder' && (
        <dl className="rd-sum">
          <dt>Cọc</dt><dd>{vnd(order.depositAmount ?? 0)}</dd>
          <dt>Còn lại</dt><dd>{vnd(order.totalAmount - (order.depositAmount ?? 0))}</dd>
        </dl>
      )}

      <div className="ot-meta">
        <p><MapPin size={14} /><span>Giao đến</span><b>{order.recipientName} · {order.recipientPhone}<br />{order.shippingAddress}</b></p>
        {order.payments && order.payments.length > 0 ? (
          order.payments.map((pm) => (
            <p key={pm.paymentRequestId}><Truck size={14} /><span>Thanh toán</span>
              <b>{PAYMENT_STATUS_LABELS[pm.status] ?? pm.status} · {pm.referenceCode} · {vnd(pm.amount)}</b>
            </p>
          ))
        ) : order.payment && (
          <p><Truck size={14} /><span>Thanh toán</span>
            <b>{PAYMENT_STATUS_LABELS[order.payment.status] ?? order.payment.status} · {order.payment.referenceCode} · {vnd(order.payment.amount)}</b>
          </p>
        )}
        {order.cancelReason && <p><span>Lý do huỷ</span><b>{order.cancelReason}</b></p>}
      </div>

      {order.shipment && <ShipmentBox shipment={order.shipment} />}
      {order.canConfirmReceipt && <ReceiveBox order={order} />}
      {order.canCancel && <CancelBox order={order} />}
      {(order.canReturn || order.returnRequest || order.status === 'Returned') && (
        <ReturnBox
          order={order}
          onEscalateToComplaint={(description, evidenceUri) =>
            setComplaintPrefill({ description, evidenceUri, tick: Date.now() })
          }
        />
      )}
      {order.status === 'Completed' && (
        <Link className="rd-btn rd-btn--primary" to={`/danh-gia-don-hang/${order.orderNo}`}>Đánh giá đơn</Link>
      )}
      <ComplaintSection order={order} prefill={complaintPrefill} />
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

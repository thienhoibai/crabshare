/* Khiếu nại, trả hàng và đánh giá của một đơn (BR-172 – BR-176); là tab "Khiếu nại, đánh giá" của trang chi tiết đơn.
   POST /api/preorders/{orderNo}/claims (multipart, ảnh chụp trong app), GET /api/claims/{claimNo}, GET …/photo,
   POST /api/claims/{claimNo}/customer-reply, POST /api/preorders/{orderNo}/rating.
   API chưa có danh sách khiếu nại của khách nên trang nhớ mã khiếu nại đã gửi trên trình duyệt này và cho mở lại theo mã. */
import { useState, type FormEvent } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Search, Star } from 'lucide-react'
import type {
  ClaimResponse, CustomerReplyRequest, OrderDeliveriesResponse, OrderRatingResponse, PreorderResponse, RateOrderRequest, ShipmentResponse,
} from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import {
  AuthImage, DecimalInput, Field, Input, NumberInput, OpBtn, OpConfirm, OpKv, OpLoading, OpModal, OpMore, OpNote, OpPanel, OpPhoto, RadioCards, Select, StatusBadge,
  TextArea, errorMessage, formatDateTime, formatVnd, http, label, options, useSend,
} from '../../shared/ui/console'
import { fmtKg, inReturnWindow, rememberClaim, rememberRating, rememberedClaims, rememberedRating } from './customerData'

const claimUrl = (claimNo: string) => `/api/claims/${encodeURIComponent(claimNo)}`

interface ClaimBody {
  ShipmentNo: string
  SpecCode: string
  ClaimType: string
  IssueType: string
  AffectedCrabs?: number
  AffectedKg?: number
  Description: string
  Photo: File
}

function ClaimForm({ orderNo, shipments, specName, onDone, onClose }: {
  orderNo: string
  shipments: ShipmentResponse[]
  specName: (code: string) => string
  onDone: (claim: ClaimResponse) => void
  onClose: () => void
}) {
  const [shipmentNo, setShipmentNo] = useState(shipments[0]?.shipmentNo ?? '')
  const shipment = shipments.find((s) => s.shipmentNo === shipmentNo)
  const lines = (shipment?.lines ?? []).filter((l) => (l.acceptedCrabs ?? 0) > 0)
  const [specCode, setSpecCode] = useState(lines[0]?.specCode ?? '')
  const line = lines.find((l) => l.specCode === specCode) ?? lines[0]
  const [claimType, setClaimType] = useState<'Return' | 'Complaint'>('Complaint')
  const [issueType, setIssueType] = useState('Dead')
  const [crabs, setCrabs] = useState<number | null>(null)
  const [kg, setKg] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [message, setMessage] = useState('')

  const create = useSend<ClaimResponse, ClaimBody>('post', `/api/preorders/${encodeURIComponent(orderNo)}/claims`, {
    form: true, success: 'Đã gửi khiếu nại cho người nuôi.', quietError: true, onSuccess: onDone,
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!shipment || !line) return setMessage('Chọn chuyến giao và quy cách.')
    if (!crabs && !kg) return setMessage('Ghi số con hoặc số kg bị ảnh hưởng.')
    if ((crabs ?? 0) > (line.acceptedCrabs ?? 0) || (kg ?? 0) > (line.acceptedKg ?? 0)) return setMessage('Số bị ảnh hưởng không vượt số đã nghiệm thu.')
    if (description.trim().length < 3) return setMessage('Mô tả sự việc ít nhất 3 ký tự.')
    if (!photo) return setMessage('Cần một ảnh chụp bằng chứng.')
    setMessage('')
    create.mutate({
      ShipmentNo: shipment.shipmentNo, SpecCode: line.specCode, ClaimType: claimType, IssueType: issueType,
      AffectedCrabs: crabs || undefined, AffectedKg: kg || undefined, Description: description.trim(), Photo: photo,
    })
  }

  return (
    <OpModal title="Gửi khiếu nại" onClose={onClose} wide>
      <form className="op-form" onSubmit={submit} noValidate>
        {(shipments.length > 1 || lines.length > 1) && (
          <div className="op-form__row">
            {shipments.length > 1 && (
              <Field label="Chuyến giao">
                <Select value={shipmentNo} onChange={(e) => { setShipmentNo(e.target.value); setSpecCode('') }}>
                  {shipments.map((s) => <option key={s.shipmentNo} value={s.shipmentNo}>{s.shipmentNo} · đợt {s.trancheSeq}</option>)}
                </Select>
              </Field>
            )}
            {lines.length > 1 && (
              <Field label="Quy cách">
                <Select value={line?.specCode ?? ''} onChange={(e) => setSpecCode(e.target.value)}>
                  {lines.map((l) => <option key={l.specCode} value={l.specCode}>{specName(l.specCode)}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}
        <RadioCards<'Return' | 'Complaint'>
          value={claimType}
          onChange={setClaimType}
          options={[{ value: 'Complaint', label: 'Khiếu nại', hint: 'Giữ hàng, xin hoàn tiền' }, { value: 'Return', label: 'Trả hàng' }]}
        />
        <div className="op-form__row">
          <Field label="Vấn đề">
            <Select value={issueType} onChange={(e) => setIssueType(e.target.value)}>
              {options('issueType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Số con bị ảnh hưởng" hint={line ? `Đã nghiệm thu ${line.acceptedCrabs} con` : undefined}>
            <NumberInput unit="con" value={crabs} max={line?.acceptedCrabs ?? undefined} onChange={setCrabs} />
          </Field>
        </div>
        <Field label="Mô tả" required>
          <TextArea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <OpPhoto value={photo} onChange={setPhoto} label="Chụp ảnh bằng chứng" />
        <OpMore label="Tuỳ chọn thêm">
          <Field label="Số kg bị ảnh hưởng" hint={line ? `Đã nghiệm thu ${fmtKg(line.acceptedKg)}` : undefined}>
            <DecimalInput unit="kg" value={kg} onChange={setKg} />
          </Field>
        </OpMore>
        {(message || create.isError) && <OpNote tone="danger">{message || errorMessage(create.error)}</OpNote>}
        <div className="op-modal__foot">
          <OpBtn type="button" variant="ghost" onClick={onClose}>Đóng</OpBtn>
          <OpBtn type="submit" disabled={create.isPending}>{create.isPending ? 'Đang gửi…' : 'Gửi khiếu nại'}</OpBtn>
        </div>
      </form>
    </OpModal>
  )
}

function ClaimCard({ claim }: { claim: ClaimResponse }) {
  const [answer, setAnswer] = useState<boolean | null>(null)
  const reply = useSend<ClaimResponse, CustomerReplyRequest>('post', `${claimUrl(claim.claimNo)}/customer-reply`, {
    success: (res) => (res.status === 'Escalated' ? 'Đã chuyển khiếu nại cho Admin quyết định.' : 'Đã chốt khiếu nại.'),
    quietError: true,
    onSuccess: () => setAnswer(null),
  })
  const accepted = claim.status === 'OperatorAccepted'
  const canReply = accepted || claim.status === 'OperatorRejected'
  const affected = [claim.affectedCrabs !== null ? `${claim.affectedCrabs} con` : null, claim.affectedKg !== null ? fmtKg(claim.affectedKg) : null].filter(Boolean).join(' · ')
  return (
    <>
      <div className="op-subform">
        <div className="is-wide op-between">
          <b>{label('issueType', claim.issueType)} · {affected}</b>
          <StatusBadge kind="claim" value={claim.status} />
        </div>
        <div className="is-wide" style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 160px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
          <AuthImage path={`${claimUrl(claim.claimNo)}/photo`} alt={`Ảnh bằng chứng của khiếu nại ${claim.claimNo}`} />
          <div className="op-stack" style={{ gap: 8 }}>
            <p>{claim.description}</p>
            {claim.operatorResponse && <p><b>Người nuôi:</b> {claim.operatorResponse}</p>}
            {claim.adminDecision && <p><b>Admin:</b> {claim.adminDecision}</p>}
            {claim.refundAmount !== null && <p className="op-ok"><b>Hoàn {formatVnd(claim.refundAmount)}</b> ({fmtKg(claim.refundKg)})</p>}
            {claim.status === 'Open' && <small className="rd-muted">Người nuôi phản hồi trước {formatDateTime(claim.responseDueAt)}</small>}
          </div>
        </div>
        {canReply && (
          <div className="is-wide op-formfoot">
            <OpBtn variant="ghost" sm onClick={() => { reply.reset(); setAnswer(false) }}>Không đồng ý</OpBtn>
            <OpBtn sm onClick={() => { reply.reset(); setAnswer(true) }}>Đồng ý</OpBtn>
          </div>
        )}
        <div className="is-wide">
          <OpMore label="Chi tiết">
            <OpKv items={[
              { label: 'Mã khiếu nại', value: <span className="op-mono">{claim.claimNo}</span> },
              { label: 'Loại', value: label('claimType', claim.claimType) },
              { label: 'Chuyến giao', value: claim.shipmentNo },
              { label: 'Gửi lúc', value: formatDateTime(claim.createdAt) },
              { label: 'Người nuôi phản hồi', value: formatDateTime(claim.operatorRespondedAt) },
              { label: 'Chốt lúc', value: formatDateTime(claim.decidedAt) },
            ]} />
          </OpMore>
        </div>
      </div>
      {answer !== null && (
        <OpConfirm title={answer ? 'Đồng ý với người nuôi' : 'Chuyển cho Admin quyết định'} confirmLabel={answer ? 'Đồng ý và chốt' : 'Chuyển Admin'}
          variant={answer ? 'primary' : 'ink'} pending={reply.isPending} error={reply.error} onConfirm={() => reply.mutate({ agree: answer })} onClose={() => setAnswer(null)}>
          <p>
            {!answer ? 'Quyết định của Admin là quyết định cuối cùng.'
              : accepted ? 'Khiếu nại được chấp nhận và bạn được hoàn tiền phần bị ảnh hưởng.'
                : 'Khiếu nại đóng lại, không có tiền hoàn.'}
          </p>
        </OpConfirm>
      )}
    </>
  )
}

function OrderRating({ order }: { order: PreorderResponse }) {
  const userId = useAuthStore((s) => s.user?.userId) ?? 0
  const [done, setDone] = useState<OrderRatingResponse | null>(() => rememberedRating(userId, order.orderNo))
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const rate = useSend<OrderRatingResponse, RateOrderRequest>('post', `/api/preorders/${encodeURIComponent(order.orderNo)}/rating`, {
    success: 'Cảm ơn bạn đã đánh giá.', quietError: true, onSuccess: (r) => { rememberRating(userId, r); setDone(r) },
  })
  const shown = done?.stars ?? stars
  return (
    <div id="danh-gia" style={{ scrollMarginTop: 90 }}>
      <OpPanel title="Đánh giá đơn" subtitle="Mỗi đơn đánh giá một lần, gửi rồi không sửa được.">
        <div className="op-inline" role="radiogroup" aria-label="Số sao">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className="rd-iconbtn" role="radio" aria-checked={shown === n} aria-label={`${n} sao`} disabled={!!done} onClick={() => setStars(n)}
              style={{ color: n <= shown ? 'var(--accent)' : 'var(--faint)' }}>
              <Star size={18} fill={n <= shown ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
        {done ? (done.comment ? <p>{done.comment}</p> : null) : stars > 0 && (
          <>
            <TextArea value={comment} maxLength={1000} placeholder="Nhận xét (không bắt buộc)" aria-label="Nhận xét" onChange={(e) => setComment(e.target.value)} />
            {rate.isError && <OpNote tone="danger">{errorMessage(rate.error)}</OpNote>}
            <div className="op-formfoot">
              <OpBtn disabled={rate.isPending} onClick={() => rate.mutate({ stars, comment: comment.trim() || null })}>{rate.isPending ? 'Đang gửi…' : 'Gửi đánh giá'}</OpBtn>
            </div>
          </>
        )}
      </OpPanel>
    </div>
  )
}

export function OrderClaims({ order, deliveries }: { order: PreorderResponse; deliveries: OrderDeliveriesResponse }) {
  const userId = useAuthStore((s) => s.user?.userId) ?? 0
  const [claimNos, setClaimNos] = useState(() => rememberedClaims(userId, order.orderNo))
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' })

  const claims = useQueries({
    queries: claimNos.map((no) => ({
      queryKey: [claimUrl(no), undefined],
      queryFn: async ({ signal }: { signal: AbortSignal }) => (await http.get<ClaimResponse>(claimUrl(no), { signal })).data,
      retry: false,
    })),
  })
  const known = claims.flatMap((q) => (q.data ? [q.data] : []))
  const loading = claims.some((q) => q.isPending)
  const specName = (specCode: string) => order.lines.find((l) => l.specCode === specCode)?.specName ?? specCode
  const eligible = deliveries.shipments.filter((s) => inReturnWindow(s) && !known.some((c) => c.shipmentNo === s.shipmentNo))
  const remember = (claimNo: string) => setClaimNos(rememberClaim(userId, order.orderNo, claimNo))

  const find = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const claimNo = code.trim().toUpperCase()
    if (!claimNo) return
    setLookup({ busy: true, error: '' })
    try {
      const claim = (await http.get<ClaimResponse>(claimUrl(claimNo))).data
      if (claim.orderNo !== order.orderNo) return setLookup({ busy: false, error: `Khiếu nại ${claimNo} thuộc đơn ${claim.orderNo}.` })
      remember(claim.claimNo)
      setCode('')
      setLookup({ busy: false, error: '' })
    } catch (error) {
      setLookup({ busy: false, error: errorMessage(error) })
    }
  }

  return (
    <>
      <div id="khieu-nai" style={{ scrollMarginTop: 90 }}>
        <OpPanel title="Khiếu nại, trả hàng" subtitle="Gửi trong hạn đổi trả, kèm ảnh chụp. Mỗi chuyến giao một khiếu nại."
          action={eligible.length > 0 ? <OpBtn variant="ghost" sm onClick={() => setCreating(true)}>Gửi khiếu nại</OpBtn> : undefined}>
          {loading && <OpLoading label="Đang tải khiếu nại…" />}
          {known.map((c) => <ClaimCard key={c.claimNo} claim={c} />)}
          {known.length === 0 && !loading && <p className="rd-muted">{eligible.length > 0 ? 'Chưa có khiếu nại nào.' : 'Đã hết hạn đổi trả.'}</p>}
          <OpMore label="Mở khiếu nại theo mã">
            <form className="op-toolbar" onSubmit={find}>
              <Input sm className="op-toolbar__grow" value={code} placeholder="Mã khiếu nại" aria-label="Mã khiếu nại" onChange={(e) => setCode(e.target.value)} />
              <OpBtn type="submit" variant="ghost" sm disabled={lookup.busy || !code.trim()}><Search size={15} /> {lookup.busy ? 'Đang tìm…' : 'Mở'}</OpBtn>
            </form>
            {lookup.error && <OpNote tone="danger">{lookup.error}</OpNote>}
          </OpMore>
        </OpPanel>
      </div>
      {(order.status === 'Delivered' || order.status === 'Completed') && <OrderRating order={order} />}
      {creating && (
        <ClaimForm orderNo={order.orderNo} shipments={eligible} specName={specName} onClose={() => setCreating(false)}
          onDone={(claim) => { remember(claim.claimNo); setCreating(false) }} />
      )}
    </>
  )
}

/* Hộp xác nhận cho từng thao tác trên một quyết định phân hạng (BR-155…157, BR-017, BR-226):
   duyệt, giữ lại, xác nhận giữ, loại bỏ (multipart, kèm ảnh), đổi size hoặc hạng (multipart, kèm ảnh), nhập số thước kẹp.
   Mỗi hộp chỉ hiện ô bắt buộc; ô tuỳ chọn nằm trong phần gấp lại. Lỗi quy tắc từ API hiện ngay trong hộp. */
import { useState, type ReactNode } from 'react'
import type {
  ApproveDecisionRequest, GradeDecisionResponse, HoldDecisionRequest, MeasurementValuesRequest, SessionMeasurementsResponse,
} from '../../shared/api/api.gen'
import {
  DecimalInput, Field, OpConfirm, OpMore, OpNote, OpPhoto, RadioCards, Select, TextArea, label, specName, useSend,
} from '../../shared/ui/console'
import { Group } from './parts'
import { FOOD_SAFETY, LIVE_STATUS, gradesUpTo, isSubstandard, sizesUpTo } from './qc'

export type DialogKind = 'approve' | 'hold' | 'confirm' | 'reject' | 'revise' | 'caliper'

interface DialogProps {
  decision: GradeDecisionResponse
  onClose: () => void
  /** Sau khi nhập thước kẹp, hệ thống tạo phiên bản đề xuất mới; trả mã quyết định mới để trang bám theo. */
  onRemeasured?: (decisionNo: string | null) => void
}

const url = (d: GradeDecisionResponse, action: string) => `/api/grade-decisions/${encodeURIComponent(d.decisionNo)}/${action}`

/** Duyệt: hạng cuối chỉ bằng hoặc thấp hơn đề xuất; hạ hạng phải có lý do. Size theo cân, không đổi ở bước này. */
function ApproveDialog({ decision: d, onClose }: DialogProps) {
  const [grade, setGrade] = useState<string | null>(d.proposedGrade)
  const [sensory, setSensory] = useState('')
  const [reason, setReason] = useState('')
  const lowered = d.proposedGrade !== null && grade !== null && grade !== d.proposedGrade
  const send = useSend<GradeDecisionResponse, ApproveDecisionRequest>('post', url(d, 'approve'), {
    quietError: true,
    success: (res) => `Đã duyệt ${res.crabCode}: ${specName(null, res.finalSize, res.finalGrade)}.`,
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title={`Duyệt ${d.crabCode}`}
      sub={label('sizeCode', d.proposedSize)}
      confirmLabel="Duyệt hạng"
      pending={send.isPending}
      error={send.error}
      disabled={!grade || (lowered && !reason.trim())}
      onConfirm={() => send.mutate({ finalGrade: grade, sensoryNote: sensory.trim() || null, reason: reason.trim() || null })}
      onClose={onClose}
    >
      <Group title="Hạng cuối">
        <RadioCards<string>
          value={grade}
          onChange={setGrade}
          options={gradesUpTo(d.proposedGrade).map((g) => ({ value: g, label: label('gradeCode', g), hint: g === d.proposedGrade ? 'Đề xuất' : undefined }))}
        />
      </Group>
      {lowered && (
        <Field label="Lý do hạ hạng" required>
          <TextArea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      {isSubstandard(d.proposedSize, grade) && <OpNote>Cua dưới chuẩn, không vào quy cách đặt trước.</OpNote>}
      <OpMore label="Ghi chú cảm quan">
        <TextArea rows={2} maxLength={300} aria-label="Ghi chú cảm quan" value={sensory} onChange={(e) => setSensory(e.target.value)} />
      </OpMore>
    </OpConfirm>
  )
}

function HoldDialog({ decision: d, onClose }: DialogProps) {
  const [reason, setReason] = useState('')
  const send = useSend<GradeDecisionResponse, HoldDecisionRequest>('post', url(d, 'hold'), {
    quietError: true,
    success: 'Đã giữ lại, chờ người kiểm thứ hai.',
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title={`Giữ lại ${d.crabCode}`}
      sub="Người kiểm thứ hai sẽ quyết định con này."
      confirmLabel="Giữ lại"
      variant="ink"
      pending={send.isPending}
      error={send.error}
      disabled={reason.trim().length < 3}
      onConfirm={() => send.mutate({ reason: reason.trim() })}
      onClose={onClose}
    >
      <Field label="Lý do" required>
        <TextArea rows={3} maxLength={300} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </OpConfirm>
  )
}

function ConfirmHoldDialog({ decision: d, onClose }: DialogProps) {
  const send = useSend<GradeDecisionResponse, void>('post', url(d, 'confirm-hold'), {
    quietError: true,
    success: 'Đã xác nhận giữ. Giờ bạn duyệt hoặc loại.',
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title={`Xác nhận giữ ${d.crabCode}`}
      sub="Sau đó bạn duyệt hoặc loại con này."
      confirmLabel="Xác nhận giữ"
      pending={send.isPending}
      error={send.error}
      onConfirm={() => send.mutate()}
      onClose={onClose}
    >
      {d.reason && <OpNote>Lý do giữ lại: {d.reason}</OpNote>}
    </OpConfirm>
  )
}

function RejectDialog({ decision: d, onClose }: DialogProps) {
  const [live, setLive] = useState<string | null>(null)
  const [safety, setSafety] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const healthy = live === 'Alive' && safety === 'Pass'
  const send = useSend<GradeDecisionResponse, { LiveStatus: string; FoodSafety: string; Reason: string; Photo: File }>('post', url(d, 'reject'), {
    form: true,
    quietError: true,
    success: (res) => `Đã loại bỏ ${res.crabCode}.`,
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title={`Loại bỏ ${d.crabCode}`}
      sub="Cua bị loại sẽ tiêu huỷ, không hoàn lại được."
      confirmLabel="Loại bỏ"
      variant="danger"
      pending={send.isPending}
      error={send.error}
      disabled={!live || !safety || healthy || reason.trim().length < 3 || !photo}
      onConfirm={() => { if (live && safety && photo) send.mutate({ LiveStatus: live, FoodSafety: safety, Reason: reason.trim(), Photo: photo }) }}
      onClose={onClose}
    >
      <Group title="Tình trạng" required>
        <RadioCards<string> value={live} onChange={setLive} options={['Dead', 'Weak', 'Alive'].map((v) => ({ value: v, label: LIVE_STATUS[v] }))} />
      </Group>
      <Group title="An toàn thực phẩm" required>
        <RadioCards<string> value={safety} onChange={setSafety} options={['Fail', 'Pass'].map((v) => ({ value: v, label: FOOD_SAFETY[v] }))} />
      </Group>
      {healthy && <OpNote>Cua khoẻ và an toàn thì không loại.</OpNote>}
      <Field label="Lý do" required>
        <TextArea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Ảnh con cua" required>
        <OpPhoto value={photo} onChange={setPhoto} />
      </Field>
    </OpConfirm>
  )
}

/** Đổi size hoặc hạng của con đã duyệt: tạo phiên bản mới, không nâng quá số đo (các ô chọn chỉ có giá trị được phép). */
function ReviseDialog({ decision: d, onClose }: DialogProps) {
  const [size, setSize] = useState(d.finalSize ?? d.proposedSize ?? '')
  const [grade, setGrade] = useState(d.finalGrade ?? '')
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const same = size === d.finalSize && grade === d.finalGrade
  const send = useSend<GradeDecisionResponse, { FinalSize: string; FinalGrade: string; Reason: string; Photo: File }>('post', url(d, 'revise'), {
    form: true,
    quietError: true,
    success: (res) => `Đã đổi ${res.crabCode} thành ${specName(null, res.finalSize, res.finalGrade)}.`,
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title={`Đổi hạng ${d.crabCode}`}
      sub={`Hiện tại: ${specName(null, d.finalSize, d.finalGrade)}`}
      confirmLabel="Lưu"
      variant="ink"
      pending={send.isPending}
      error={send.error}
      disabled={!size || !grade || same || reason.trim().length < 3 || !photo}
      onConfirm={() => { if (photo) send.mutate({ FinalSize: size, FinalGrade: grade, Reason: reason.trim(), Photo: photo }) }}
      onClose={onClose}
    >
      <div className="op-form__row">
        <Field label="Size">
          <Select value={size} onChange={(e) => setSize(e.target.value)}>
            {sizesUpTo(d.proposedSize).map((s) => <option key={s} value={s}>{label('sizeCode', s)}</option>)}
          </Select>
        </Field>
        <Field label="Hạng">
          <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {gradesUpTo(d.proposedGrade).map((g) => <option key={g} value={g}>{label('gradeCode', g)}</option>)}
          </Select>
        </Field>
      </div>
      {!same && isSubstandard(size, grade) && <OpNote>Cua dưới chuẩn, rời quy cách đặt trước.</OpNote>}
      <Field label="Lý do" required>
        <TextArea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Ảnh căn cứ" required>
        <OpPhoto value={photo} onChange={setPhoto} />
      </Field>
    </OpConfirm>
  )
}

function CaliperDialog({ decision: d, onClose, onRemeasured }: DialogProps) {
  const [length, setLength] = useState<number | null>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [band, setBand] = useState<number | null>(null)
  const inRange = (v: number | null, min: number, max: number) => v === null || (v >= min && v <= max)
  const valid = (length !== null || width !== null || band !== null) && inRange(length, 1, 30) && inRange(width, 1, 40) && inRange(band, 0, 50)
  const send = useSend<SessionMeasurementsResponse, MeasurementValuesRequest>('post', `/api/measurement-sessions/${encodeURIComponent(d.sessionNo)}/values`, {
    quietError: true,
    success: 'Đã ghi số đo. Đề xuất được tính lại.',
    onSuccess: (res) => { onRemeasured?.(res.decision?.decisionNo ?? null); onClose() },
  })
  return (
    <OpConfirm
      title={`Thước kẹp ${d.crabCode}`}
      confirmLabel="Ghi số đo"
      variant="ink"
      pending={send.isPending}
      error={send.error}
      disabled={!valid}
      onConfirm={() => send.mutate({ carapaceLengthCm: length, carapaceWidthCm: width, edgeBandMm: band })}
      onClose={onClose}
    >
      <Field label="Dài mai (CL)" hint="1 đến 30 cm">
        <DecimalInput value={length} onChange={setLength} unit="cm" autoFocus />
      </Field>
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Rộng mai (CW)" hint="1 đến 40 cm">
            <DecimalInput value={width} onChange={setWidth} unit="cm" />
          </Field>
          <Field label="Dải mép soi đỏ" hint="0 đến 50 mm">
            <DecimalInput value={band} onChange={setBand} unit="mm" />
          </Field>
        </div>
      </OpMore>
    </OpConfirm>
  )
}

const DIALOGS: Record<DialogKind, (props: DialogProps) => ReactNode> = {
  approve: ApproveDialog, hold: HoldDialog, confirm: ConfirmHoldDialog, reject: RejectDialog, revise: ReviseDialog, caliper: CaliperDialog,
}

export function DecisionDialog({ kind, ...props }: DialogProps & { kind: DialogKind }) {
  const Dialog = DIALOGS[kind]
  return <Dialog {...props} />
}

/* Lượt đo một con cua (BR-151, BR-153, BR-224, BR-226), dùng khi đứng ở trạm: chọn cua, mở lượt đo, xem kết quả.
   Số đo chi tiết, kết quả AI và giờ giấc gấp lại; ô nhập thước kẹp tự mở khi đề xuất bị giữ vì ảnh hoặc AI.
   POST /api/measurement-sessions, GET /api/measurement-sessions/{no}/measurements, /images/{white|red}, POST /cancel, /values, /process. */
import { useState } from 'react'
import { Ban, RefreshCw, Ruler, Scale } from 'lucide-react'
import type {
  BatchResponse, CrabUnitResponse, DeviceResponse, GradeDecisionResponse, MeasurementValuesRequest, OpenSessionRequest, SessionMeasurementsResponse,
  SessionResponse,
} from '../../../shared/api/api.gen'
import {
  AuthImage, Checkbox, DecimalInput, Field, OpBadge, OpBtn, OpConfirm, OpFlow, OpKv, OpMore, OpPanel, OpTable, QueryView, Select, StatusBadge,
  formatDateTime, label, useGet, useSend, type FlowStep,
} from '../../../shared/ui/console'
import { enc, fmtNum } from './common'
import './sales.css'

/** Lý do giữ lại mà người nuôi tự gỡ được bằng thước kẹp. */
const CALIPER_HOLDS = ['CaliperRequired', 'ImageQuality', 'LowConfidence']

/** Chọn cua và mở lượt đo. Mặc định đo bằng trạm; đo tay và đổi trạm nằm trong "Tuỳ chọn thêm". */
export function OpenSessionForm({ batch, measured, onOpened }: {
  batch: BatchResponse
  /** Mã các con đã có đề xuất phân hạng hiện hành. */
  measured: Set<string>
  onOpened: (sessionNo: string) => void
}) {
  const crabs = useGet<CrabUnitResponse[]>(`/api/batches/${enc(batch.batchCode)}/crab-units`, { status: batch.hasHolding ? 'Holding' : 'Received' })
  const devices = useGet<DeviceResponse[]>('/api/operators/me/devices')
  const stations = (devices.data ?? []).filter((d) => d.deviceType === 'Station' && d.status !== 'Removed')
  const [byHand, setByHand] = useState(false)
  const [station, setStation] = useState('')
  const [crabCode, setCrabCode] = useState('')
  const open = useSend<SessionResponse, OpenSessionRequest>('post', '/api/measurement-sessions', {
    onSuccess: (s) => { setCrabCode(''); onOpened(s.sessionNo) },
  })
  const noStation = devices.isSuccess && stations.length === 0
  const manual = byHand || noStation
  const stationCode = station || stations[0]?.deviceCode || ''
  const valid = !!crabCode && (manual || !!stationCode)
  const sorted = [...(crabs.data ?? [])].sort((a, b) => Number(measured.has(a.crabCode)) - Number(measured.has(b.crabCode)))

  return (
    <form
      className="op-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) open.mutate({ crabCode, procedure: manual ? 'Manual' : 'Station', stationCode: manual ? null : stationCode })
      }}
    >
      <Field label={`Con cua cần đo (còn ${sorted.filter((c) => !measured.has(c.crabCode)).length} con chưa đo)`} hint={noStation ? 'Chưa có trạm đo, sẽ đo tay' : undefined}>
        <Select value={crabCode} onChange={(e) => setCrabCode(e.target.value)} required>
          <option value="">Chọn mã cua</option>
          {sorted.map((c) => (
            <option key={c.crabCode} value={c.crabCode}>
              {c.crabCode}{c.currentSlotCode ? ` · hộp ${c.currentSlotCode}` : ''}{measured.has(c.crabCode) ? ' · đã đo' : ''}
            </option>
          ))}
        </Select>
      </Field>
      <OpBtn type="submit" full disabled={!valid || open.isPending}><Scale size={17} /> {open.isPending ? 'Đang mở…' : manual ? 'Mở lượt đo tay' : `Mở lượt đo ở trạm ${stationCode}`}</OpBtn>
      {!noStation && (
        <OpMore label="Tuỳ chọn thêm">
          <div className="op-form">
            {stations.length > 1 && !byHand && (
              <Field label="Trạm đo">
                <Select value={stationCode} onChange={(e) => setStation(e.target.value)}>
                  {stations.map((d) => <option key={d.deviceCode} value={d.deviceCode}>{d.deviceCode} · {label('device', d.status)}</option>)}
                </Select>
              </Field>
            )}
            <Checkbox checked={byHand} onChange={setByHand}>Đo tay bằng cân và thước kẹp</Checkbox>
          </div>
        </OpMore>
      )}
    </form>
  )
}

const waitingFor = (status: string | undefined) => status === 'Open' || status === 'Received'

/** Các bước còn chờ của một lượt đo chưa có kết quả. */
function waitingSteps(s: SessionResponse): FlowStep[] {
  if (s.status === 'Failed') return [{ title: 'Lượt đo lỗi, mở lượt đo mới', sub: s.failReason ?? undefined, state: 'bad' }]
  if (s.procedure === 'Manual') return [{ title: 'Đã mở lượt đo', state: 'done' }, { title: 'Cân tay, đo mai rồi nhập số đo bên dưới', state: 'now' }]
  return [
    { title: 'Đã mở lượt đo', state: 'done' },
    { title: `Đặt cua lên trạm ${s.stationCode ?? ''}`, state: s.status === 'Open' ? 'now' : 'done' },
    { title: 'Trạm cân và chụp ảnh, hệ thống xử lý', state: s.status === 'Received' ? 'now' : 'todo' },
  ]
}

function Result({ d, weightG }: { d: GradeDecisionResponse; weightG: number | null }) {
  const size = d.finalSize ?? d.proposedSize
  const grade = d.finalGrade ?? d.proposedGrade
  return (
    <div className="os-item">
      <div className="op-between">
        <span className="op-big">
          {[size ? label('sizeCode', size) : null, grade ? label('gradeCode', grade) : null].filter(Boolean).join(' · ') || 'Chưa đủ số đo'}
          {weightG !== null && <small> {fmtNum(weightG)} g</small>}
        </span>
        <StatusBadge kind="grade" value={d.status} />
      </div>
      {d.holdReasons.length > 0 && <div className="op-inline">{d.holdReasons.map((r) => <StatusBadge key={r} kind="holdReason" value={r} />)}</div>}
    </div>
  )
}

/** Kết quả của một lượt đo; tự hỏi lại khi còn chờ trạm. */
export function SessionView({ sessionNo, roe, onClose }: { sessionNo: string; /** Cua gạch cần thêm số đo dải mép khi soi đỏ. */ roe: boolean; onClose: () => void }) {
  const path = `/api/measurement-sessions/${enc(sessionNo)}`
  const data = useGet<SessionMeasurementsResponse>(`${path}/measurements`, undefined, {
    refetchInterval: (q) => (waitingFor(q.state.data?.session.status) ? 4000 : false),
  })
  const [cancelling, setCancelling] = useState(false)
  const cancel = useSend<SessionResponse, void>('post', `${path}/cancel`, { success: 'Đã huỷ lượt đo.', quietError: true, onSuccess: () => setCancelling(false) })
  const reprocess = useSend<SessionMeasurementsResponse, void>('post', `${path}/process`, { success: 'Đã xử lý lại lượt đo.' })

  return (
    <QueryView query={data}>
      {({ session: s, values, inferences, decision }) => {
        const manual = s.procedure === 'Manual'
        const canEnter = manual ? s.status === 'Open' || s.status === 'Measured' : s.status === 'Measured'
        const needCaliper = !!decision && decision.holdReasons.some((r) => CALIPER_HOLDS.includes(r))
        const form = <ManualValuesForm key={`${s.sessionNo}-${values.length}`} session={s} roe={roe} />
        return (
          <OpPanel
            accent
            title={`Cua ${s.crabCode}`}
            action={<span className="op-inline"><StatusBadge kind="session" value={s.status} /><OpBtn sm variant="ghost" onClick={onClose}>Đóng</OpBtn></span>}
          >
            {decision ? <Result d={decision} weightG={s.weightG} /> : s.status !== 'Cancelled' && <OpFlow steps={waitingSteps(s)} />}

            {(s.hasWhiteImage || s.hasRedImage) && (
              <div className="op-thumbs">
                {s.hasWhiteImage && <figure><AuthImage path={`${path}/images/white`} alt={`Ảnh đèn trắng của ${s.crabCode}`} /><figcaption>Đèn trắng</figcaption></figure>}
                {s.hasRedImage && <figure><AuthImage path={`${path}/images/red`} alt={`Ảnh soi đỏ của ${s.crabCode}`} /><figcaption>Soi đỏ</figcaption></figure>}
              </div>
            )}

            {canEnter && (manual && s.status === 'Open'
              ? form
              : <OpMore label={manual ? 'Sửa số đo tay' : 'Bổ sung số đo thước kẹp'} defaultOpen={needCaliper}>{form}</OpMore>)}

            {(values.length > 0 || inferences.length > 0) && (
              <OpMore label="Số đo chi tiết" count={values.length}>
                <div className="op-stack">
                  <OpKv items={[
                    { label: 'Lượt đo', value: <span className="op-mono">{s.sessionNo}</span> },
                    { label: 'Trạm đo', value: s.stationCode ?? 'Đo tay' },
                    { label: 'Mở lúc', value: formatDateTime(s.openedAt) },
                    { label: 'Nhận bản tin lúc', value: formatDateTime(s.receivedAt) },
                    { label: 'Chỉ số C', value: decision?.cIndex === null || decision?.cIndex === undefined ? null : fmtNum(decision.cIndex) },
                  ]} />
                  {values.length > 0 && (
                    <OpTable
                      rows={values}
                      rowKey={(v, i) => `${v.metric}-${v.recordedAt}-${i}`}
                      columns={[
                        { key: 'metric', header: 'Số đo', cell: (v) => label('metric', v.metric) },
                        { key: 'value', header: 'Giá trị', num: true, cell: (v) => <b>{fmtNum(v.value)} {v.unit}</b> },
                        { key: 'method', header: 'Cách đo', cell: (v) => <>{label('measureMethod', v.method)}{v.confidence !== null && <span className="os-sub">Độ tin cậy {fmtNum(v.confidence)}</span>}</> },
                      ]}
                    />
                  )}
                  {inferences.map((a, i) => (
                    <div key={`${a.imageKind}-${i}`} className="op-between">
                      <span>AI đọc ảnh {a.imageKind === 'Red' ? 'soi đỏ' : 'đèn trắng'}{a.errorReason ? `: ${a.errorReason}` : ''}</span>
                      <span className="op-inline">
                        {a.isSimulated && <OpBadge tone="warn">Số giả lập</OpBadge>}
                        <StatusBadge kind="imageQuality" value={a.imageQuality} />
                        <StatusBadge kind="ai" value={a.status} />
                      </span>
                    </div>
                  ))}
                </div>
              </OpMore>
            )}

            {waitingFor(s.status) && (
              <div className="op-formfoot">
                {s.status === 'Received' && <OpBtn sm variant="ghost" onClick={() => reprocess.mutate()} disabled={reprocess.isPending}><RefreshCw size={15} /> Xử lý lại</OpBtn>}
                {s.status === 'Open' && <OpBtn sm variant="ghost" onClick={() => { cancel.reset(); setCancelling(true) }}><Ban size={15} /> Huỷ lượt đo</OpBtn>}
              </div>
            )}

            {cancelling && (
              <OpConfirm
                title="Huỷ lượt đo"
                sub={`Cua ${s.crabCode}`}
                confirmLabel="Huỷ lượt đo"
                variant="danger"
                pending={cancel.isPending}
                error={cancel.error}
                onConfirm={() => cancel.mutate()}
                onClose={() => setCancelling(false)}
              />
            )}
          </OpPanel>
        )
      }}
    </QueryView>
  )
}

/** Nhập số đo tay: lượt đo tay cần khối lượng trước; lượt đo bằng trạm chỉ bổ sung số thước kẹp. */
function ManualValuesForm({ session, roe }: { session: SessionResponse; roe: boolean }) {
  const manual = session.procedure === 'Manual'
  const [weightG, setWeightG] = useState<number | null>(null)
  const [lengthCm, setLengthCm] = useState<number | null>(null)
  const [widthCm, setWidthCm] = useState<number | null>(null)
  const [bandMm, setBandMm] = useState<number | null>(null)
  const save = useSend<SessionMeasurementsResponse, MeasurementValuesRequest>('post', `/api/measurement-sessions/${enc(session.sessionNo)}/values`, {
    success: 'Đã ghi số đo.',
  })
  const needWeight = manual && session.status === 'Open'
  const any = weightG !== null || lengthCm !== null || widthCm !== null || bandMm !== null
  const valid = any && (!needWeight || weightG !== null)
  const band = <Field label="Dải mép khi soi đỏ"><DecimalInput value={bandMm} onChange={setBandMm} unit="mm" /></Field>

  return (
    <form
      className="op-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) save.mutate({ weightG: manual ? weightG : null, carapaceLengthCm: lengthCm, carapaceWidthCm: widthCm, edgeBandMm: bandMm })
      }}
    >
      <div className="op-form__row">
        {manual && <Field label="Khối lượng cân tay" required={needWeight}><DecimalInput value={weightG} onChange={setWeightG} unit="g" /></Field>}
        <Field label="Chiều dài mai"><DecimalInput value={lengthCm} onChange={setLengthCm} unit="cm" /></Field>
        {roe && band}
      </div>
      <OpMore label="Tuỳ chọn thêm">
        <div className="op-form__row">
          <Field label="Chiều rộng mai"><DecimalInput value={widthCm} onChange={setWidthCm} unit="cm" /></Field>
          {!roe && band}
        </div>
      </OpMore>
      <div className="op-formfoot">
        <OpBtn type="submit" variant="ink" disabled={!valid || save.isPending}><Ruler size={17} /> {save.isPending ? 'Đang ghi…' : 'Ghi số đo'}</OpBtn>
      </div>
    </form>
  )
}

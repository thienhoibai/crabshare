/* Lượt đo một con cua (BR-151, BR-153, BR-224, BR-226), dùng khi đứng ở trạm: chọn cua, mở lượt đo, xem kết quả.
   Số đo chi tiết, kết quả AI và giờ giấc gấp lại; ô nhập thước kẹp tự mở khi đề xuất bị giữ vì ảnh hoặc AI.
   POST /api/measurement-sessions, GET /api/measurement-sessions/{no}/measurements, /images/{white|red}, POST /cancel, /values, /process. */
import { useEffect, useRef, useState } from 'react'
import { Ban, RefreshCw, Ruler, Scale } from 'lucide-react'
import type {
  BatchResponse, CrabUnitResponse, DeviceResponse, GradeAiLabelsRequest, GradeAiLabelsResponse, GradeDecisionResponse,
  MeasurementValuesRequest, OpenSessionRequest, SessionMeasurementsResponse,
  SessionResponse,
} from '../../../shared/api/api.gen'
import {
  AuthImage, Checkbox, DecimalInput, Field, OpBadge, OpBtn, OpConfirm, OpFlow, OpKv, OpMore, OpNote, OpPanel, OpTable, QueryView, Select, StatusBadge,
  formatDateTime, label, useGet, useSend, type FlowStep,
} from '../../../shared/ui/console'
import { http } from '../../../shared/api/http'
import { enc, fmtNum } from './common'
import './sales.css'

/** Lý do giữ lại mà người nuôi tự gỡ được bằng thước kẹp. */
const CALIPER_HOLDS = ['CaliperRequired', 'ImageQuality', 'LowConfidence']

/** Chọn cua và mở lượt đo tự động theo Mã lô (CS-2609-04-001, 002...), tự động tiếp nối vị trí chưa chụp và có tuỳ chọn chọn vị trí bắt đầu. */
export function OpenSessionForm({ batch, measured, onOpened, fixedStationCode, allowManual = true, activeOpen }: {
  batch: BatchResponse
  /** Mã các con đã có đề xuất phân hạng hiện hành. */
  measured: Set<string>
  onOpened: (sessionNo: string) => void
  fixedStationCode?: string
  allowManual?: boolean
  activeOpen?: SessionResponse
}) {
  const crabs = useGet<CrabUnitResponse[]>(`/api/batches/${enc(batch.batchCode)}/crab-units`, { status: batch.hasHolding ? 'Holding' : 'Received' })
  const devices = useGet<DeviceResponse[]>('/api/operators/me/devices')
  const stations = (devices.data ?? []).filter((d) => d.deviceType === 'Station' && d.status !== 'Removed'
    && (!fixedStationCode || d.deviceCode === fixedStationCode))
  const [byHand, setByHand] = useState(false)
  const [station, setStation] = useState('')
  const [crabCode, setCrabCode] = useState('')
  const [startFromNumber, setStartFromNumber] = useState<number | null>(null)
  const [customNumberDraft, setCustomNumberDraft] = useState('')
  const [autoAdvance, setAutoAdvance] = useState<boolean>(Boolean(fixedStationCode))
  const [switchingPos, setSwitchingPos] = useState(false)
  const autoLabeledBatchRef = useRef<string>('')
  const lastAutoOpenedTagRef = useRef<string>('')

  const assign = useSend<GradeAiLabelsResponse, GradeAiLabelsRequest>('post', `/api/batches/${enc(batch.batchCode)}/gradeai-labels`, {
    quietError: true,
    onSuccess: () => { void crabs.refetch() },
  })
  const open = useSend<SessionResponse, OpenSessionRequest>('post', '/api/measurement-sessions', {
    onSuccess: (s) => {
      setCrabCode('')
      void crabs.refetch()
      onOpened(s.sessionNo)
    },
  })

  const noStation = devices.isSuccess && stations.length === 0
  const manual = allowManual && (byHand || noStation)
  const stationCode = station || stations[0]?.deviceCode || ''
  const prefix = batch.batchCode.trim().toUpperCase()

  const orderedCrabs = [...(crabs.data ?? [])].sort((a, b) => a.crabCode.localeCompare(b.crabCode))
  const entries = orderedCrabs.map((crab, idx) => {
    const parsedNum = crab.gradeAiTag?.toUpperCase().startsWith(`${prefix}-`)
      ? Number(crab.gradeAiTag.split('-').at(-1)) || (idx + 1)
      : (idx + 1)
    const tag = `${prefix}-${String(parsedNum).padStart(3, '0')}`
    const isMeasured = measured.has(crab.crabCode)
    return { crab, num: parsedNum, tag, isMeasured }
  })

  const allTaggedWithBatchPrefix = entries.length > 0 && entries.every(
    (e) => e.crab.gradeAiTag?.toUpperCase() === e.tag,
  )

  // Tự động gắn mã CS-2609-04-001..N cho các con cua trong lô nếu chưa gắn
  useEffect(() => {
    if (manual || !crabs.isSuccess || entries.length === 0 || allTaggedWithBatchPrefix || activeOpen) return
    if (assign.isPending || autoLabeledBatchRef.current === prefix) return
    autoLabeledBatchRef.current = prefix
    assign.mutate({
      prefix,
      labels: entries.map((e) => ({ crabCode: e.crab.crabCode, crabNumber: e.num })),
    })
  }, [manual, crabs.isSuccess, entries, allTaggedWithBatchPrefix, activeOpen, assign, prefix])

  // Tìm vị trí vừa hoàn thành gần nhất để tự động tiếp nối (ví dụ st19 vừa xong -> tiếp tục số 20)
  const completedNums = entries.filter((e) => e.isMeasured).map((e) => e.num)
  const lastCompletedNum = completedNums.length > 0 ? Math.max(...completedNums) : 0
  const unmeasuredEntries = entries.filter((e) => !e.isMeasured)

  const defaultNextEntry =
    unmeasuredEntries.find((e) => e.num > lastCompletedNum) ??
    unmeasuredEntries[0] ??
    null

  const targetEntry =
    (startFromNumber !== null
      ? unmeasuredEntries.find((e) => e.num >= startFromNumber) ?? entries.find((e) => e.num === startFromNumber)
      : defaultNextEntry) ?? defaultNextEntry

  // Tự động mở lượt cho vị trí tiếp theo khi trạm rảnh
  useEffect(() => {
    if (!autoAdvance || manual || !stationCode || activeOpen || !targetEntry || targetEntry.isMeasured) return
    if (!allTaggedWithBatchPrefix || open.isPending || assign.isPending || switchingPos) return
    if (lastAutoOpenedTagRef.current === targetEntry.tag) return
    lastAutoOpenedTagRef.current = targetEntry.tag
    open.mutate({
      crabCode: null,
      batchCode: batch.batchCode,
      gradeAiPrefix: prefix,
      crabNumber: targetEntry.num,
      procedure: 'Station',
      stationCode,
    })
  }, [
    autoAdvance,
    manual,
    stationCode,
    activeOpen,
    targetEntry,
    allTaggedWithBatchPrefix,
    open,
    assign.isPending,
    switchingPos,
    batch.batchCode,
    prefix,
  ])

  async function switchOrOpenPosition(num: number | null) {
    setStartFromNumber(num)
    if (num !== null) setCustomNumberDraft(String(num))
    else setCustomNumberDraft('')

    const chosen =
      (num !== null
        ? unmeasuredEntries.find((e) => e.num >= num) ?? entries.find((e) => e.num === num)
        : defaultNextEntry) ?? defaultNextEntry

    if (!chosen || chosen.isMeasured || manual || !stationCode) return
    if (activeOpen && activeOpen.gradeAiTag === chosen.tag) return

    try {
      setSwitchingPos(true)
      if (activeOpen && activeOpen.status === 'Open') {
        await http.post(`/api/measurement-sessions/${enc(activeOpen.sessionNo)}/cancel`)
      }
      lastAutoOpenedTagRef.current = chosen.tag
      open.mutate({
        crabCode: allTaggedWithBatchPrefix ? null : chosen.crab.crabCode,
        batchCode: batch.batchCode,
        gradeAiPrefix: prefix,
        crabNumber: chosen.num,
        procedure: 'Station',
        stationCode,
      })
    } finally {
      setSwitchingPos(false)
    }
  }

  const valid = manual
    ? !!crabCode
    : !!(stationCode && targetEntry && !targetEntry.isMeasured)

  return (
    <form
      className="op-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        if (manual) {
          open.mutate({ crabCode, procedure: 'Manual' })
        } else if (targetEntry) {
          lastAutoOpenedTagRef.current = targetEntry.tag
          open.mutate({
            crabCode: allTaggedWithBatchPrefix ? null : targetEntry.crab.crabCode,
            batchCode: batch.batchCode,
            gradeAiPrefix: prefix,
            crabNumber: targetEntry.num,
            procedure: 'Station',
            stationCode,
          })
        }
      }}
    >
      {!manual && (
        <div className="op-stack" style={{ gap: 10 }}>
          {activeOpen ? (
            <OpNote tone="info">
              <div className="op-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span>
                  Trạm đang mở sẵn vị trí <b>{activeOpen.gradeAiTag ?? activeOpen.crabCode}</b>
                  {lastCompletedNum > 0
                    ? ` (tiếp nối sau vị trí #${String(lastCompletedNum).padStart(3, '0')} vừa hoàn thành)`
                    : ' (bắt đầu từ đầu lô)'}
                  . Đặt cua lên khay, đóng cửa và nhấn nút vật lý trên trạm.
                </span>
                <OpBtn sm variant="ghost" type="button" onClick={() => onOpened(activeOpen.sessionNo)}>
                  Chi tiết / Huỷ lượt này
                </OpBtn>
              </div>
            </OpNote>
          ) : unmeasuredEntries.length === 0 && entries.length > 0 ? (
            <OpNote tone="ok">
              Đã hoàn thành cân toàn bộ <b>{entries.length}/{entries.length}</b> con cua trong lô <b>{prefix}</b>.
            </OpNote>
          ) : targetEntry ? (
            <OpNote tone="info">
              <div className="op-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span>
                  Mã tự động tiếp theo: <b>{targetEntry.tag}</b> (mã kiểm kê <code>{targetEntry.crab.crabCode}</code>
                  {targetEntry.crab.currentSlotCode ? ` · hộp ${targetEntry.crab.currentSlotCode}` : ''}) ·{' '}
                  {lastCompletedNum > 0
                    ? `Vị trí #${String(lastCompletedNum).padStart(3, '0')} đã xong → tiếp tục #${String(targetEntry.num).padStart(3, '0')}`
                    : `Còn ${unmeasuredEntries.length}/${entries.length} con chưa chụp`}
                </span>
                <OpBtn
                  sm
                  type="submit"
                  disabled={!valid || open.isPending || switchingPos}
                >
                  <Scale size={15} /> {open.isPending || switchingPos ? 'Đang chuyển…' : `Mở ngay ${targetEntry.tag}`}
                </OpBtn>
              </div>
            </OpNote>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
              alignItems: 'end',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(21, 19, 15, 0.03)',
              border: '1px solid rgba(21, 19, 15, 0.08)',
            }}
          >
            <Field label="Mã lô tự động (tăng dần)" hint={`Đã xong ${completedNums.length}/${entries.length} con`}>
              <input
                className="op-input"
                value={activeOpen?.gradeAiTag ?? targetEntry?.tag ?? `${prefix}-001`}
                readOnly
                style={{ fontWeight: 700 }}
              />
            </Field>

            <Field
              label="Tuỳ chọn bắt đầu từ vị trí"
              hint={
                startFromNumber === null
                  ? `Mặc định: tự tiếp nối (#${String(defaultNextEntry?.num ?? 1).padStart(3, '0')})`
                  : `Đang chọn bắt đầu từ vị trí #${String(startFromNumber).padStart(3, '0')}`
              }
            >
              <Select
                value={startFromNumber === null ? '' : String(startFromNumber)}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null
                  void switchOrOpenPosition(val)
                }}
              >
                <option value="">
                  Mặc định (tự tiếp nối từ vị trí chưa chụp #{String(defaultNextEntry?.num ?? 1).padStart(3, '0')})
                </option>
                {entries.map((e) => (
                  <option key={e.crab.crabCode} value={String(e.num)} disabled={e.isMeasured}>
                    Vị trí #{String(e.num).padStart(3, '0')} · {e.tag} ({e.isMeasured ? 'Đã hoàn thành' : 'Chưa chụp'})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Hoặc nhập nhanh số thứ tự bắt đầu" hint="Ví dụ nhập 20 để nhảy tới số 20">
              <div className="op-inline" style={{ gap: 6 }}>
                <input
                  className="op-input"
                  inputMode="numeric"
                  placeholder={String(defaultNextEntry?.num ?? 1).padStart(3, '0')}
                  value={customNumberDraft}
                  maxLength={6}
                  onChange={(e) => setCustomNumberDraft(e.target.value.replace(/[^0-9]/g, ''))}
                />
                <OpBtn
                  type="button"
                  sm
                  variant="ghost"
                  disabled={!customNumberDraft || switchingPos || open.isPending}
                  onClick={() => {
                    const num = Number(customNumberDraft)
                    if (num >= 1) void switchOrOpenPosition(num)
                  }}
                >
                  Đặt vị trí
                </OpBtn>
                {startFromNumber !== null && (
                  <OpBtn
                    type="button"
                    sm
                    variant="ghost"
                    onClick={() => void switchOrOpenPosition(null)}
                  >
                    Về mặc định
                  </OpBtn>
                )}
              </div>
            </Field>
          </div>

          <div className="op-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Checkbox checked={autoAdvance} onChange={setAutoAdvance}>
              Tự động mở lượt kế tiếp sau mỗi con hoàn thành (và khi khởi động lại)
            </Checkbox>
            {!activeOpen && targetEntry && (
              <OpBtn type="submit" sm disabled={!valid || open.isPending || switchingPos}>
                <Scale size={15} /> {open.isPending ? 'Đang mở…' : `Mở lượt ${targetEntry.tag} ở trạm ${stationCode}`}
              </OpBtn>
            )}
          </div>
        </div>
      )}

      {manual && (
        <>
          <Field label="Con cua cần đo tay" hint={noStation ? 'Chưa có trạm đo, sẽ đo tay' : undefined}>
            <Select value={crabCode} onChange={(e) => setCrabCode(e.target.value)} required>
              <option value="">Chọn mã cua</option>
              {entries.map((e) => (
                <option key={e.crab.crabCode} value={e.crab.crabCode}>
                  {e.tag} · {e.crab.crabCode}
                  {e.crab.currentSlotCode ? ` · hộp ${e.crab.currentSlotCode}` : ''}
                  {e.isMeasured ? ' · đã đo' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <OpBtn type="submit" full disabled={!valid || open.isPending}>
            <Scale size={17} /> {open.isPending ? 'Đang mở…' : 'Mở lượt đo tay'}
          </OpBtn>
        </>
      )}

      {!noStation && allowManual && (
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
    { title: `Đặt cua lên trạm ${s.stationCode ?? ''}`, sub: 'Đóng cửa, đợi LED xanh dương nhấp nháy rồi nhấn nút trên trạm.', state: s.status === 'Open' ? 'now' : 'done' },
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
            title={`Cua ${s.gradeAiTag ?? s.crabCode}`}
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

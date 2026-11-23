import { useEffect, useRef, useState } from 'react'
import { OpNote, formatDateTime, useGet } from '../../../shared/ui/console'

export interface StationState {
  hardwareOnline: boolean
  busy: boolean
  doorClosed: boolean | null
  buttonPressed: boolean | null
  calibrationValid: boolean
  crabTag: string | null
  sessionNo: string | null
  phase: string
  note: string | null
  rgb: string | null
  blinking: boolean
  whiteOn: boolean
  redOn: boolean
  weightG: number | null
  instantG?: number | null
  rawSpreadG?: number | null
  filteredSpreadG?: number | null
  sampleCount?: number | null
  outlierCount?: number | null
  scaleStable?: boolean | null
  scaleReason?: string | null
  tofMm: number | null
  cameraStatus: string | null
  runId: string | null
  runStatus: string | null
  step: string | null
  completed: string[]
  sensorError: string | null
  webStartReady?: boolean
}

export interface RuntimeResponse {
  receivedAt: string | null
  fresh: boolean
  state: StationState | null
}

const STEPS = [
  ['preflight', 'Kiểm tra trạm'],
  ['weighing', 'Cân ổn định'],
  ['distance', 'Đo khoảng cách'],
  ['capture_white', 'Ảnh đèn trắng'],
  ['capture_red', 'Ảnh đèn soi'],
  ['saving', 'Lưu kết quả'],
] as const

const LED_META: Record<string, [string, string]> = {
  off: ['Tắt', '#9b978f'],
  cyan: ['Xanh lơ', '#0891b2'],
  yellow: ['Vàng', '#ca8a04'],
  purple: ['Tím', '#9333ea'],
  blue: ['Xanh dương', '#2563eb'],
  red: ['Đỏ', '#dc2626'],
  green: ['Xanh lục', '#16a34a'],
}

function fmt(v: number | null | undefined, digits = 1): string {
  return typeof v === 'number' && Number.isFinite(v)
    ? v.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—'
}

export function StationRuntime({
  code,
  onStateChange,
}: {
  code: string
  onStateChange?: (report: RuntimeResponse | undefined) => void
}) {
  const runtime = useGet<RuntimeResponse>(`/api/operators/me/devices/${encodeURIComponent(code)}/station-state`, undefined, {
    refetchInterval: 1500,
    retry: false,
  })
  const [samples, setSamples] = useState<number[]>([])
  const lastStampRef = useRef<string | null>(null)

  useEffect(() => {
    onStateChange?.(runtime.isError ? undefined : runtime.data)
    const w = runtime.data?.state?.weightG
    const stamp = runtime.data?.receivedAt ?? null
    if (typeof w === 'number' && Number.isFinite(w) && stamp && stamp !== lastStampRef.current) {
      lastStampRef.current = stamp
      setSamples((prev) => [...prev.slice(-44), w])
    }
  }, [runtime.data, runtime.isError, onStateChange])

  if (runtime.isPending) return <p role="status">Đang nhận trạng thái từ trạm…</p>
  if (runtime.isError) {
    return (
      <OpNote tone="danger">
        Chưa tải được trạng thái trạm.{' '}
        <button className="op-link" type="button" onClick={() => void runtime.refetch()}>
          Thử lại
        </button>
      </OpNote>
    )
  }

  const report = runtime.data
  const s = report.state
  const online = !!(s && report.fresh && s.hardwareOnline)
  const rgbKey = s?.rgb && LED_META[s.rgb] ? s.rgb : 'off'
  const [rgbName, rgbHex] = LED_META[rgbKey]

  const statusTitle = !s
    ? 'Trạm chưa gửi trạng thái'
    : !online
      ? 'Trạm chưa có tín hiệu mới'
      : s.busy
        ? STEPS.find(([k]) => k === s.step)?.[1] ?? 'Đang chạy lượt đo'
        : s.doorClosed === false
          ? 'Chờ đóng cửa'
          : rgbKey === 'blue' && s.blinking
            ? 'Sẵn sàng bắt đầu cân'
            : rgbKey === 'green'
              ? 'Đã lưu kết quả tại Pi'
              : rgbKey === 'red'
                ? 'Trạm cần kiểm tra'
                : rgbKey === 'purple'
                  ? 'Kiểm tra mã cua'
                  : 'Sẵn sàng'

  const statusNote = !s
    ? 'Kiểm tra URL API, mã và khóa thiết bị trên Pi.'
    : !online
      ? `Lần nhận gần nhất ${formatDateTime(report.receivedAt) || 'chưa có'}. Kiểm tra nguồn và mạng của Pi.`
      : s.note || 'Trạm đang kết nối trực tiếp.'

  const sparkPath = (() => {
    if (samples.length === 0) return ''
    const list = samples.length === 1 ? [samples[0], samples[0]] : samples
    const min = Math.min(...list)
    const max = Math.max(...list)
    const span = max - min || 1
    return list
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * 300) / Math.max(list.length - 1, 1)},${30 - ((v - min) / span) * 24}`)
      .join(' ')
  })()

  const stable = s?.scaleStable ?? (s?.rawSpreadG != null ? s.rawSpreadG <= 0.2 : s?.weightG != null)
  const weightCaption = !online || s?.weightG == null
    ? 'Chưa có số đo'
    : stable
      ? 'Đã ổn định'
      : s?.scaleReason || 'Đang lọc dao động cân'

  return (
    <div className="ga-shell">
      <article className="ga-card ga-progress" aria-label="Tiến trình lượt đo">
        <div className="ga-progress-head">
          <div>
            <h2>Tiến trình lượt đo</h2>
            <div className="ga-message" role="status">
              <b data-tone={online ? rgbKey : 'red'}>{statusTitle}</b>
              <span>{statusNote}</span>
            </div>
          </div>
          <span className={`ga-tag ${online ? 'ga-tag--good' : ''}`}>
            {online ? `● Pi đang kết nối · ${code}` : `● Mất tín hiệu · ${code}`}
          </span>
        </div>

        <div className="ga-signals" aria-label="Tín hiệu đèn của Pi">
          <span>
            <i
              className={`ga-dot ${s?.blinking ? 'is-blinking' : ''}`}
              style={{ background: rgbHex }}
              aria-hidden="true"
            />
            <b>
              Tín hiệu RGB · {rgbName}
              {s?.blinking ? ' nhấp nháy' : ''}
            </b>
          </span>
          <span className={s?.whiteOn ? 'is-on' : ''}>Đèn trắng · {s?.whiteOn ? 'Có tín hiệu' : 'Tắt'}</span>
          <span className={s?.redOn ? 'is-on' : ''}>Đèn soi · {s?.redOn ? 'Có tín hiệu' : 'Tắt'}</span>
          <span>Hiệu chuẩn · {s?.calibrationValid ? 'Còn hạn trên Pi' : 'Cần kiểm tra'}</span>
        </div>

        {s?.sensorError && <OpNote tone="danger">{s.sensorError}</OpNote>}

        <ol className="ga-steps" aria-label="Các bước cân tại trạm">
          {STEPS.map(([key, title]) => {
            const done = s?.completed.includes(key)
            const active = s?.runStatus === 'running' && s.step === key
            const failed = ['error', 'cancelled'].includes(s?.runStatus ?? '') && s?.step === key
            const preflightReady = !s?.runStatus && key === 'preflight' && rgbKey === 'blue' && s?.blinking && s?.doorClosed
            return (
              <li
                key={key}
                className={done || preflightReady ? 'is-done' : failed ? 'is-error' : active ? 'is-running' : ''}
                aria-current={active ? 'step' : undefined}
              >
                <b>{title}</b>
                <small>{done || preflightReady ? 'Hoàn tất' : failed ? 'Cần kiểm tra' : active ? 'Đang chạy' : 'Chờ'}</small>
              </li>
            )
          })}
        </ol>
      </article>

      <div className="ga-metrics">
        <article className="ga-metric ga-metric--weight">
          <div className="ga-metric-label">
            KHỐI LƯỢNG CUA <span>HX711 · LOAD CELL</span>
          </div>
          <div className="ga-metric-value">
            <span>{online ? fmt(s?.weightG, 1) : '—'}</span>
            <small>g</small>
          </div>
          <div className="ga-metric-bottom">
            <span style={{ color: online && s?.weightG != null ? (stable ? '#80dcaa' : '#ffd18b') : undefined }}>
              {weightCaption}
            </span>
            <span className="op-mono">
              {online && (s?.instantG ?? s?.weightG) != null ? `Tức thời ${fmt(s?.instantG ?? s?.weightG, 2)} g` : ''}
            </span>
          </div>
          <svg className="ga-spark" viewBox="0 0 300 35" preserveAspectRatio="none" aria-label="Biến thiên cân">
            <path d={sparkPath} />
          </svg>
          {online && s?.weightG != null && (
            <div className="ga-scale-details">
              <span>
                Dao động thô <b>{fmt(s?.rawSpreadG ?? 0, 3)} g</b>
              </span>
              <span>
                Sau lọc <b>{fmt(s?.filteredSpreadG ?? 0, 3)} g</b>
              </span>
              <span>
                {s?.sampleCount ?? samples.length} mẫu · {s?.outlierCount ?? 0} mẫu loại
              </span>
            </div>
          )}
        </article>

        <article className="ga-metric">
          <div className="ga-metric-label">
            KHOẢNG CÁCH <span>VL53L0X</span>
          </div>
          <div className="ga-metric-value">
            <span>{online ? fmt(s?.tofMm, 0) : '—'}</span>
            <small>mm</small>
          </div>
          <div className="ga-metric-bottom">Từ cảm biến đến bề mặt vật</div>
          <div className="ga-ruler" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, i) => (
              <i key={i} />
            ))}
          </div>
        </article>

        <article className="ga-metric">
          <div className="ga-metric-label">
            ĐIỀU KIỆN TRẠM <span>GPIO</span>
          </div>
          <div className="ga-inputs">
            <div>
              <span className="ga-input-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 21h16M6 21V3h12v18m-4-9h1" />
                </svg>
              </span>
              <div>
                <small>Cửa trạm</small>
                <b>{!online || s?.doorClosed == null ? 'Chưa đọc' : s.doorClosed ? 'Đã đóng' : 'Đang mở'}</b>
              </div>
              <span
                className={`ga-input-dot ${!online || s?.doorClosed == null ? '' : s.doorClosed ? 'is-on' : 'is-warn'}`}
              />
            </div>

            <div>
              <span className="ga-input-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <div>
                <small>Nút trên trạm</small>
                <b>{!online || s?.buttonPressed == null ? 'Chưa đọc' : s.buttonPressed ? 'Đang nhấn' : 'Đã nhả'}</b>
              </div>
              <span className={`ga-input-dot ${online && s?.buttonPressed ? 'is-on' : ''}`} />
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}

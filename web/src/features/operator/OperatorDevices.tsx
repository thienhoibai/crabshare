import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowLeft, Cpu, Scale } from 'lucide-react'
import type {
  BatchResponse, DeviceResponse, PagedResultOfBatchResponse, SessionMeasurementsResponse, SessionResponse,
} from '../../shared/api/api.gen'
import {
  Field, OpBtn, OpEmpty, OpHeading, OpMore, OpNote, OpPanel, QueryView, Select, StatusBadge,
  formatDateTime, label, useGet,
} from '../../shared/ui/console'
import DeviceList from './DeviceList'
import { SessionView } from './sales/SessionPanel'
import { GradeAiOpenSessionForm } from './devices/GradeAiOpenSessionForm'
import { BatchWeighingHistory, type WeighingHistoryPage } from './devices/BatchWeighingHistory'
import { StationRuntime, type RuntimeResponse } from './devices/StationRuntime'
import { StationStart } from './devices/StationStart'
import { StationWifi } from './devices/StationWifi'
import { StationNetwork } from './devices/StationNetwork'
import { StationGrading } from './devices/StationGrading'
import { StationCompletion } from './devices/StationCompletion'
import { StationRemeasure } from './devices/StationRemeasure'
import './devices/devices.css'

function isWeighableBatch(b: BatchResponse): boolean {
  return b.hasHolding ? b.status === 'Harvesting' : ['Sourcing', 'Selling'].includes(b.status)
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M8 6l2-3h4l2 3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function BatchSelectionStep({
  station,
  weighableBatches,
  otherBatches,
  onSelectBatch,
}: {
  station: DeviceResponse | undefined
  weighableBatches: BatchResponse[]
  otherBatches: BatchResponse[]
  onSelectBatch: (batchCode: string) => void
}) {
  const [archiveDraft, setArchiveDraft] = useState('')

  return (
    <>
      {station && <StationRuntime key={station.deviceCode} code={station.deviceCode} connectionOnly />}
      <article className="ga-card ga-batch-picker">
        <div className="ga-progress-head">
          <div>
            <h2>Bước 1 · Chọn lô cua cần cân trước khi vào trạm</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b655a' }}>
              Chỉ hiển thị các lô đang ở trạng thái đủ điều kiện đo tại trạm (Đang thu hoạch hoặc Đang nhận cua).
            </p>
          </div>
          <span className={`ga-tag ${station?.status === 'Active' ? 'ga-tag--good' : ''}`}>
            {station ? `Trạm ${station.deviceCode} · ${station.source === 'Simulated' ? 'Giả lập' : 'Thiết bị thật'}` : 'Chưa đăng ký trạm'}
          </span>
        </div>

        {weighableBatches.length > 0 ? (
          <div className="ga-batch-grid">
            {weighableBatches.map((b) => (
              <div key={b.batchCode} className="ga-batch-item">
                <div>
                  <div className="ga-batch-meta">
                    <span className="ga-tag ga-tag--good">{label('batch', b.status)}</span>
                    <small style={{ color: '#6b655a', fontSize: 11 }}>{label('crabType', b.crabType)}</small>
                  </div>
                  <h3>{b.batchCode}</h3>
                  <p>{b.title}</p>
                </div>
                <div className="ga-batch-meta" style={{ paddingTop: 10, borderTop: '1px solid rgba(21,19,15,.08)' }}>
                  <small style={{ color: '#6b655a', fontSize: 12 }}>
                    Quy mô: <b>{b.plannedQuantity}</b> con
                  </small>
                  <button type="button" className="ga-btn-grad" onClick={() => onSelectBatch(b.batchCode)}>
                    <Scale size={14} /> Chọn lô & vào trạm cân →
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <OpNote>
              Hiện chưa có lô nào ở trạng thái đủ điều kiện cân. Đối với lô có lưu nuôi, hãy bấm <b>Bắt đầu thu hoạch</b> tại
              trang chi tiết lô trước khi đưa cua qua trạm cân.
            </OpNote>
          </div>
        )}

        {otherBatches.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <OpMore label={`Xem lại lịch sử cân của các lô khác (${otherBatches.length} lô không ở giai đoạn cân)`}>
              <form
                className="op-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (archiveDraft.trim()) onSelectBatch(archiveDraft.trim().toUpperCase())
                }}
              >
                <Field label="Chọn lô cần tra cứu lịch sử">
                  <Select value={archiveDraft} onChange={(e) => setArchiveDraft(e.target.value)}>
                    <option value="">— Chọn lô —</option>
                    {otherBatches.map((b) => (
                      <option key={b.batchCode} value={b.batchCode}>
                        {b.batchCode} · {label('crabType', b.crabType)} ({label('batch', b.status)})
                      </option>
                    ))}
                  </Select>
                </Field>
                <OpBtn type="submit" sm variant="ghost" disabled={!archiveDraft.trim()}>
                  Xem lịch sử lô này
                </OpBtn>
              </form>
            </OpMore>
          </div>
        )}
      </article>

      {station && (
        <OpPanel title="Thông tin đăng ký và hiệu chuẩn trạm">
          <p className="rd-muted">
            Ngày hiệu chuẩn ghi trên hệ thống: {formatDateTime(station.lastCalibratedAt) || 'chưa có'}.
          </p>
          <DeviceList devices={[station]} />
        </OpPanel>
      )}
      {station && <StationWifi code={station.deviceCode} />}
    </>
  )
}

function DeviceWorkspace({ devices }: { devices: DeviceResponse[] }) {
  const [params, setParams] = useSearchParams()
  const activeBatchCode = (params.get('batch') ?? '').trim().toUpperCase()
  const [stationChoice, setStationChoice] = useState('')
  const [sessionNo, setSessionNo] = useState('')
  const [remeasure, setRemeasure] = useState<SessionResponse | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [cameraTick, setCameraTick] = useState(0)
  const [runtimeReport, setRuntimeReport] = useState<RuntimeResponse | undefined>(undefined)

  const batches = useGet<PagedResultOfBatchResponse>('/api/operators/me/batches', { page: 1, pageSize: 100 })
  const allBatches = batches.data?.items ?? []
  const weighableBatches = allBatches.filter(isWeighableBatch)
  const otherBatches = allBatches.filter((b) => !isWeighableBatch(b))

  const stations = devices.filter((d) => d.deviceType === 'Station' && d.status !== 'Removed')
  const station = stations.find((d) => d.deviceCode === stationChoice) ?? stations[0]
  const otherDevices = devices.filter((d) => d.deviceType !== 'Station')

  const batch = useGet<BatchResponse>(
    activeBatchCode ? `/api/operators/me/batches/${encodeURIComponent(activeBatchCode)}` : null,
  )
  const recent = useGet<WeighingHistoryPage>(
    activeBatchCode ? `/api/batches/${encodeURIComponent(activeBatchCode)}/measurement-sessions` : null,
    { page: 1, pageSize: 100 },
    { refetchInterval: 4000 },
  )
  const openSessions = useGet<WeighingHistoryPage>(
    station && activeBatchCode ? `/api/batches/${encodeURIComponent(activeBatchCode)}/measurement-sessions` : null,
    { page: 1, pageSize: 1, status: 'Open', stationCode: station?.deviceCode },
    { refetchInterval: 3000 },
  )

  const activeOpen = openSessions.data?.items[0]
  const readyBatch = !!(batch.data && isWeighableBatch(batch.data))
  const measured = new Set((recent.data?.items ?? []).filter((s) => s.weightG != null).map((s) => s.crabCode))

  const recentItems = recent.data?.items ?? []
  const pickedSession = recentItems.find((s) => s.sessionNo === sessionNo)
  const latestCaptured = recentItems.find((s) => s.hasWhiteImage || s.hasRedImage)
  const selectedSession: SessionResponse | undefined =
    pickedSession ??
    latestCaptured ??
    recentItems.find((s) => s.weightG != null) ??
    activeOpen

  const selectedMeasurements = useGet<SessionMeasurementsResponse>(
    selectedSession && (selectedSession.hasWhiteImage || selectedSession.hasRedImage || selectedSession.weightG != null)
      ? `/api/measurement-sessions/${encodeURIComponent(selectedSession.sessionNo)}/measurements`
      : null,
    undefined,
    { refetchInterval: 4000 },
  )

  if (!activeBatchCode) {
    return (
      <QueryView query={batches}>
        {() => (
          <BatchSelectionStep
            station={station}
            weighableBatches={weighableBatches}
            otherBatches={otherBatches}
            onSelectBatch={(code) => {
              setSessionNo('')
              setParams({ batch: code })
            }}
          />
        )}
      </QueryView>
    )
  }

  const latestWeighed = recentItems.find(s => s.weightG != null)

  const stationControls = station && <>
    <div className="ga-start-top">
      <h2>Bắt đầu lượt đo · {activeBatchCode}</h2>
      {latestWeighed?.weightG != null && (
        <span className="ga-tag ga-tag--good">
          Gần nhất: {latestWeighed.gradeAiTag ?? latestWeighed.crabCode} ·{' '}
          {latestWeighed.weightG.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} g
        </span>
      )}
    </div>

    <QueryView query={batch}>
      {(value) =>
        !readyBatch ? (
          <OpNote>
            Lô <b>{value.batchCode}</b> hiện ở trạng thái <b>{label('batch', value.status)}</b> (chỉ xem lại lịch
            sử cân bên dưới, không mở lượt đo mới).
          </OpNote>
        ) : (
          <GradeAiOpenSessionForm
            key={`${station.deviceCode}-${value.batchCode}`}
            batch={value}
            stationCode={station.deviceCode}
            measured={measured}
            activeOpen={activeOpen}
            onChangeBatch={() => { setSessionNo(''); setParams({}) }}
            busy={!!(runtimeReport?.fresh && runtimeReport.state?.busy)}
            onOpened={() => {
              void openSessions.refetch()
              void recent.refetch()
            }}
            onInspect={setSessionNo}
          />
        )
      }
    </QueryView>

    {activeOpen?.gradeAiTag && station.source !== 'Simulated' && (
      <StationStart
        key={activeOpen.sessionNo}
        code={station.deviceCode}
        sessionNo={activeOpen.sessionNo}
        tag={activeOpen.gradeAiTag}
        runtime={runtimeReport}
      />
    )}
  </>

  return (
    <>
      {/* Thanh gộp Đang làm việc với lô + Chọn trạm cân gọn trên 1 hàng ngang */}
      <div className="ga-active-batch-bar">
        <div className="ga-active-batch-info">
          <span>Đang làm việc với lô:</span>
          <b>{activeBatchCode}</b>
          {batch.data && (
            <>
              <span>· {label('crabType', batch.data.crabType)}</span>
              <StatusBadge kind="batch" value={batch.data.status} />
            </>
          )}
          {station && (
            <span className="ga-bar-station">
              <span className="ga-bar-sep">|</span>
              <span>Trạm cân:</span>
              {stations.length > 1 ? (
                <Select
                  value={station.deviceCode}
                  onChange={(event) => setStationChoice(event.target.value)}
                  aria-label="Chọn trạm cân"
                >
                  {stations.map((d) => (
                    <option key={d.deviceCode} value={d.deviceCode}>
                      {d.deviceCode} · {d.source === 'Simulated' ? 'Giả lập' : 'Thiết bị thật'}
                    </option>
                  ))}
                </Select>
              ) : (
                <b>
                  {station.deviceCode} · {station.source === 'Simulated' ? 'Giả lập' : 'Thiết bị thật'}
                </b>
              )}
            </span>
          )}
        </div>
        <div className="ga-bar-controls">
          {station && <StationNetwork key={station.deviceCode} code={station.deviceCode} />}
          {weighableBatches.length > 1 && (
            <Select
              value={weighableBatches.some((b) => b.batchCode === activeBatchCode) ? activeBatchCode : ''}
              onChange={(e) => {
                if (e.target.value) {
                  setSessionNo('')
                  setParams({ batch: e.target.value })
                }
              }}
              aria-label="Đổi nhanh lô đủ điều kiện cân"
            >
              {weighableBatches.map((b) => (
                <option key={b.batchCode} value={b.batchCode}>
                  {b.batchCode} · {label('crabType', b.crabType)}
                </option>
              ))}
            </Select>
          )}
          <OpBtn
            sm
            variant="ghost"
            onClick={() => {
              setSessionNo('')
              setParams({})
            }}
          >
            <ArrowLeft size={15} /> Đổi lô cân
          </OpBtn>
        </div>
      </div>

      {station ? (
        <StationRuntime key={station.deviceCode} code={station.deviceCode} onStateChange={setRuntimeReport}
          showConnection={false} controls={stationControls} />
      ) : (
        <OpPanel title="Trạm cân GradeAI">
          <OpEmpty title="Chưa đăng ký trạm cân" icon={<Cpu size={26} />}>
            Admin đăng ký Pi loại Trạm đo cho đơn vị để bắt đầu.
          </OpEmpty>
        </OpPanel>
      )}

      <details className="ga-card ga-live-camera" onToggle={event => {
        if (!event.currentTarget.open) setCameraOn(false)
      }}>
        <summary>Camera trực tiếp</summary>
        <div className="ga-media-card">
          <div className="ga-card-head">
            <button
              type="button"
              className="ga-btn-grad"
              onClick={() => {
                setCameraError(false)
                setCameraTick((t) => t + 1)
                setCameraOn((v) => !v)
              }}
            >
              {cameraOn ? 'Tắt camera' : 'Bật camera'}
            </button>
          </div>
          <div className="ga-media-box ga-media-box--dark">
            {cameraOn && !cameraError ? (
              <img
                key={cameraTick}
                src={`http://192.168.137.2:8088/api/camera/stream?autostart=1&t=${cameraTick}`}
                alt="Hình camera trực tiếp góc xa từ trạm GradeAI"
                onError={() => setCameraError(true)}
              />
            ) : (
              <div className="ga-media-placeholder ga-media-placeholder--dark">
                <CameraIcon />
                {cameraError
                  ? 'Không tải được luồng camera từ 192.168.137.2:8088. Kiểm tra LAN hoặc bấm bật lại.'
                  : 'Bật camera để xem trực tiếp góc xa toàn khay từ trạm.'}
              </div>
            )}
          </div>
          <div className="ga-media-foot">
            <span className={cameraOn && !cameraError ? 'is-live' : ''}>
              {cameraOn && !cameraError ? '● Trực tiếp qua LAN' : 'Đang tắt'}
            </span>
            <span>Góc xa 4:3 (1640×1232 → 640×480)</span>
          </div>
        </div>
      </details>

      <StationCompletion
        key={`${activeBatchCode}:${station?.deviceCode ?? ''}`}
        sessions={recent.data?.items}
        stationCode={station?.deviceCode}
        onDetails={setSessionNo}
      />
      <StationGrading
        session={selectedSession}
        activeOpen={activeOpen}
        data={selectedMeasurements.data}
        error={selectedMeasurements.isError}
        onRetry={() => { void selectedMeasurements.refetch() }}
        onDetails={() => {
          if (selectedSession) setSessionNo(selectedSession.sessionNo)
        }}
      />

      {sessionNo && batch.data && (
        <SessionView
          key={sessionNo}
          sessionNo={sessionNo}
          roe={batch.data.crabType.includes('Roe')}
          onClose={() => setSessionNo('')}
        />
      )}

      <div id="batch-weighing-history">
        <BatchWeighingHistory key={activeBatchCode} code={activeBatchCode} onSelect={setSessionNo}
          onRemeasure={station && readyBatch ? setRemeasure : undefined}
          remeasureDisabled={!!activeOpen || !!runtimeReport?.state?.busy} />
      </div>
      {remeasure && remeasure.batchCode === activeBatchCode && station && <StationRemeasure key={remeasure.sessionNo}
        session={remeasure} stationCode={station.deviceCode} disabled={!readyBatch || !!activeOpen || !!runtimeReport?.state?.busy}
        onClose={() => setRemeasure(null)} onOpened={setSessionNo} />}

      {station && (
        <>
          <OpPanel title="Thông tin đăng ký và hiệu chuẩn trạm">
            <p className="rd-muted">
              Ngày hiệu chuẩn ghi trên hệ thống: {formatDateTime(station.lastCalibratedAt) || 'chưa có'}.
            </p>
            <DeviceList devices={[station]} />
          </OpPanel>
        </>
      )}

      {otherDevices.length > 0 && (
        <OpPanel title="Camera và cảm biến khác">
          <DeviceList devices={otherDevices} />
        </OpPanel>
      )}
    </>
  )
}

export default function OperatorDevices() {
  const devices = useGet<DeviceResponse[]>('/api/operators/me/devices', undefined, { refetchInterval: 10_000 })
  return (
    <>
      <OpHeading
        eyebrow="OPERATOR / THIẾT BỊ GRADEAI"
        title="Trạm cân & chụp ảnh"
        description="Mỗi lượt đo gắn với một con cua. Kiểm tra số cân và ảnh trước khi chuyển sang kiểm phẩm."
      />
      <QueryView query={devices}>{(rows) => <DeviceWorkspace devices={rows} />}</QueryView>
      <OpPanel title="Kiểm thử hệ thống" lead="Dùng tại trạm khi cần kiểm tra phần cứng hoặc xem dữ liệu đang lưu trên Pi.">
        <OpMore label="Mở công cụ kiểm thử tại trạm">
          <div className="device-test-links">
            <a className="rd-btn rd-btn--ghost" href="http://192.168.137.2:8088/" target="_blank" rel="noopener noreferrer">
              Trạm thử GradeAI
            </a>
            <a className="rd-btn rd-btn--ghost" href="http://192.168.137.2:8088/diagnostics" target="_blank" rel="noopener noreferrer">
              Thử từng linh kiện
            </a>
            <a className="rd-btn rd-btn--ghost" href="http://192.168.137.2:8088/camera" target="_blank" rel="noopener noreferrer">
              Camera tại trạm
            </a>
          </div>
          <p className="rd-muted">
            Máy tính cần nối mạng LAN của Pi. Các lượt cân cục bộ chưa gửi lên hệ thống được xem trong Lịch sử của trang Pi.
          </p>
        </OpMore>
      </OpPanel>
    </>
  )
}

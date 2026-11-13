/* /qc/tham-trai/:assignmentId — Biên bản thăm trại giữa vụ (BR-233), lập ngay tại trại bằng điện thoại.
   POST /api/qc/site-visits/{assignmentId}/report (multipart: Latitude, Longitude, BoxCodes, CrabsSeen, Findings, Photo).
   Vị trí lấy từ navigator.geolocation ngay khi mở trang; máy chủ chỉ nhận biên bản lập trong vòng 2 km quanh trại đã khai.
   Trang chỉ có một việc: bấm các hộp đã xem, ghi số cua, nhận xét, chụp ảnh, gửi. Biên bản trước của Lô
   (GET /api/batches/{code}/site-visits) nằm trong phần gấp lại. */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { ArrowLeft, LocateFixed, MapPin } from 'lucide-react'
import type { BatchProgressResponse, BoxStateResponse, QcTaskResponse, SiteVisitReportResponse } from '../../shared/api/api.gen'
import {
  Field, Input, NumberInput, OpAside, OpBack, OpBadge, OpBtn, OpConfirm, OpEmpty, OpFacts, OpHeading, OpKv, OpLoading, OpMore, OpNote, OpPanel, OpPhoto,
  QueryView, TextArea, formatDateTime, label, useGet, useSend,
} from '../../shared/ui/console'
import { num, useBatchHead, useQcTasks } from './qc'

type Geo =
  | { state: 'asking' | 'denied' | 'unavailable' | 'unsupported' | 'insecure' }
  | { state: 'ok'; lat: number; lng: number; accuracy: number }

/** Lý do không lấy được vị trí và việc cần làm, mỗi dòng một câu ngắn. */
const GEO_MESSAGE: Record<Exclude<Geo['state'], 'ok' | 'asking'>, string> = {
  denied: 'Trình duyệt đang chặn vị trí. Mở quyền Vị trí cho trang này rồi bấm Lấy lại.',
  unavailable: 'Chưa bắt được vị trí. Ra chỗ thoáng, bật định vị rồi bấm Lấy lại.',
  unsupported: 'Trình duyệt này không lấy được vị trí. Hãy dùng trình duyệt khác.',
  insecure: 'Trang phải mở bằng địa chỉ https mới lấy được vị trí.',
}

/** Vị trí hiện tại của máy. Hỏi ngay khi mở trang, hỏi lại khi bấm nút. */
function useGeo() {
  const [geo, setGeo] = useState<Geo>({ state: 'asking' })
  const ask = useCallback(() => {
    if (!('geolocation' in navigator)) return setGeo({ state: 'unsupported' })
    if (!window.isSecureContext) return setGeo({ state: 'insecure' })
    setGeo({ state: 'asking' })
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ state: 'ok', lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => setGeo({ state: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  }, [])
  useEffect(() => { ask() }, [ask])
  return { geo, ask }
}

interface ReportBody { Latitude: string; Longitude: string; BoxCodes: string; CrabsSeen: number; Findings: string; Photo: File }

function VisitForm({ task, onDone }: { task: QcTaskResponse; onDone: (report: SiteVisitReportResponse) => void }) {
  const boxes = useGet<BoxStateResponse[]>(`/api/batches/${encodeURIComponent(task.batchCode)}/boxes`, undefined, { retry: false })
  const { geo, ask } = useGeo()
  const [picked, setPicked] = useState<string[]>([])
  const [typed, setTyped] = useState('')
  const [crabsSeen, setCrabsSeen] = useState<number | null>(null)
  const [findings, setFindings] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [confirming, setConfirming] = useState(false)
  const send = useSend<SiteVisitReportResponse, ReportBody>('post', `/api/qc/site-visits/${task.assignmentId}/report`, {
    form: true,
    quietError: true,
    success: (res) => `Đã lập biên bản ${res.reportNo}.`,
    onSuccess: onDone,
  })

  const hasGrid = (boxes.data?.length ?? 0) > 0
  const codes = hasGrid ? picked : [...new Set(typed.split(',').map((c) => c.trim()).filter(Boolean))]
  const boxCodes = codes.join(',')
  // DTO nhận chuỗi mã hộp dài 4 đến 400 ký tự.
  const boxesOk = boxCodes.length >= 4 && boxCodes.length <= 400
  const missing = [
    geo.state !== 'ok' && 'vị trí',
    !boxesOk && (boxCodes.length > 400 ? 'bớt hộp' : 'hộp đã xem'),
    crabsSeen === null && 'số cua',
    findings.trim().length < 3 && 'nhận xét',
    !photo && 'ảnh',
  ].filter(Boolean)
  const toggle = (code: string) => setPicked((old) => (old.includes(code) ? old.filter((c) => c !== code) : [...old, code]))

  return (
    <>
      <OpPanel title={hasGrid ? `Hộp đã xem · ${picked.length}` : 'Hộp đã xem'}>
        {boxes.isPending ? <OpLoading /> : hasGrid ? (
          <div className="op-boxes">
            {boxes.data?.map((b) => (
              <button
                key={b.slotCode}
                type="button"
                aria-pressed={picked.includes(b.slotCode)}
                className={`${b.crabCode ? 'is-occupied' : 'is-empty'} ${picked.includes(b.slotCode) ? 'is-on' : ''}`}
                onClick={() => toggle(b.slotCode)}
              >
                {b.slotCode}
              </button>
            ))}
          </div>
        ) : (
          <Field label="Mã hộp" hint="Cách nhau bằng dấu phẩy">
            <Input value={typed} maxLength={400} onChange={(e) => setTyped(e.target.value)} />
          </Field>
        )}
      </OpPanel>

      <OpPanel title="Ghi nhận" subtitle="Biên bản phải lập ngay tại trại, cách trại không quá 2 km.">
        <form className="op-form" onSubmit={(e) => { e.preventDefault(); if (missing.length === 0) setConfirming(true) }} noValidate>
          <Field label="Số cua đã thấy" required>
            <NumberInput value={crabsSeen} onChange={setCrabsSeen} unit="con" max={100000} />
          </Field>
          <Field label="Nhận xét" required>
            <TextArea rows={3} maxLength={1000} value={findings} onChange={(e) => setFindings(e.target.value)} />
          </Field>
          <Field label="Ảnh tại trại" required>
            <OpPhoto value={photo} onChange={setPhoto} />
          </Field>
          <div className="op-between">
            {geo.state === 'asking' ? <OpBadge>Đang lấy vị trí…</OpBadge>
              : geo.state === 'ok' ? <OpBadge tone="ok">Đã có vị trí · sai số {num(geo.accuracy, 0)} m</OpBadge>
                : <OpBadge tone="danger">Chưa có vị trí</OpBadge>}
            <OpBtn type="button" variant="ghost" sm disabled={geo.state === 'asking'} onClick={ask}><LocateFixed size={15} /> Lấy lại</OpBtn>
          </div>
          {geo.state !== 'ok' && geo.state !== 'asking' && <OpNote tone="danger">{GEO_MESSAGE[geo.state]}</OpNote>}
          <OpBtn type="submit" full className="rd-btn--lg" disabled={missing.length > 0}>
            <MapPin size={18} /> {missing.length > 0 ? `Còn thiếu: ${missing.join(', ')}` : 'Lập biên bản'}
          </OpBtn>
        </form>
      </OpPanel>

      {confirming && geo.state === 'ok' && photo && crabsSeen !== null && (
        <OpConfirm
          title="Gửi biên bản thăm trại"
          sub="Gửi rồi không sửa được."
          confirmLabel="Gửi biên bản"
          pending={send.isPending}
          error={send.error}
          onConfirm={() => send.mutate({
            Latitude: geo.lat.toFixed(6), Longitude: geo.lng.toFixed(6), BoxCodes: boxCodes, CrabsSeen: crabsSeen, Findings: findings.trim(), Photo: photo,
          })}
          onClose={() => { send.reset(); setConfirming(false) }}
        >
          <OpFacts items={[{ label: 'Hộp đã xem', value: codes.length }, { label: 'Cua đã thấy', value: `${crabsSeen} con` }]} />
        </OpConfirm>
      )}
    </>
  )
}

/** Biên bản trước của Lô, gấp lại; không có thì không hiện. */
function PastReports({ batchCode }: { batchCode: string }) {
  const reports = useGet<SiteVisitReportResponse[]>(`/api/batches/${encodeURIComponent(batchCode)}/site-visits`, undefined, { retry: false })
  if (!reports.data || reports.data.length === 0) return null
  return (
    <OpMore label="Biên bản trước" count={reports.data.length}>
      {[...reports.data].reverse().map((r) => (
        <article key={r.reportNo} className="qc-version">
          <div className="op-between"><b>{formatDateTime(r.visitedAt)}</b><small className="rd-muted">{r.boxCodes.length} hộp · {r.crabsSeen} con</small></div>
          <p>{r.findings}</p>
        </article>
      ))}
    </OpMore>
  )
}

export default function SiteVisitReportPage() {
  const { assignmentId = '' } = useParams()
  const tasks = useQcTasks()
  const [done, setDone] = useState<SiteVisitReportResponse | null>(null)
  const task = tasks.data?.find((t) => t.kind === 'SiteVisit' && String(t.assignmentId) === assignmentId)
  const batchCode = done?.batchCode ?? task?.batchCode ?? null
  const head = useBatchHead(batchCode)
  const progress = useGet<BatchProgressResponse>(batchCode ? `/api/batches/${encodeURIComponent(batchCode)}/progress` : null, undefined, { retry: false })
  const back = <OpBack href="/qc/tham-trai"><ArrowLeft size={16} /> Thăm trại giữa vụ</OpBack>

  if (done)
    return (
      <>
        <OpHeading crumb={back} eyebrow={`Lô ${done.batchCode}`} title="Đã lập biên bản" />
        <OpPanel title={done.reportNo} accent>
          <OpFacts items={[
            { label: 'Cách trại', value: done.distanceToFarmM === null ? '—' : `${num(done.distanceToFarmM, 0)} m`, tone: 'ok' },
            { label: 'Hộp đã xem', value: done.boxCodes.length },
            { label: 'Cua đã thấy', value: `${done.crabsSeen} con` },
          ]} />
          <a className="rd-btn rd-btn--primary rd-btn--block" href="/qc">Về danh sách việc</a>
        </OpPanel>
      </>
    )

  return (
    <QueryView query={tasks}>
      {() => (!task ? (
        <>
          <OpHeading crumb={back} eyebrow="Thăm trại giữa vụ" title="Không có việc này" />
          <OpEmpty title="Việc này đã xong hoặc không phân cho bạn" />
        </>
      ) : (
        <>
          <OpHeading crumb={back} eyebrow={`Thăm trại · Lô ${task.batchCode}`} title={head.data?.title ?? task.batchCode} />
          <div className="op-split">
            <div>
              <VisitForm task={task} onDone={setDone} />
            </div>
            <OpAside>
              <OpKv items={[
                { label: 'Người nuôi', value: head.data?.executorName },
                { label: 'Loại cua', value: head.data ? label('crabType', head.data.crabType) : null },
                { label: 'Cua đang nuôi theo sổ', value: progress.data ? `${progress.data.crabsAlive} con` : null },
                { label: 'Số ngày nuôi', value: progress.data?.daysRaised },
              ]} />
              <PastReports batchCode={task.batchCode} />
            </OpAside>
          </div>
        </>
      ))}
    </QueryView>
  )
}

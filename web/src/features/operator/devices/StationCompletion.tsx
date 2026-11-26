import { useEffect, useRef, useState } from 'react'
import type { SessionMeasurementsResponse, SessionResponse } from '../../../shared/api/api.gen'
import { OpBtn, OpModal, formatDateTime, useGet } from '../../../shared/ui/console'
import { StationGrading } from './StationGrading'

const completed = (session: SessionResponse) =>
  ['Received', 'Measured'].includes(session.status) && session.weightG != null

function CompletionPopup({ session, remaining, onClose, onDetails }: {
  session: SessionResponse
  remaining: number
  onClose: () => void
  onDetails: (sessionNo: string) => void
}) {
  const measurements = useGet<SessionMeasurementsResponse>(
    `/api/measurement-sessions/${encodeURIComponent(session.sessionNo)}/measurements`, undefined,
    { refetchInterval: 3000, retry: false },
  )
  const response = measurements.data
  const data = response?.session.sessionNo === session.sessionNo && response.session.crabCode === session.crabCode
    && response.session.batchCode === session.batchCode ? response : undefined
  const saved = data?.session ?? session
  const tag = saved.gradeAiTag ?? session.gradeAiTag ?? saved.crabCode

  return <OpModal title={`Kết quả cân · ${tag}`} sub={`Lô ${saved.batchCode} · Lượt ${saved.sessionNo} · ${formatDateTime(saved.capturedAt ?? saved.receivedAt ?? saved.openedAt)}`} onClose={onClose} wide>
    <div className="ga-completion">
      {saved.failReason && <p role="alert">Lượt đo cần kiểm tra: {saved.failReason}</p>}
      {saved.status === 'Received' && !data?.decision && <p role="status">Đã cân xong. Đang xử lý ảnh và đề xuất phân hạng…</p>}
      <StationGrading inPopup session={saved} data={data} error={measurements.isError || (!!response && !data)}
        onRetry={() => { void measurements.refetch() }}
        onDetails={() => { onDetails(saved.sessionNo); onClose() }} />
      <div className="ga-completion-actions">
        <small>{remaining > 0 ? `Còn ${remaining} kết quả mới đang chờ xem.` : 'Kết quả được lưu trong lịch sử cân của lô.'}</small>
        <OpBtn onClick={onClose}>{remaining > 0 ? 'Xem kết quả tiếp theo' : 'Đóng kết quả'}</OpBtn>
      </div>
    </div>
  </OpModal>
}

/** Mounted per batch/station: seed old results once, queue new results once per session. */
export function StationCompletion({ sessions, stationCode, onDetails }: {
  sessions?: SessionResponse[]
  stationCode?: string
  onDetails: (sessionNo: string) => void
}) {
  const seen = useRef<Set<string> | null>(null)
  const [queue, setQueue] = useState<SessionResponse[]>([])
  const [manual, setManual] = useState<SessionResponse | null>(null)
  const results = sessions?.filter(s => completed(s) && (!stationCode || s.stationCode === stationCode))

  useEffect(() => {
    if (!sessions) return
    const ready = sessions.filter(s => completed(s) && (!stationCode || s.stationCode === stationCode))
    if (!seen.current) {
      seen.current = new Set(ready.map(s => s.sessionNo))
      return
    }
    const fresh = ready.filter(s => !seen.current!.has(s.sessionNo))
      .sort((a, b) => (a.capturedAt ?? a.openedAt).localeCompare(b.capturedAt ?? b.openedAt))
    if (!fresh.length) return
    fresh.forEach(s => seen.current!.add(s.sessionNo))
    setQueue(current => [...current, ...fresh])
  }, [sessions, stationCode])

  const current = manual ?? queue[0]
  const close = () => manual ? setManual(null) : setQueue(items => items.slice(1))
  return <>
    {results?.[0] && <div className="ga-completion-reopen"><OpBtn variant="ghost" onClick={() => setManual(results[0])}>Xem kết quả lượt gần nhất</OpBtn></div>}
    {current && <CompletionPopup key={current.sessionNo} session={current} remaining={manual ? queue.length : queue.length - 1} onClose={close} onDetails={onDetails} />}
  </>
}

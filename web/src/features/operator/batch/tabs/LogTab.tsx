/* Tab Nhật ký của một Lô: nút ghi nhật ký hôm nay, các bản đã ghi (GET/POST /api/batches/{code}/production-logs),
   khoảng chỉ số nước để đối chiếu (GET/PUT …/production-thresholds, trong khối gấp) và nhật trình gộp của Lô (GET …/timeline). */
import { useState } from 'react'
import { CheckCircle2, NotebookPen } from 'lucide-react'
import type { PagedResultOfProductionLogResponse, ProductionThresholdState } from '../../../../shared/api/api.gen'
import { Input, OpBadge, OpBtn, OpEmpty, OpMore, OpPanel, OpTable, OpTabs, QueryView, formatDate, useGet } from '../../../../shared/ui/console'
import CareLogDialog from '../../CareLogDialog'
import { logSourceLabel, num, plausibilityLabel } from '../../opA'
import Pager from '../../Pager'
import ThresholdsPanel from '../../ThresholdsPanel'
import type { BatchTabProps } from '../types'
import BatchTimeline from './BatchTimeline'

type View = 'logs' | 'timeline'
const PAGE_SIZE = 20

export default function LogTab({ code, batch: b }: BatchTabProps) {
  const api = `/api/batches/${encodeURIComponent(code)}`
  const [view, setView] = useState<View>('logs')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [recording, setRecording] = useState(false)
  const state = useGet<ProductionThresholdState>(`${api}/production-thresholds`)
  const logs = useGet<PagedResultOfProductionLogResponse>(`${api}/production-logs`, { from, to, page, pageSize: PAGE_SIZE })
  const today = state.data?.businessDate
  const loggedToday = !!today && !from && !to && page === 1 && (logs.data?.items ?? []).some((l) => l.logDate === today && l.source === 'Manual')
  const canRecord = !!state.data?.canRecord

  return (
    <>
      <div className="op-between">
        <OpTabs<View> value={view} onChange={setView} items={[{ key: 'logs', label: 'Nhật ký chăm sóc' }, { key: 'timeline', label: 'Nhật trình' }]} />
        {canRecord && (loggedToday
          ? <span className="op-inline op-ok"><CheckCircle2 size={16} /> Hôm nay đã ghi</span>
          : <OpBtn onClick={() => setRecording(true)}><NotebookPen size={16} /> Ghi nhật ký hôm nay</OpBtn>)}
      </div>

      {view === 'timeline' ? <BatchTimeline code={code} /> : (
        <OpPanel>
          <QueryView query={logs}>
            {(data) => data.items.length === 0 && !from && !to ? <OpEmpty title="Lô chưa có nhật ký chăm sóc" /> : (
              <>
                <OpTable
                  rows={data.items}
                  rowKey={(l) => l.id}
                  empty="Không có nhật ký trong khoảng ngày này"
                  columns={[
                    {
                      key: 'date', header: 'Ngày', cell: (l) => (
                        <><b>{formatDate(l.logDate)}</b>{l.plausibilityFlag !== 'Ok' && <> <OpBadge tone="warn">{plausibilityLabel(l.plausibilityFlag)}</OpBadge></>}{l.source !== 'Manual' && <> <OpBadge>{logSourceLabel(l.source)}</OpBadge></>}{l.note && <><br /><small className="rd-muted">{l.note}</small></>}</>
                      ),
                    },
                    { key: 'feed', header: 'Thức ăn', num: true, cell: (l) => num(l.feedKg, ' kg') },
                    { key: 'ph', header: 'pH', num: true, cell: (l) => num(l.ph) },
                    { key: 'temp', header: 'Nhiệt độ', num: true, cell: (l) => num(l.waterTempC, ' °C') },
                    { key: 'sal', header: 'Độ mặn', num: true, cell: (l) => num(l.salinityPpt, ' ‰') },
                  ]}
                />
                <Pager page={data.page} pageSize={PAGE_SIZE} total={data.total} unit="bản ghi" onChange={setPage} />
              </>
            )}
          </QueryView>
          <OpMore label="Lọc theo ngày">
            <div className="op-toolbar">
              <Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1) }} aria-label="Từ ngày" />
              <Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1) }} aria-label="Đến ngày" />
              {(from || to) && <OpBtn variant="ghost" sm onClick={() => { setFrom(''); setTo(''); setPage(1) }}>Bỏ lọc</OpBtn>}
            </div>
          </OpMore>
          <ThresholdsPanel code={code} />
        </OpPanel>
      )}

      {recording && <CareLogDialog batchCode={code} batchTitle={b.title} onClose={() => setRecording(false)} />}
    </>
  )
}

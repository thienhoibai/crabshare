/* /operator/log — Ghi nhật ký chăm sóc hôm nay cho từng Lô đang lưu nuôi.
   GET /api/operators/me/production-batches (Lô đang nuôi, đã ghi hôm nay chưa), ghi bằng POST /api/batches/{code}/production-logs (CareLogDialog).
   Các bản đã ghi (GET /api/operators/me/production-logs?from=&to=) nằm trong khối gấp. */
import { useState } from 'react'
import { CheckCircle2, NotebookPen } from 'lucide-react'
import type { PagedResultOfProductionBatchResponse, PagedResultOfProductionLogResponse, ProductionBatchResponse } from '../../shared/api/api.gen'
import {
  Input, OpBadge, OpBtn, OpEmpty, OpHeading, OpMore, OpPanel, OpRow, OpTable, QueryView, crabImg, formatDate, useGet,
} from '../../shared/ui/console'
import CareLogDialog from './CareLogDialog'
import { logSourceLabel, num, plausibilityLabel } from './opA'
import Pager from './Pager'

const PAGE_SIZE = 20
/** API chỉ nhận nhật ký của Lô đang lưu nuôi hoặc đang thu hoạch. */
const recordable = (b: ProductionBatchResponse) => b.status === 'InProduction' || b.status === 'Harvesting'

export default function OperatorDailyLog() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [recording, setRecording] = useState<ProductionBatchResponse | null>(null)
  const batches = useGet<PagedResultOfProductionBatchResponse>('/api/operators/me/production-batches', { pageSize: 100 })
  const logs = useGet<PagedResultOfProductionLogResponse>('/api/operators/me/production-logs', { from, to, page, pageSize: PAGE_SIZE })
  const dueBatches = (batches.data?.items ?? []).filter((b) => recordable(b) && !b.loggedToday)
  const due = dueBatches.length
  // Chỉ Lô đầu tiên chưa ghi có nút chính.
  const firstDue = dueBatches[0]?.batchCode

  return (
    <>
      <OpHeading
        eyebrow="Vận hành"
        title="Nhật ký chăm sóc"
        description="Mỗi Lô ghi một lần mỗi ngày."
        action={due > 0 ? <OpBadge tone="warn">{due} Lô chưa ghi hôm nay</OpBadge> : undefined}
      />

      <QueryView query={batches}>
        {(data) => data.items.length === 0 ? <OpEmpty title="Chưa có Lô nào đang lưu nuôi" icon={<NotebookPen size={30} />} /> : (
          <OpPanel className="op-list">
            {data.items.map((b) => (
              <OpRow
                key={b.batchCode}
                // Lô cần ghi thì bấm để mở form; Lô đã ghi thì mở nhật ký của Lô.
                href={recordable(b) && !b.loggedToday ? undefined : `/operator/batches/${encodeURIComponent(b.batchCode)}/nhat-ky`}
                onClick={() => setRecording(b)}
                media={crabImg(b.crabType)}
                title={b.title}
                sub={`${b.batchCode}${b.dayOfCycle ? ` · ngày nuôi ${b.dayOfCycle}/${b.cycleDays}` : ''}`}
                mid={b.latestLog && (
                  <small>
                    {formatDate(b.latestLog.logDate)}: {num(b.latestLog.feedKg, ' kg')} thức ăn · pH {num(b.latestLog.ph)} · {num(b.latestLog.waterTempC, ' °C')} · {num(b.latestLog.salinityPpt, ' ‰')}
                  </small>
                )}
                end={
                  b.loggedToday ? <span className="op-inline op-ok"><CheckCircle2 size={16} /> Đã ghi</span>
                    : recordable(b) ? <span className={`rd-btn rd-btn--sm ${b.batchCode === firstDue ? 'rd-btn--primary' : 'rd-btn--ghost'}`}><NotebookPen size={15} /> Ghi hôm nay</span>
                      : null
                }
              />
            ))}
          </OpPanel>
        )}
      </QueryView>

      <OpPanel>
        <OpMore label="Các bản đã ghi" count={logs.data?.total}>
          <div className="op-toolbar">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1) }} aria-label="Từ ngày" />
            <Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1) }} aria-label="Đến ngày" />
            {(from || to) && <OpBtn variant="ghost" sm onClick={() => { setFrom(''); setTo(''); setPage(1) }}>Bỏ lọc</OpBtn>}
          </div>
          <QueryView query={logs}>
            {(data) => (
              <>
                <OpTable
                  rows={data.items}
                  rowKey={(l) => l.id}
                  empty="Chưa có nhật ký nào"
                  columns={[
                    {
                      key: 'date', header: 'Ngày', cell: (l) => (
                        <>
                          <b>{formatDate(l.logDate)}</b> · <a className="op-link" href={`/operator/batches/${encodeURIComponent(l.batchCode)}/nhat-ky`}>{l.batchCode}</a>
                          {l.plausibilityFlag !== 'Ok' && <> <OpBadge tone="warn">{plausibilityLabel(l.plausibilityFlag)}</OpBadge></>}
                          {l.source !== 'Manual' && <> <OpBadge>{logSourceLabel(l.source)}</OpBadge></>}
                          {l.note && <><br /><small className="rd-muted">{l.note}</small></>}
                        </>
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
        </OpMore>
      </OpPanel>

      {recording && <CareLogDialog batchCode={recording.batchCode} batchTitle={recording.title} onClose={() => setRecording(null)} />}
    </>
  )
}

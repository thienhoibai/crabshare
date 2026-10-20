import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { OpBadge, OpBtn, OpNote, OpPanel, type Tone } from './operatorUi'
import { AppliedRanges } from './ProductionThresholds'
import { productionDate, productionLogs, productionTime, type DailyLog } from './productionApi'

const flagLabels: Record<string, { label: string; tone: Tone }> = {
  Ok: { label: 'Trong ngưỡng', tone: 'ok' }, OutOfRange: { label: 'Ngoài ngưỡng', tone: 'warn' }, Inconsistent: { label: 'Cần kiểm tra', tone: 'danger' },
}
const measured = (value: number | null, unit = '') => value === null ? 'Chưa có số đo' : `${value}${unit}`

function HistoryRecord({ log }: { log: DailyLog }) {
  const flag = flagLabels[log.plausibilityFlag] ?? { label: log.plausibilityFlag, tone: 'mute' as const }
  return <article className="production-record">
    <div className="production-record-head">
      <h3 className="rd-h3">{productionDate(log.logDate)}</h3>
      <div className="production-badges"><OpBadge>{log.source === 'Manual' ? 'Thủ công' : log.source}</OpBadge><OpBadge tone={flag.tone}>{log.plausibilityFlag === 'Ok' && !log.thresholdsApplied ? 'Hợp lệ (lịch sử)' : flag.label}</OpBadge></div>
    </div>
    <dl className="production-measurements">
      <div><dt>pH</dt><dd>{measured(log.ph)}</dd></div>
      <div><dt>Nhiệt độ nước</dt><dd>{measured(log.waterTempC, ' °C')}</dd></div>
      <div><dt>Độ mặn</dt><dd>{measured(log.salinityPpt, ' ppt')}</dd></div>
      <div><dt>Thức ăn</dt><dd>{measured(log.feedKg, ' kg')}</dd></div>
    </dl>
    {log.note && <p className="production-log-note">{log.note}</p>}
    <div className="production-record-audit"><span>{log.recordedBy === null ? 'Người ghi: chưa có thông tin' : `Người ghi: #${log.recordedBy}`}</span><span>Lưu lúc {productionTime(log.createdAt)} · UTC+7</span></div>
    {log.thresholdsApplied ? <details className="production-applied">
      <summary>Ngưỡng áp dụng: phiên bản {log.thresholdVersion ?? log.thresholdsApplied.versionNo}</summary>
      <AppliedRanges version={log.thresholdsApplied} />
    </details> : <p className="rd-note">Chưa có thông tin ngưỡng lịch sử</p>}
  </article>
}

export default function ProductionLogHistory({ code, accountKey }: { code: string; accountKey: readonly unknown[] }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filters, setFilters] = useState({ from: '', to: '', page: 1 })
  const [validation, setValidation] = useState('')
  const query = useQuery({ queryKey: [...accountKey, 'logs', code, filters], queryFn: ({ signal }) => productionLogs(code, filters, signal), retry: false })
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1
  return <div role="region" aria-label="Lịch sử nhật ký">
    <OpPanel title="Lịch sử nhật ký" subtitle="Bản ghi đã lưu trên máy chủ. Bộ lọc ngày bao gồm cả ngày bắt đầu và kết thúc.">
      <form className="production-filters" onSubmit={event => {
        event.preventDefault()
        if (from && to && from > to) { setValidation('Ngày bắt đầu không được sau ngày kết thúc.'); return }
        setValidation(''); setFilters({ from, to, page: 1 })
      }}>
        <div className="op-field"><label htmlFor="history-from">Từ ngày</label><input id="history-from" className="op-input" type="date" value={from} onChange={event => setFrom(event.target.value)} /></div>
        <div className="op-field"><label htmlFor="history-to">Đến ngày</label><input id="history-to" className="op-input" type="date" value={to} onChange={event => setTo(event.target.value)} /></div>
        <OpBtn type="submit" variant="outline" disabled={query.isFetching}>Lọc nhật ký</OpBtn>
      </form>
      {validation && <p role="alert" className="production-error">{validation}</p>}
      {query.isPending ? <div role="status" aria-busy="true" className="production-loading">Đang tải lịch sử nhật ký…</div>
        : query.isError ? <div role="alert"><OpNote tone="danger">{errorMessage(query.error)}</OpNote><OpBtn className="mt-3" onClick={() => { void query.refetch() }}>Thử lại lịch sử</OpBtn></div>
          : !query.data.items.length ? <div className="op-empty"><b>Chưa có nhật ký</b><span>Không có bản ghi phù hợp với khoảng ngày đã chọn.</span></div>
            : <div className="production-records">{query.data.items.map(log => <HistoryRecord key={log.id} log={log} />)}</div>}
      {query.data && query.data.total > 0 && <nav aria-label="Phân trang nhật ký" className="production-pagination">
        <span className="rd-note">Trang {filters.page}/{pages} · {query.data.total} bản ghi</span>
        <div className="production-actions">
          <OpBtn variant="outline" sm aria-label="Trang trước" disabled={filters.page === 1 || query.isFetching} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}><ChevronLeft size={16} />Trước</OpBtn>
          <OpBtn variant="outline" sm aria-label="Trang sau" disabled={filters.page >= pages || query.isFetching} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Sau<ChevronRight size={16} /></OpBtn>
        </div>
      </nav>}
    </OpPanel>
  </div>
}

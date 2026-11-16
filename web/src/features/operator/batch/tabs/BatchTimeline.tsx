/* Nhật trình của một Lô (GET /api/batches/{code}/timeline?days=, UC21): gộp nhật ký chăm sóc, sự kiện từng con cua,
   ảnh bằng chứng và cảnh báo theo ngày. Đây cũng là dòng thời gian nhà đầu tư của Lô nhìn thấy. */
import { useState } from 'react'
import { AlertTriangle, Camera, NotebookPen, Shell } from 'lucide-react'
import type { TimelineItem, TimelinePage } from '../../../../shared/api/api.gen'
import { OpBadge, OpEmpty, OpIcon, OpPanel, QueryView, Select, StatusBadge, formatDate, label, tone, useGet } from '../../../../shared/ui/console'
import { crabEventLabel, crabEventTone, hourMinute, num, plausibilityLabel } from '../../opA'

function Entry({ item }: { item: TimelineItem }) {
  const time = hourMinute(item.occurredAt)
  if (item.productionLog) {
    const l = item.productionLog
    return (
      <div className="op-tile">
        <OpIcon tone="ok" round><NotebookPen size={18} /></OpIcon>
        <span>
          <b>Nhật ký chăm sóc</b>
          <small>Thức ăn {num(l.feedKg, ' kg')} · pH {num(l.ph)} · {num(l.waterTempC, ' °C')} · {num(l.salinityPpt, ' ‰')}{l.note ? ` · ${l.note}` : ''}</small>
        </span>
        {l.plausibilityFlag !== 'Ok' && <OpBadge tone="warn">{plausibilityLabel(l.plausibilityFlag)}</OpBadge>}
      </div>
    )
  }
  if (item.crabEvent) {
    const e = item.crabEvent
    return (
      <div className="op-tile">
        <OpIcon tone={crabEventTone(e.eventType)} round><Shell size={18} /></OpIcon>
        <span>
          <b>{crabEventLabel(e.eventType)} · {e.crabCode}</b>
          <small>{[time, e.slotCode ? `hộp ${e.slotCode}` : '', e.reason ?? ''].filter(Boolean).join(' · ')}</small>
        </span>
      </div>
    )
  }
  if (item.alert) {
    const a = item.alert
    return (
      <div className="op-tile">
        <OpIcon tone={tone('severity', a.severity)} round><AlertTriangle size={18} /></OpIcon>
        <span><b>{label('alertType', a.type)}</b><small>{[time, a.message].filter(Boolean).join(' · ')}</small></span>
        <StatusBadge kind="alert" value={a.status} />
      </div>
    )
  }
  if (item.evidence) {
    const e = item.evidence
    return (
      <div className="op-tile">
        <OpIcon tone="info" round><Camera size={18} /></OpIcon>
        <span><b>Ảnh bằng chứng{e.slotCode ? ` hộp ${e.slotCode}` : ''}</b><small>{time}</small></span>
        <StatusBadge kind="evidence" value={e.reviewStatus} />
      </div>
    )
  }
  if (item.slotEvent) {
    const s = item.slotEvent
    return (
      <div className="op-tile">
        <OpIcon tone="mute" round><Shell size={18} /></OpIcon>
        <span><b>Sự kiện hộp {s.slotCode}</b><small>{[time, s.eventType, s.note ?? ''].filter(Boolean).join(' · ')}</small></span>
      </div>
    )
  }
  return null
}

export default function BatchTimeline({ code }: { code: string }) {
  const [days, setDays] = useState(7)
  const timeline = useGet<TimelinePage>(`/api/batches/${encodeURIComponent(code)}/timeline`, { days }, { retry: false })
  return (
    <OpPanel
      title="Nhật trình của Lô"
      action={
        <Select sm value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Số ngày hiển thị" style={{ width: 'auto' }}>
          <option value={7}>7 ngày</option>
          <option value={14}>14 ngày</option>
          <option value={30}>30 ngày</option>
        </Select>
      }
    >
      <QueryView query={timeline}>
        {(page) => page.groups.length === 0 ? <OpEmpty title="Chưa có gì trong khoảng ngày này" /> : (
          <div className="op-stack">
            {page.groups.map((g) => (
              <div key={g.date} className="op-stack" style={{ gap: 8 }}>
                <p className="rd-eyebrow">{formatDate(g.date)}</p>
                {g.items.map((item) => <Entry key={item.id} item={item} />)}
              </div>
            ))}
          </div>
        )}
      </QueryView>
    </OpPanel>
  )
}

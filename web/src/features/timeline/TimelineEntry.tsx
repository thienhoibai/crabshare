import { BellRing, Camera, Download, NotebookPen, Package, Shell } from 'lucide-react'
import type { ReactNode } from 'react'
import { AuthImage, OpBadge, OpBtn, OpFacts, OpIcon, StatusBadge, label, openFile, type Tone } from '../../shared/ui/console'
import { CRAB_EVENT, EVENT_SOURCE, MEDIA, PLAUSIBILITY, SLOT_EVENT, timeLabel, timelineFilePath, type TimelineItem } from './timelineApi'

const num = (n: number | null, unit: string) => (n == null ? '—' : `${n.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}${unit}`)

/** Một ghi nhận trong nhật trình: nhật ký chăm sóc, sự kiện hộp, bằng chứng đã chấp nhận, cảnh báo hoặc sự kiện của một con cua. */
export function TimelineEntry({ item, code }: { item: TimelineItem; code: string }) {
  const { productionLog: log, slotEvent: slot, evidence, alert, crabEvent: crab } = item
  let icon: ReactNode = <NotebookPen size={20} />
  let tone: Tone = 'mute'
  let title = 'Ghi nhận'
  let body: ReactNode = null

  if (log) {
    const flag = PLAUSIBILITY[log.plausibilityFlag]
    title = 'Nhật ký chăm sóc'
    tone = 'info'
    body = (
      <>
        <OpFacts items={[
          { label: 'pH', value: num(log.ph, '') },
          { label: 'Nhiệt độ nước', value: num(log.waterTempC, ' °C') },
          { label: 'Độ mặn', value: num(log.salinityPpt, ' ‰') },
          { label: 'Thức ăn', value: num(log.feedKg, ' kg') },
        ]} />
        {log.note && <p className="tl-item__note">{log.note}</p>}
        {log.plausibilityFlag !== 'Ok' && <div><OpBadge tone={flag?.[1] ?? 'warn'}>{flag?.[0] ?? log.plausibilityFlag}</OpBadge></div>}
      </>
    )
  } else if (slot) {
    title = SLOT_EVENT[slot.eventType] ?? slot.eventType
    icon = <Package size={20} />
    tone = slot.eventType === 'Mortality' ? 'danger' : 'ok'
    body = (
      <>
        <p>Hộp <b className="op-mono">{slot.slotCode}</b>{slot.destinationSlotCode && <> sang hộp <b className="op-mono">{slot.destinationSlotCode}</b></>} · {slot.quantity} con</p>
        {slot.note && <p className="tl-item__note">{slot.note}</p>}
      </>
    )
  } else if (evidence) {
    const path = timelineFilePath(code, item.sourceId)
    title = MEDIA[evidence.mediaType] ?? evidence.mediaType
    icon = <Camera size={20} />
    tone = 'ok'
    body = (
      <>
        <div className="op-inline">
          <StatusBadge kind="evidence" value={evidence.reviewStatus} />
          {evidence.slotCode && <OpBadge tone="mute">Hộp {evidence.slotCode}</OpBadge>}
        </div>
        {evidence.mediaType === 'Photo'
          ? <div className="tl-item__photo"><AuthImage path={path} alt={`Ảnh bằng chứng${evidence.slotCode ? ` hộp ${evidence.slotCode}` : ''} ${item.sourceId}`} /></div>
          : <div><OpBtn variant="ghost" sm onClick={() => void openFile(path)}><Download size={15} /> Mở {evidence.mediaType === 'Video' ? 'video' : 'chứng từ'}</OpBtn></div>}
      </>
    )
  } else if (alert) {
    title = label('alertType', alert.type)
    icon = <BellRing size={20} />
    tone = alert.severity === 'High' || alert.severity === 'Critical' ? 'danger' : 'warn'
    body = (
      <>
        <div className="op-inline">
          <StatusBadge kind="severity" value={alert.severity} />
          <StatusBadge kind="alert" value={alert.status} />
        </div>
        <p className="tl-item__note">{alert.message}</p>
      </>
    )
  } else if (crab) {
    const kind = CRAB_EVENT[crab.eventType]
    title = kind?.[0] ?? crab.eventType
    icon = <Shell size={20} />
    tone = kind?.[1] ?? 'mute'
    body = (
      <p>
        Cua <b className="op-mono">{crab.crabCode}</b>{crab.slotCode && <> · hộp <b className="op-mono">{crab.slotCode}</b></>}{crab.reason && <> · {crab.reason}</>}
        <span className="rd-muted"> · {EVENT_SOURCE[crab.source] ?? crab.source}</span>
      </p>
    )
  }

  return (
    <li className="tl-item">
      <OpIcon tone={tone}>{icon}</OpIcon>
      <div className="tl-item__body">
        <div className="tl-item__head">
          <b>{title}</b>
          {item.occurredAt && <small>{timeLabel(item.occurredAt)}</small>}
        </div>
        {body}
      </div>
    </li>
  )
}

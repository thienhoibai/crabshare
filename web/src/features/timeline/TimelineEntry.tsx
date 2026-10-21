import { BookOpen, Camera, CheckCheck, CircleAlert, MoveRight, Shell, Waves } from 'lucide-react'
import { EvidenceMedia } from './EvidenceMedia'
import { alertLabels, severityLabels, slotLabels, statusLabels, timeLabel, type TimelineItem } from './timelineApi'

const number = (n: number | null) => n == null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 3 })
const types = {
  ProductionLog: { label: 'Nhật ký', icon: BookOpen },
  SlotEvent: { label: 'Sự kiện hộp', icon: Shell },
  Evidence: { label: 'Bằng chứng', icon: Camera },
  Alert: { label: 'Cảnh báo', icon: CircleAlert },
}
export function TimelineEntry({ item, code, onDenied }: { item: TimelineItem; code: string; onDenied: () => void }) {
  const kind = types[item.type]; const Icon = kind.icon
  const log = item.productionLog; const slot = item.slotEvent; const evidence = item.evidence; const alert = item.alert
  return <li className={`tl-entry tl-entry-${item.type.toLowerCase()}`} data-timeline-id={item.id}>
    <span className="tl-marker" aria-hidden="true"><Icon size={18} /></span>
    <article className="tl-card">
      <header className="tl-entry-head"><span className="tl-kind">{kind.label}</span>
        <span className="tl-time">{item.occurredAt ? <><time dateTime={item.occurredAt}>{timeLabel(item.occurredAt)}</time>{item.timeBasis === 'Received' && ' · Giờ tiếp nhận'}</> : 'Ghi nhận theo ngày'}</span>
      </header>
      {log && <>
        <h4><Waves size={20} aria-hidden="true" /> Môi trường & chăm sóc</h4>
        <dl className="tl-metrics">{[
          ['pH', log.ph, ''], ['Nhiệt độ', log.waterTempC, '°C'], ['Độ mặn', log.salinityPpt, 'ppt'], ['Thức ăn', log.feedKg, 'kg'],
        ].map(([label, value, unit]) => <div key={String(label)}><dt>{label}</dt><dd><b>{number(value as number | null)}</b> <span>{unit}</span></dd></div>)}</dl>
        {log.note && <p className="tl-note">{log.note}</p>}
        <div className="tl-meta"><span>{log.source === 'Manual' ? 'Nhật ký hộ nuôi' : 'Hệ thống trại'}</span><span>{({ Ok: 'Trong ngưỡng đã áp dụng', OutOfRange: 'Ngoài ngưỡng đã áp dụng', Inconsistent: 'Cần đối chiếu số liệu' } as Record<string, string>)[log.plausibilityFlag] ?? log.plausibilityFlag}</span></div>
      </>}
      {slot && <>
        <h4>{slotLabels[slot.eventType] ?? slot.eventType}</h4>
        <div className="tl-slot"><span>Hộp</span><strong>{slot.slotCode}{slot.destinationSlotCode && ` → ${slot.destinationSlotCode}`}</strong><span>{slot.quantity} con</span><MoveRight size={18} aria-hidden="true" /></div>
        {slot.note && <p className="tl-note">{slot.note}</p>}
      </>}
      {evidence && <>
        <h4>{evidence.mediaType === 'Photo' ? 'Ảnh ghi nhận tại trại' : evidence.mediaType === 'Video' ? 'Video ghi nhận' : 'Chứng từ sản xuất'}</h4>
        <div className="tl-meta"><span className="tl-accepted"><CheckCheck size={16} /> Đã chấp nhận</span>{evidence.slotCode && <span>Hộp {evidence.slotCode}</span>}</div>
        <EvidenceMedia code={code} item={item} onDenied={onDenied} />
      </>}
      {alert && <>
        <h4>{alertLabels[alert.type] ?? alert.type}</h4>
        <div className="tl-meta"><span className={`tl-severity tl-severity-${alert.severity.toLowerCase()}`}>Mức độ {severityLabels[alert.severity] ?? alert.severity}</span><span className="tl-alert-status">{statusLabels[alert.status] ?? alert.status}</span></div>
        <p className="tl-note">{alert.message}</p>
        {alert.acknowledgedAt && <p className="tl-caption">Hộ nuôi phản hồi lúc {new Date(alert.acknowledgedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
      </>}
    </article>
  </li>
}

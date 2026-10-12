import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Droplets } from 'lucide-react'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpFacts, OpHeading, OpIcon } from './operatorUi'

const alerts = [
  { id: 1, batch: 'BATCH-2026-11A', box: 'S-54', title: 'Độ pH tăng đột biến', time: '10 phút trước', severity: 'high', desc: 'pH đạt 8,5 (ngưỡng an toàn 7,5–8,0).' },
  { id: 2, batch: 'BATCH-2026-11A', box: 'S-102', title: 'Thiếu nhật ký hằng ngày', time: '1 giờ trước', severity: 'medium', desc: 'Chưa nhập nhật ký hôm nay (nhiệt độ nước, pH, thức ăn).' },
]

export default function OperatorAlerts() {
  const high = alerts.filter((a) => a.severity === 'high').length

  return (
    <OperatorLayout activeTab="alerts">
      <OpHeading
        eyebrow="Cảnh báo"
        title="Trung tâm cảnh báo"
        description="Sinh từ chỉ số người nuôi nhập trong nhật ký hằng ngày (nhiệt độ nước, độ mặn, pH) và khi thiếu nhật ký."
      />

      <OpFacts
        items={[
          { label: 'Đang mở', value: alerts.length, tone: alerts.length ? 'danger' : 'ok' },
          { label: 'Nghiêm trọng', value: high, tone: high ? 'danger' : undefined },
          { label: 'Trung bình', value: alerts.length - high, tone: 'warn' },
        ]}
      />

      <div className="op-panel op-list">
        {alerts.map((a) => {
          const isHigh = a.severity === 'high'
          return (
            <article key={a.id} className="op-row op-row--alert">
              <OpIcon tone={isHigh ? 'danger' : 'warn'} round>{isHigh ? <AlertTriangle size={20} /> : <Droplets size={20} />}</OpIcon>
              <span className="grid gap-1 min-w-0">
                <span className="flex flex-wrap gap-2">
                  <OpBadge tone={isHigh ? 'danger' : 'warn'}>{isHigh ? 'Nghiêm trọng' : 'Trung bình'}</OpBadge>
                  <OpBadge>{a.batch}</OpBadge>
                  <OpBadge tone="gold">Ô {a.box}</OpBadge>
                </span>
                <b className="text-lg">{a.title}</b>
                <span className="op-muted text-sm">{a.desc}</span>
                <span className="op-muted text-xs flex items-center gap-1"><Clock size={12} /> {a.time}</span>
              </span>
              <span className="grid gap-2 justify-items-end">
                <OpBtn variant="ink" sm onClick={() => { window.location.href = `/operator/log?action=resolve&batch=${a.batch}&box=${a.box}` }}>
                  Ghi log xử lý <ArrowRight size={14} />
                </OpBtn>
                <button type="button" className="op-link text-xs">Bỏ qua (báo sai)</button>
              </span>
            </article>
          )
        })}

        {alerts.length === 0 && (
          <div className="op-empty">
            <OpIcon tone="ok" round><CheckCircle2 size={24} /></OpIcon>
            <b>Mọi thứ đều ổn</b>
            <span>Không có cảnh báo lúc này.</span>
          </div>
        )}
      </div>
    </OperatorLayout>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AlertTriangle, CheckCircle2, Clock, Droplets, RefreshCw } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import { acknowledgeAlert, alertSeverities, alertStatuses, alertTypes, myAlerts, type AlertItem } from '../alerts/api'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpFacts, OpHeading, OpIcon } from './operatorUi'

const date = (value: string) => new Date(value).toLocaleString('vi-VN')

function AcknowledgeDialog({ alert, onClose, onDone }: { alert: AlertItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('')
  const mutation = useMutation({ mutationFn: () => acknowledgeAlert(alert.id, note.trim()), onSuccess: onDone })
  return <ActionDialog title="Xác nhận cảnh báo" theme="operator" busy={mutation.isPending} onClose={onClose}>
    <p className="op-muted mb-4">{alert.message}</p>
    <form onSubmit={event => { event.preventDefault(); if (note.trim()) mutation.mutate() }}>
      <label className="grid gap-2 font-bold">Cách xử lý cảnh báo<textarea className="rd-input" required maxLength={300} rows={4} value={note} disabled={mutation.isPending} onChange={event => setNote(event.target.value)} /></label>
      {mutation.isError && <p role="alert" className="mt-3 text-red-700">{errorMessage(mutation.error)}</p>}
      <div className="mt-5 flex justify-end gap-3"><OpBtn type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>Hủy</OpBtn><OpBtn type="submit" variant="ink" disabled={!note.trim() || mutation.isPending}>{mutation.isPending ? 'Đang gửi…' : 'Gửi xác nhận'}</OpBtn></div>
    </form>
  </ActionDialog>
}

export default function OperatorAlerts() {
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<AlertItem | null>(null)
  const [notice, setNotice] = useState('')
  const client = useQueryClient()
  const userId = useAuthStore(state => state.user?.userId)
  const query = useQuery({ queryKey: ['operator-alerts', userId, status], queryFn: () => myAlerts(status), enabled: !!userId, refetchInterval: 4_000 })
  const list = query.data ?? []
  const open = list.filter(a => a.status === 'Open' || a.status === 'Escalated')
  const high = open.filter(a => a.severity === 'High' || a.severity === 'Critical').length
  return <OperatorLayout activeTab="alerts">
    <OpHeading eyebrow="Cảnh báo" title="Trung tâm cảnh báo" description="Theo dõi cảnh báo vận hành và ghi cách xử lý trước hạn phản hồi." />
    <Link to="/operator/evidence" className="rd-btn rd-btn--ghost mb-4">Bằng chứng bị gắn cờ → Giải trình</Link>
    <OpFacts items={[{ label: 'Cần theo dõi', value: open.length, tone: open.length ? 'danger' : 'ok' }, { label: 'Mức cao / nghiêm trọng', value: high, tone: high ? 'danger' : undefined }, { label: 'Đã xác nhận / xử lý', value: list.length - open.length }]} />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 font-bold">Trạng thái<select aria-label="Trạng thái" className="rd-input" value={status} onChange={event => setStatus(event.target.value)}><option value="">Tất cả</option>{Object.entries(alertStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><OpBtn variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch() }}><RefreshCw size={16} /> Làm mới</OpBtn></div>
    {notice && <p role="status" className="mb-4 text-green-700">{notice}</p>}
    {query.isPending ? <p role="status" className="op-panel p-6">Đang tải cảnh báo…</p> : query.isError ? <div role="alert" className="op-panel p-6"><p>{errorMessage(query.error)}</p><OpBtn className="mt-3" onClick={() => { void query.refetch() }}>Thử lại</OpBtn></div> : <div className="op-panel op-list">
      {list.map(a => {
        const isHigh = a.severity === 'High' || a.severity === 'Critical'
        const canAcknowledge = (a.status === 'Open' || a.status === 'Escalated') && !a.acknowledgedAt
        return <article key={a.id} className="op-row op-row--alert">
          <OpIcon tone={isHigh ? 'danger' : 'warn'} round>{isHigh ? <AlertTriangle size={20} /> : <Droplets size={20} />}</OpIcon>
          <span className="grid min-w-0 gap-1"><span className="flex flex-wrap gap-2"><OpBadge tone={isHigh ? 'danger' : 'warn'}>{alertSeverities[a.severity]}</OpBadge><OpBadge>{a.batchCode}</OpBadge><OpBadge>{alertStatuses[a.status]}</OpBadge></span>
            <b className="text-lg">{alertTypes[a.type]}</b><span className="op-muted text-sm break-words">{a.message}</span>
            <span className="op-muted text-xs flex items-center gap-1"><Clock size={12} /> Hạn phản hồi: {date(a.ackDeadline)}</span>
            {a.responseNote && <span className="text-sm break-words">Phản hồi: {a.responseNote}</span>}
            {a.status === 'Escalated' && <span className="text-xs text-red-700">Đã chuyển quản trị theo dõi.</span>}
          </span>
          {canAcknowledge && <OpBtn variant="ink" sm onClick={() => { setNotice(''); setSelected(a) }}>Xác nhận<span className="sr-only"> cảnh báo {a.id}</span></OpBtn>}
        </article>
      })}
      {!list.length && <div className="op-empty"><OpIcon tone="ok" round><CheckCircle2 size={24} /></OpIcon><b>Không có cảnh báo</b><span>Không có cảnh báo phù hợp bộ lọc.</span></div>}
    </div>}
    {selected && <AcknowledgeDialog alert={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); setNotice('Đã gửi phản hồi cảnh báo.'); void client.invalidateQueries({ queryKey: ['operator-alerts'] }) }} />}
  </OperatorLayout>
}

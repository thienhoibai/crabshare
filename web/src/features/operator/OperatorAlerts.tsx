/* /operator/alerts — Cảnh báo của trại (GET /api/operators/me/alerts) và ghi cách xử lý trước hạn phản hồi
   (POST /api/alerts/{id}/acknowledge). Phản hồi trễ hạn thì cảnh báo vẫn chuyển cho Admin theo dõi. */
import { useState } from 'react'
import { AlertTriangle, BellRing } from 'lucide-react'
import type { AcknowledgeAlertRequest, AlertResponse } from '../../shared/api/api.gen'
import {
  Field, OpBtn, OpConfirm, OpEmpty, OpHeading, OpIcon, OpPanel, OpTabs, QueryView, StatusBadge, TextArea, formatDateTime, label, tone, useGet, useSend,
} from '../../shared/ui/console'

type Filter = 'todo' | 'Acknowledged' | 'Resolved' | 'all'
const isOpen = (a: AlertResponse) => a.status === 'Open' || a.status === 'Escalated'
const needsReply = (a: AlertResponse) => isOpen(a) && !a.acknowledgedAt
const isLate = (a: AlertResponse) => new Date(a.ackDeadline).getTime() < Date.now()

function AcknowledgeDialog({ alert, onClose }: { alert: AlertResponse; onClose: () => void }) {
  const [note, setNote] = useState('')
  const acknowledge = useSend<AlertResponse, AcknowledgeAlertRequest>('post', `/api/alerts/${alert.id}/acknowledge`, { success: 'Đã ghi cách xử lý.', onSuccess: onClose, quietError: true })
  return (
    <OpConfirm
      title={label('alertType', alert.type)}
      sub={alert.message}
      confirmLabel="Gửi"
      pending={acknowledge.isPending}
      error={acknowledge.error}
      disabled={!note.trim()}
      onClose={onClose}
      onConfirm={() => acknowledge.mutate({ responseNote: note.trim() })}
    >
      <Field label="Đã xử lý thế nào" required>
        <TextArea rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Field>
      {isLate(alert) && <p className="rd-muted">Đã quá hạn phản hồi nên Admin vẫn theo dõi cảnh báo này.</p>}
    </OpConfirm>
  )
}

export default function OperatorAlerts() {
  const [filter, setFilter] = useState<Filter>('todo')
  const [selected, setSelected] = useState<AlertResponse | null>(null)
  const alerts = useGet<AlertResponse[]>('/api/operators/me/alerts', undefined, { refetchInterval: 30_000 })
  const all = alerts.data ?? []
  const shown = all.filter((a) => (filter === 'all' ? true : filter === 'todo' ? isOpen(a) : a.status === filter))
  // Chỉ cảnh báo đầu tiên cần phản hồi có nút chính, để màn hình có một việc nổi bật.
  const firstToReply = shown.find(needsReply)?.id

  return (
    <>
      <OpHeading eyebrow="Vận hành" title="Cảnh báo" />
      <OpTabs<Filter>
        value={filter}
        onChange={setFilter}
        items={[
          { key: 'todo', label: 'Đang mở', count: all.filter(isOpen).length },
          { key: 'Acknowledged', label: 'Đã ghi nhận' },
          { key: 'Resolved', label: 'Đã xử lý' },
          { key: 'all', label: 'Tất cả' },
        ]}
      />

      <QueryView query={alerts}>
        {() => shown.length === 0 ? <OpEmpty title={filter === 'todo' ? 'Không có cảnh báo đang mở' : 'Không có cảnh báo nào ở mục này'} icon={<BellRing size={30} />} /> : (
          <OpPanel className="op-list">
            {shown.map((a) => (
              <article key={a.id} className="op-row op-row--alert">
                <OpIcon tone={tone('severity', a.severity)} round><AlertTriangle size={20} /></OpIcon>
                <span className="op-stack" style={{ gap: 6 }}>
                  <span className="op-inline">
                    <b>{label('alertType', a.type)}</b>
                    <StatusBadge kind="severity" value={a.severity} />
                    {a.status !== 'Open' && <StatusBadge kind="alert" value={a.status} />}
                  </span>
                  <span className="rd-muted">{a.message}</span>
                  <small className={needsReply(a) && isLate(a) ? 'op-danger' : 'rd-muted'}>
                    <a className="op-link" href={`/operator/batches/${encodeURIComponent(a.batchCode)}`}>{a.batchCode}</a>
                    {' · '}{needsReply(a) ? `hạn phản hồi ${formatDateTime(a.ackDeadline)}` : formatDateTime(a.raisedAt)}
                  </small>
                  {a.responseNote && <span>Đã xử lý: {a.responseNote}</span>}
                  {a.resolutionNote && <span>Admin: {a.resolutionNote}</span>}
                </span>
                <span>{needsReply(a) && <OpBtn sm variant={a.id === firstToReply ? 'primary' : 'ghost'} onClick={() => setSelected(a)}>Ghi cách xử lý</OpBtn>}</span>
              </article>
            ))}
          </OpPanel>
        )}
      </QueryView>

      {selected && <AcknowledgeDialog alert={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

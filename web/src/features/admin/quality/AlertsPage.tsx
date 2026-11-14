/* /admin/alerts — Cảnh báo vận hành của mọi Lô (GET /api/admin/alerts) và đóng cảnh báo kèm ghi chú (POST …/resolve). */
import { useState } from 'react'
import { CheckCheck, Search } from 'lucide-react'
import type { AlertResponse, PagedResultOfAlertResponse, ResolveAlertRequest } from '../../../shared/api/api.gen'
import {
  Field, Input, OpBtn, OpConfirm, OpHeading, OpPanel, OpTable, OpTabs, QueryView, Select, StatusBadge, TextArea,
  formatDateTime, label, options, useGet, useSend,
} from '../../../shared/ui/console'
import { Cell, Pager } from './shared'

type Tab = 'Escalated' | 'Open' | 'Acknowledged' | 'Resolved' | 'all'
const PAGE_SIZE = 20

/** Số cảnh báo ở một trạng thái, để hiện trên tab. */
const useAlertCount = (status: string) => useGet<PagedResultOfAlertResponse>(`/api/admin/alerts?Status=${status}`, { PageSize: 1 })

function ResolveDialog({ alert, onClose }: { alert: AlertResponse; onClose: () => void }) {
  const [note, setNote] = useState('')
  const resolve = useSend<AlertResponse, ResolveAlertRequest>('post', `/api/admin/alerts/${alert.id}/resolve`, {
    quietError: true,
    success: 'Đã đóng cảnh báo.',
    onSuccess: onClose,
  })
  return (
    <OpConfirm
      title={`Đóng cảnh báo #${alert.id}`}
      sub={`${alert.batchCode} · ${label('alertType', alert.type)}`}
      confirmLabel="Đóng cảnh báo"
      pending={resolve.isPending}
      error={resolve.error}
      disabled={!note.trim()}
      onClose={onClose}
      onConfirm={() => resolve.mutate({ note: note.trim() })}
    >
      <p className="ab-quote">{alert.message}</p>
      {alert.responseNote && <p className="ab-quote op-muted">Người nuôi: {alert.responseNote}</p>}
      <Field label="Kết quả xử lý" required>
        <TextArea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </OpConfirm>
  )
}

export default function AlertsPage() {
  const [picked, setPicked] = useState<Tab | null>(null)
  const [severity, setSeverity] = useState('')
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState<AlertResponse | null>(null)

  const escalated = useAlertCount('Escalated')
  const open = useAlertCount('Open')
  const acknowledged = useAlertCount('Acknowledged')
  // Chưa chọn mục: ưu tiên cảnh báo đã chuyển cấp, không có thì mở mục đang mở.
  const tab: Tab = picked ?? (escalated.data?.total ? 'Escalated' : open.data?.total ? 'Open' : 'Escalated')
  // Bỏ trống Status thì máy chủ mặc định chỉ trả cảnh báo đã chuyển cấp, nên mục "Tất cả" gửi Status rỗng.
  const alerts = useGet<PagedResultOfAlertResponse>(`/api/admin/alerts?Status=${tab === 'all' ? '' : tab}`, { Severity: severity, Q: q, Page: page, PageSize: PAGE_SIZE })

  return (
    <>
      <OpHeading eyebrow="Chất lượng" title="Cảnh báo" />
      <form className="op-toolbar" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); setPage(1) }}>
        <OpTabs
          value={tab}
          onChange={(key) => { setPicked(key); setPage(1) }}
          items={[
            { key: 'Escalated', label: 'Chuyển cấp', count: escalated.data?.total },
            { key: 'Open', label: 'Đang mở', count: open.data?.total },
            { key: 'Acknowledged', label: 'Đã ghi nhận', count: acknowledged.data?.total },
            { key: 'Resolved', label: 'Đã xử lý' },
            { key: 'all', label: 'Tất cả' },
          ]}
        />
        <Select aria-label="Lọc theo mức độ" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1) }}>
          <option value="">Mọi mức độ</option>
          {options('severity').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Input className="op-toolbar__grow" type="search" aria-label="Tìm cảnh báo" placeholder="Tìm Lô, trại, nội dung" maxLength={100} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="rd-iconbtn" aria-label="Tìm"><Search size={17} /></button>
      </form>
      <QueryView query={alerts}>
        {(data) => (
          <OpPanel>
            <OpTable
              rows={data.items}
              rowKey={(a) => a.id}
              empty={tab === 'Escalated' && !q && !severity ? 'Không có cảnh báo nào bị chuyển cấp' : 'Không có cảnh báo nào khớp'}
              columns={[
                { key: 'severity', header: 'Mức độ', cell: (a) => <StatusBadge kind="severity" value={a.severity} /> },
                {
                  key: 'message', header: 'Cảnh báo',
                  cell: (a) => (
                    <Cell
                      main={<><b>{label('alertType', a.type)}</b> · {a.message}</>}
                      sub={[a.responseNote ? `Người nuôi: ${a.responseNote}` : null, a.resolutionNote ? `Kết quả: ${a.resolutionNote}` : null].filter(Boolean).join(' · ')}
                    />
                  ),
                },
                { key: 'batch', header: 'Lô', cell: (a) => <Cell main={a.batchCode} sub={a.farmName} /> },
                {
                  key: 'time', header: 'Phát sinh',
                  cell: (a) => <Cell main={formatDateTime(a.raisedAt)} sub={a.escalatedAt ? `Chuyển cấp ${formatDateTime(a.escalatedAt)}` : `Hạn ${formatDateTime(a.ackDeadline)}`} />,
                },
                { key: 'status', header: 'Trạng thái', cell: (a) => <StatusBadge kind="alert" value={a.status} /> },
                {
                  key: 'action', header: '',
                  cell: (a) => (a.status === 'Resolved' ? null : <OpBtn sm variant={a.status === 'Escalated' ? 'primary' : 'ghost'} onClick={() => setResolving(a)}><CheckCheck size={15} /> Đóng</OpBtn>),
                },
              ]}
            />
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </OpPanel>
        )}
      </QueryView>
      {resolving && <ResolveDialog alert={resolving} onClose={() => setResolving(null)} />}
    </>
  )
}

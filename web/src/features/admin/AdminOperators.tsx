/* /admin/operators — Hồ sơ hộ nuôi (UC05): duyệt kèm số hộp tối đa, từ chối, tạm dừng hoặc mở lại kèm lý do.
   GET /api/admin/operators?status=; POST /api/admin/operators/{id}/approve | reject | suspend | reinstate.
   Hồ sơ bị từ chối chưa có luồng gửi lại. */
import { useState } from 'react'
import { Check, Pause, Play, X } from 'lucide-react'
import type { AdminOperatorResponse, ApproveOperatorRequest, OperatorDecisionRequest, PagedResultOfAdminOperatorResponse } from '../../shared/api/api.gen'
import {
  Field, NumberInput, OpBtn, OpConfirm, OpHeading, OpNote, OpPanel, OpTable, OpTabs, QueryView, StatusBadge, formatDate, useGet, useSend,
} from '../../shared/ui/console'
import { Pager, ReasonField, useUrlFilters } from './adminPartA'

const TABS = [
  { key: 'Submitted', label: 'Chờ duyệt' },
  { key: 'Approved', label: 'Đã duyệt' },
  { key: 'Rejected', label: 'Bị từ chối' },
  { key: 'Suspended', label: 'Tạm dừng' },
  { key: 'Draft', label: 'Bản nháp' },
  { key: 'all', label: 'Tất cả' },
] as const
type TabKey = (typeof TABS)[number]['key']
type Action = 'approve' | 'reject' | 'suspend' | 'reinstate'

const ACTION_TEXT: Record<Action, { title: string; confirm: string; done: string }> = {
  approve: { title: 'Duyệt hồ sơ hộ nuôi', confirm: 'Duyệt', done: 'Đã duyệt hồ sơ hộ nuôi.' },
  reject: { title: 'Từ chối hồ sơ hộ nuôi', confirm: 'Từ chối', done: 'Đã từ chối hồ sơ hộ nuôi.' },
  suspend: { title: 'Tạm dừng hộ nuôi', confirm: 'Tạm dừng', done: 'Đã tạm dừng hộ nuôi.' },
  reinstate: { title: 'Mở lại hộ nuôi', confirm: 'Mở lại', done: 'Đã mở lại hộ nuôi.' },
}

export default function AdminOperators() {
  const filters = useUrlFilters()
  const tab = (TABS.find((t) => t.key === filters.get('status'))?.key ?? 'Submitted') as TabKey
  const list = useGet<PagedResultOfAdminOperatorResponse>('/api/admin/operators', { status: tab === 'all' ? '' : tab, page: filters.page, pageSize: 20 })

  const [target, setTarget] = useState<{ farm: AdminOperatorResponse; action: Action } | null>(null)
  const [capacity, setCapacity] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const close = () => setTarget(null)

  // Đường dẫn lấy từ dòng đang mở hộp xác nhận; body đúng theo DTO của từng thao tác.
  const send = useSend<AdminOperatorResponse, ApproveOperatorRequest | OperatorDecisionRequest>(
    'post',
    () => `/api/admin/operators/${target?.farm.operatorId}/${target?.action}`,
    { success: () => (target ? ACTION_TEXT[target.action].done : 'Đã lưu.'), quietError: true, onSuccess: close },
  )

  const open = (farm: AdminOperatorResponse, action: Action) => {
    send.reset()
    setCapacity(farm.approvedSlotCapacity > 0 ? farm.approvedSlotCapacity : null)
    setReason('')
    setTarget({ farm, action })
  }

  return (
    <>
      <OpHeading eyebrow="Đối tác và tài khoản" title="Hộ nuôi" />
      <OpTabs items={TABS} value={tab} onChange={(key) => filters.set({ status: key === 'Submitted' ? null : key })} label="Lọc theo trạng thái hồ sơ" />

      <OpPanel>
        <QueryView query={list}>
          {(page) => (
            <>
              <OpTable
                rows={page.items}
                rowKey={(f) => f.operatorId}
                empty={tab === 'Submitted' ? 'Không có hồ sơ nào chờ duyệt' : 'Không có hộ nuôi nào ở trạng thái này'}
                columns={[
                  {
                    key: 'name', header: 'Hộ nuôi',
                    cell: (f) => (
                      <>
                        <b>{f.legalName}</b>
                        <br />
                        <small className="rd-muted">{f.farmAddress} · MST {f.taxCode} · ĐKKD {f.businessRegNo}</small>
                      </>
                    ),
                  },
                  { key: 'status', header: 'Trạng thái', cell: (f) => <StatusBadge kind="operator" value={f.status} /> },
                  { key: 'cap', header: 'Số hộp được duyệt', num: true, cell: (f) => (f.status === 'Approved' || f.status === 'Suspended' ? f.approvedSlotCapacity : '—') },
                  { key: 'time', header: 'Gửi ngày', cell: (f) => formatDate(f.submittedAt) || '—' },
                  {
                    key: 'act', header: '', cell: (f) => (
                      <span className="op-inline">
                        {f.status === 'Submitted' && <OpBtn sm variant="ink" onClick={() => open(f, 'approve')}><Check size={15} /> Duyệt</OpBtn>}
                        {f.status === 'Submitted' && <OpBtn sm variant="danger" onClick={() => open(f, 'reject')}><X size={15} /> Từ chối</OpBtn>}
                        {f.status === 'Approved' && <OpBtn sm variant="danger" onClick={() => open(f, 'suspend')}><Pause size={15} /> Tạm dừng</OpBtn>}
                        {f.status === 'Suspended' && <OpBtn sm variant="ink" onClick={() => open(f, 'reinstate')}><Play size={15} /> Mở lại</OpBtn>}
                      </span>
                    ),
                  },
                ]}
              />
              <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(n) => filters.set({ page: n })} />
            </>
          )}
        </QueryView>
      </OpPanel>

      {target && (
        <OpConfirm
          title={ACTION_TEXT[target.action].title}
          sub={target.farm.legalName}
          confirmLabel={ACTION_TEXT[target.action].confirm}
          variant={target.action === 'approve' || target.action === 'reinstate' ? 'primary' : 'danger'}
          pending={send.isPending}
          error={send.error}
          disabled={target.action === 'approve' ? capacity === null : !reason.trim()}
          onConfirm={() => send.mutate(target.action === 'approve' ? { approvedSlotCapacity: capacity } : { reason: reason.trim() })}
          onClose={close}
        >
          {target.action === 'approve' ? (
            <Field label="Số hộp nuôi tối đa được duyệt" required>
              <NumberInput value={capacity} onChange={setCapacity} unit="hộp" max={2_147_483_647} autoFocus />
            </Field>
          ) : (
            <ReasonField value={reason} onChange={setReason} />
          )}
          {target.action === 'suspend' && <OpNote tone="danger">Hộ nuôi tạm dừng không tạo được Lô mới, không ghi nhật ký và không gửi ảnh bằng chứng cho tới khi được mở lại.</OpNote>}
          {target.action === 'reinstate' && <OpNote>Hộ nuôi hoạt động lại với số hộp đã duyệt trước đó.</OpNote>}
        </OpConfirm>
      )}
    </>
  )
}

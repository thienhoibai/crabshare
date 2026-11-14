/* /admin/claims — Khiếu nại và trả hàng của mọi Lô (GET /api/admin/claims). Admin quyết định cuối khi người nuôi quá hạn phản hồi
   hoặc khách không đồng ý với phản hồi (BR-174). Tối đa 500 dòng, mới nhất trước. */
import { useState } from 'react'
import type { ClaimResponse } from '../../../shared/api/api.gen'
import { OpBadge, OpHeading, OpPanel, OpTable, OpTabs, QueryView, StatusBadge, formatDateTime, formatVnd, label, useGet } from '../../../shared/ui/console'
import { Cell, formatKg, isPast, needsAdmin } from './shared'

type Tab = 'waiting' | 'running' | 'closed' | 'all'

const FILTERS: Record<Tab, (c: ClaimResponse) => boolean> = {
  waiting: needsAdmin,
  running: (c) => !needsAdmin(c) && ['Open', 'OperatorAccepted', 'OperatorRejected'].includes(c.status),
  closed: (c) => c.status === 'Accepted' || c.status === 'Rejected',
  all: () => true,
}

const EMPTY: Record<Tab, string> = {
  waiting: 'Không có khiếu nại nào chờ bạn quyết định',
  running: 'Không có khiếu nại nào đang xử lý',
  closed: 'Chưa có khiếu nại nào đã chốt',
  all: 'Chưa có khiếu nại nào',
}

export default function ClaimsPage() {
  const claims = useGet<ClaimResponse[]>('/api/admin/claims')
  const [tab, setTab] = useState<Tab>('waiting')
  const count = (key: Tab) => (claims.data ?? []).filter(FILTERS[key]).length

  return (
    <>
      <OpHeading eyebrow="Chất lượng" title="Khiếu nại chờ quyết định" />
      <OpTabs
        value={tab}
        onChange={setTab}
        items={[
          { key: 'waiting', label: 'Chờ quyết định', count: count('waiting') },
          { key: 'running', label: 'Đang xử lý', count: count('running') },
          { key: 'closed', label: 'Đã chốt' },
          { key: 'all', label: 'Tất cả' },
        ]}
      />
      <QueryView query={claims}>
        {(list) => (
          <OpPanel>
            <OpTable
              rows={list.filter(FILTERS[tab])}
              rowKey={(c) => c.claimNo}
              empty={EMPTY[tab]}
              columns={[
                { key: 'no', header: 'Khiếu nại', cell: (c) => <Cell main={<b>{label('issueType', c.issueType)}</b>} sub={`${label('claimType', c.claimType)} · ${c.claimNo}`} /> },
                { key: 'order', header: 'Đơn', cell: (c) => <Cell main={c.orderNo} sub={c.specCode} /> },
                {
                  key: 'affected', header: 'Bị ảnh hưởng', num: true,
                  cell: (c) => [c.affectedCrabs !== null ? `${c.affectedCrabs} con` : null, c.affectedKg !== null ? formatKg(c.affectedKg) : null].filter(Boolean).join(' · '),
                },
                { key: 'created', header: 'Gửi lúc', cell: (c) => formatDateTime(c.createdAt) },
                {
                  key: 'status', header: 'Trạng thái',
                  cell: (c) => (
                    <Cell
                      main={
                        <span className="op-inline">
                          <StatusBadge kind="claim" value={c.status} />
                          {c.status === 'Open' && isPast(c.responseDueAt) && <OpBadge tone="danger">Quá hạn phản hồi</OpBadge>}
                        </span>
                      }
                      sub={c.refundAmount ? `Hoàn ${formatVnd(c.refundAmount)}` : undefined}
                    />
                  ),
                },
                {
                  key: 'go', header: '',
                  cell: (c) => (needsAdmin(c)
                    ? <a className="rd-btn rd-btn--primary rd-btn--sm" href={`/admin/claims/${encodeURIComponent(c.claimNo)}`}>Quyết định</a>
                    : <a className="op-link" href={`/admin/claims/${encodeURIComponent(c.claimNo)}`}>Xem</a>),
                },
              ]}
            />
          </OpPanel>
        )}
      </QueryView>
    </>
  )
}

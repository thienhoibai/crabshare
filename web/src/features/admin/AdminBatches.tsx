/* /admin/batches — Mọi Lô của nền tảng: lọc theo trạng thái và phương thức, mở trang xét duyệt của từng Lô.
   GET /api/admin/batches?status=&batchMode=. Lô T và Lô A do Quản trị tạo ở /admin/batches/new. */
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import {
  Money, OpHeading, OpPanel, OpTable, QueryView, Select, StatusBadge, formatDate, label, options, useGet,
} from '../../shared/ui/console'
import { Pager, useUrlFilters, type AdminBatchPage } from './adminPartA'

/** Các trạng thái mà GET /api/admin/batches nhận ở bộ lọc. */
const BATCH_STATUS_FILTERS = [
  'PendingApproval', 'Draft', 'NeedsRevision', 'Rejected', 'Funding', 'Sourcing', 'Stocked', 'InProduction', 'Harvesting', 'Selling', 'Settlement', 'Closed',
  'Cancelled',
]

export default function AdminBatches() {
  const navigate = useNavigate()
  const filters = useUrlFilters()
  const status = BATCH_STATUS_FILTERS.includes(filters.get('status')) ? filters.get('status') : ''
  const batchMode = ['P', 'T', 'A'].includes(filters.get('batchMode')) ? filters.get('batchMode') : ''
  const list = useGet<AdminBatchPage>('/api/admin/batches', { status, batchMode, page: filters.page, pageSize: 20 })

  return (
    <>
      <OpHeading
        eyebrow="Lô"
        title="Duyệt và tạo Lô"
        action={<a className="rd-btn rd-btn--primary" href="/admin/batches/new"><Plus size={17} /> Tạo Lô T hoặc A</a>}
      />
      <div className="op-toolbar">
        <Select aria-label="Trạng thái" value={status} onChange={(e) => filters.set({ status: e.target.value })}>
          <option value="">Mọi trạng thái</option>
          {BATCH_STATUS_FILTERS.map((s) => <option key={s} value={s}>{label('batch', s)}</option>)}
        </Select>
        <Select aria-label="Phương thức" value={batchMode} onChange={(e) => filters.set({ batchMode: e.target.value })}>
          <option value="">Mọi phương thức</option>
          {options('batchMode').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <OpPanel>
        <QueryView query={list}>
          {(page) => (
            <>
              <OpTable
                rows={page.items}
                rowKey={(r) => r.batch.batchCode}
                empty={status === 'PendingApproval' ? 'Không có Lô nào chờ duyệt' : 'Không có Lô nào khớp'}
                onRowClick={(r) => navigate(`/admin/batches/${encodeURIComponent(r.batch.batchCode)}`)}
                columns={[
                  { key: 'code', header: 'Lô', cell: (r) => <><b>{r.batch.title}</b><br /><small className="rd-muted"><span className="op-mono">{r.batch.batchCode}</span> · {label('crabType', r.batch.crabType)} · {r.operatorName}</small></> },
                  { key: 'mode', header: 'Phương thức', cell: ({ batch: b }) => <StatusBadge kind="batchMode" value={b.batchMode} /> },
                  { key: 'status', header: 'Trạng thái', cell: ({ batch: b }) => <StatusBadge kind="batch" value={b.status} /> },
                  {
                    key: 'size', header: 'Quy mô', num: true,
                    cell: ({ batch: b }) => <>{b.plannedQuantity} con{b.batchMode === 'P' ? <><br /><small className="rd-muted"><Money value={b.targetCapital} /></small></> : null}</>,
                  },
                  { key: 'deadline', header: 'Hạn', cell: ({ batch: b }) => formatDate(b.batchMode === 'P' ? b.fundingDeadline : b.preorderDeadline) || '—' },
                ]}
              />
              <Pager page={page.page} pageSize={page.pageSize} total={page.total} onPage={(n) => filters.set({ page: n })} />
            </>
          )}
        </QueryView>
      </OpPanel>
    </>
  )
}

/* /operator/batches — Lô của hộ nuôi (GET /api/operators/me/batches?status=&batchMode=&page=&pageSize=).
   Mỗi dòng mở trang làm việc của Lô. Người nuôi tạo Lô P; Lô T và Lô A do Admin tạo rồi giao cho trại vận hành. */
import { useState } from 'react'
import { LayoutGrid, Plus } from 'lucide-react'
import type { PagedResultOfBatchResponse } from '../../shared/api/api.gen'
import {
  OpBadge, OpEmpty, OpHeading, OpPanel, OpRow, QueryView, Select, StatusBadge, crabImg, formatDate, label, tone, useGet,
} from '../../shared/ui/console'
import { num } from './opA'
import Pager from './Pager'

/** Các trạng thái mà bộ lọc của API nhận (BatchListQuery). */
const STATUSES = ['Draft', 'PendingApproval', 'NeedsRevision', 'Funding', 'Sourcing', 'InProduction', 'Harvesting', 'Selling', 'Settlement', 'Closed', 'Rejected', 'Cancelled']
const PAGE_SIZE = 20

export default function OperatorBatches() {
  const [status, setStatus] = useState('')
  const [batchMode, setBatchMode] = useState('')
  const [page, setPage] = useState(1)
  const batches = useGet<PagedResultOfBatchResponse>('/api/operators/me/batches', { status, batchMode, page, pageSize: PAGE_SIZE })
  const filtered = !!status || !!batchMode

  return (
    <>
      <OpHeading
        eyebrow="Vận hành"
        title="Lô của tôi"
        action={<a className="rd-btn rd-btn--primary" href="/operator/batches/new"><Plus size={16} /> Tạo Lô P</a>}
      />

      <div className="op-toolbar">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Lọc theo trạng thái">
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label('batch', s)}</option>)}
        </Select>
        <Select value={batchMode} onChange={(e) => { setBatchMode(e.target.value); setPage(1) }} aria-label="Lọc theo phương thức">
          <option value="">Mọi phương thức</option>
          {['P', 'T', 'A'].map((m) => <option key={m} value={m}>{label('batchMode', m)}</option>)}
        </Select>
      </div>

      <QueryView query={batches}>
        {(data) => data.items.length === 0 ? (
          <OpEmpty title={filtered ? 'Không có Lô nào khớp bộ lọc' : 'Chưa có Lô nào'} icon={<LayoutGrid size={30} />}>
            {!filtered && <a className="op-link" href="/operator/batches/new">Tạo Lô P đầu tiên</a>}
          </OpEmpty>
        ) : (
          <OpPanel className="op-list">
            {data.items.map((b) => (
              <OpRow
                key={b.batchCode}
                href={`/operator/batches/${encodeURIComponent(b.batchCode)}`}
                media={crabImg(b.crabType)}
                title={b.title}
                sub={`${b.batchCode} · ${label('crabType', b.crabType)}`}
                mid={
                  <>
                    <span className="op-inline"><OpBadge tone={tone('batchMode', b.batchMode)}>Lô {b.batchMode}</OpBadge></span>
                    <small>
                      {num(b.fundedQuantity ?? b.plannedQuantity, ' con')}
                      {b.hasHolding ? ` · nuôi ${b.holdingDays ?? '?'} ngày` : ''}
                      {b.expectedReceiptDate ? ` · nhận cua ${formatDate(b.expectedReceiptDate)}` : ''}
                    </small>
                  </>
                }
                end={
                  <>
                    <StatusBadge kind="batch" value={b.status} />
                    {b.status === 'NeedsRevision' && <small className="op-warn">Admin yêu cầu sửa</small>}
                    {b.status === 'Funding' && b.fundingDeadline && <small>Hạn góp vốn {formatDate(b.fundingDeadline)}</small>}
                  </>
                }
              />
            ))}
            <Pager page={data.page} pageSize={PAGE_SIZE} total={data.total} unit="Lô" onChange={setPage} />
          </OpPanel>
        )}
      </QueryView>
    </>
  )
}

/* /operator/preorders — Đơn đặt trước ở mọi Lô của hộ nuôi tôi. GET /api/operators/me/preorders?batchCode=&page=&pageSize= (BR-084…097).
   Người nuôi chỉ xem; lập chuyến giao ở mục giao hàng của từng Lô. */
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PagedResultOfPreorderResponse } from '../../../shared/api/api.gen'
import { OpFacts, OpHeading, OpPanel, QueryView, Select, formatVnd, label, useGet } from '../../../shared/ui/console'
import { PreorderTable } from './PreorderTable'
import { isOpened, useMyBatches } from './common'

const PAGE_SIZE = 50
const STATUSES = ['PendingDeposit', 'Deposited', 'Confirmed', 'Delivering', 'Delivered', 'Completed', 'CancelRequested', 'Cancelled', 'Forfeited', 'Refunded']
const HOLDING = ['Deposited', 'Confirmed', 'Delivering']

export default function PreordersPage() {
  const [batchCode, setBatchCode] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const batches = useMyBatches()
  const orders = useGet<PagedResultOfPreorderResponse>('/api/operators/me/preorders', { batchCode, page, pageSize: PAGE_SIZE })
  const pick = (code: string) => { setBatchCode(code); setPage(1) }

  return (
    <>
      <OpHeading eyebrow="Bán và giao" title="Đơn đặt trước" description="Bấm mã đơn để mở mục giao hàng của Lô." />

      <QueryView query={orders}>
        {(data) => {
          const rows = status ? data.items.filter((o) => o.status === status) : data.items
          const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
          const active = data.items.filter((o) => HOLDING.includes(o.status))
          return (
            <>
              <OpFacts items={[
                { label: 'Số đơn', value: data.total },
                { label: 'Đang giữ hàng', value: `${active.length} đơn`, tone: 'info' },
                { label: 'Số con đang giữ', value: `${active.reduce((n, o) => n + o.convertedCrabs, 0)} con` },
                { label: 'Giá trị ước tính', value: formatVnd(active.reduce((n, o) => n + o.estimatedValue, 0)) },
              ]} />
              <div className="op-toolbar">
                <Select value={batchCode} onChange={(e) => pick(e.target.value)} aria-label="Lọc theo Lô">
                  <option value="">Tất cả Lô</option>
                  {(batches.data?.items ?? []).filter((b) => isOpened(b.status)).map((b) => <option key={b.batchCode} value={b.batchCode}>{b.batchCode} · {b.title}</option>)}
                </Select>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc theo trạng thái đơn">
                  <option value="">Mọi trạng thái</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{label('order', s)}</option>)}
                </Select>
              </div>
              <OpPanel>
                <PreorderTable rows={rows} showBatch empty={status || batchCode ? 'Không có đơn nào khớp bộ lọc' : 'Chưa có khách đặt trước'} />
                {pages > 1 && (
                  <div className="op-pager">
                    <span>{data.total} đơn</span>
                    <div>
                      <button type="button" className="rd-iconbtn" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Trang trước"><ChevronLeft size={18} /></button>
                      Trang {data.page} / {pages}
                      <button type="button" className="rd-iconbtn" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Trang sau"><ChevronRight size={18} /></button>
                    </div>
                  </div>
                )}
              </OpPanel>
            </>
          )
        }}
      </QueryView>
    </>
  )
}

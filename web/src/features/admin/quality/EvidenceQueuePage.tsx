/* /admin/evidence — Hàng đợi thẩm định bằng chứng cho vai trò Kiểm định bằng chứng (GET /api/review/evidence).
   Người thẩm định không thấy bằng chứng của Lô mình đã góp vốn (máy chủ lọc sẵn). */
import { useState } from 'react'
import { Search } from 'lucide-react'
import type { PagedResultOfReviewEvidenceSummary } from '../../../shared/api/api.gen'
import { Input, OpHeading, OpPanel, OpTable, OpTabs, QueryView, StatusBadge, formatDateTime, useGet } from '../../../shared/ui/console'
import { Cell, Pager, extraLabel, riskText } from './shared'

type Tab = 'Flagged' | 'Watch' | 'Accepted' | 'Rejected' | 'all'
const PAGE_SIZE = 20

export default function EvidenceQueuePage() {
  const [tab, setTab] = useState<Tab>('Flagged')
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  // Bỏ trống Status thì máy chủ mặc định chỉ trả bằng chứng bị gắn cờ, nên mục "Tất cả" gửi Status rỗng.
  const queue = useGet<PagedResultOfReviewEvidenceSummary>(`/api/review/evidence?Status=${tab === 'all' ? '' : tab}`, { Q: q, Page: page, PageSize: PAGE_SIZE })
  const flagged = useGet<PagedResultOfReviewEvidenceSummary>('/api/review/evidence?Status=Flagged', { PageSize: 1 })

  return (
    <>
      <OpHeading eyebrow="Chất lượng" title="Thẩm định bằng chứng" description="Ảnh bị gắn cờ chờ bạn xem và ra phán quyết." />
      <form className="op-toolbar" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); setPage(1) }}>
        <OpTabs
          value={tab}
          onChange={(key) => { setTab(key); setPage(1) }}
          items={[
            { key: 'Flagged', label: 'Chờ thẩm định', count: flagged.data?.total },
            { key: 'Watch', label: 'Theo dõi' },
            { key: 'Accepted', label: 'Chấp nhận' },
            { key: 'Rejected', label: 'Không chấp nhận' },
            { key: 'all', label: 'Tất cả' },
          ]}
        />
        <Input className="op-toolbar__grow" type="search" aria-label="Tìm bằng chứng" placeholder="Tìm mã, Lô, trại" maxLength={100} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="rd-iconbtn" aria-label="Tìm"><Search size={17} /></button>
      </form>
      <QueryView query={queue}>
        {(data) => (
          <OpPanel>
            <OpTable
              rows={data.items}
              rowKey={(e) => e.id}
              empty={tab === 'Flagged' && !q ? 'Không còn bằng chứng nào chờ thẩm định' : 'Không có bằng chứng nào khớp'}
              columns={[
                { key: 'id', header: 'Bằng chứng', cell: (e) => <Cell main={<b>#{e.id}</b>} sub={`${extraLabel('mediaType', e.mediaType)}${e.slotCode ? ` · hộp ${e.slotCode}` : ''}`} /> },
                { key: 'batch', header: 'Lô', cell: (e) => <Cell main={e.batchCode} sub={e.farmName} /> },
                { key: 'risk', header: 'Điểm rủi ro', num: true, cell: (e) => riskText(e.riskScore) },
                { key: 'received', header: 'Nhận lúc', cell: (e) => formatDateTime(e.receivedAt) },
                { key: 'status', header: 'Trạng thái', cell: (e) => <StatusBadge kind="evidence" value={e.reviewStatus} /> },
                {
                  key: 'go', header: '',
                  cell: (e) => (e.reviewStatus === 'Flagged'
                    ? <a className="rd-btn rd-btn--primary rd-btn--sm" href={`/admin/evidence/${e.id}`}>Thẩm định</a>
                    : <a className="op-link" href={`/admin/evidence/${e.id}`}>Xem</a>),
                },
              ]}
            />
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </OpPanel>
        )}
      </QueryView>
    </>
  )
}

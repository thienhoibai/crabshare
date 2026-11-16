/* /lo — Lô đang gọi vốn hoặc nhận đặt trước (GET /api/batches, WF-03/04). Trang công khai, thay cho cửa hàng bán lẻ cũ. */
import { useState } from 'react'
import { CalendarClock, Users } from 'lucide-react'
import type { ExploreBatchResponse, PagedResultOfExploreBatchResponse } from '../../shared/api/api.gen'
import SiteShell from '../../shared/layout/SiteShell'
import {
  OpBadge, OpCard, OpEmpty, OpHeading, OpMeter, OpTabs, QueryView, Select, StatusBadge, crabImg, formatDate, formatVnd, label, options, useGet,
} from '../../shared/ui/console'
import { isFunding, priceRange, takesPreorders } from './batchView'

type Filter = 'all' | 'preorder' | 'funding'

function BatchCard({ b }: { b: ExploreBatchResponse }) {
  const funding = isFunding(b)
  const preorder = takesPreorders(b)
  const range = priceRange(b.offers)
  const remaining = Math.max(0, b.sellableCrabs - b.depositedPreorderCrabs)
  return (
    <OpCard
      href={`/lo/${encodeURIComponent(b.batchCode)}`}
      image={crabImg(b.crabType, 640)}
      badge={<StatusBadge kind="batch" value={b.status} />}
      title={b.title}
      sub={`${b.batchCode} · ${label('crabType', b.crabType)}${b.executorName ? ` · ${b.executorName}` : ''}`}
      foot={
        <>
          <span className="op-inline">
            <OpBadge tone={b.batchMode === 'P' ? 'gold' : 'info'}>Lô {b.batchMode}</OpBadge>
            {preorder && <OpBadge tone="ok">Nhận đặt trước</OpBadge>}
          </span>
          <span className="op-inline rd-muted"><CalendarClock size={14} />
            {funding && b.fundingDeadline ? `Hết hạn góp ${formatDate(b.fundingDeadline)}` : b.preorderDeadline ? `Đặt trước tới ${formatDate(b.preorderDeadline)}` : `${b.plannedQuantity} con`}
          </span>
        </>
      }
    >
      {funding && (
        <OpMeter label={`${b.investorCount} nhà đầu tư đã góp`} value={b.confirmedCapital} max={b.targetCapital}
          display={`${formatVnd(b.confirmedCapital)} / ${formatVnd(b.targetCapital)}`} />
      )}
      {range && <p><b className="rd-num">{range}</b> <span className="rd-muted">theo quy cách</span></p>}
      {preorder && <p className="op-inline rd-muted"><Users size={14} /> Còn đặt được khoảng {remaining} con</p>}
    </OpCard>
  )
}

export default function BatchExplorePage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [crabType, setCrabType] = useState('')
  const batches = useGet<PagedResultOfExploreBatchResponse>('/api/batches', { scope: 'open', crabType, pageSize: 60 })

  return (
    <SiteShell>
      <OpHeading
        eyebrow="Lô đang mở"
        title="Chọn một Lô để đặt trước hoặc góp vốn"
      />
      <div className="op-toolbar">
        <OpTabs<Filter>
          value={filter}
          onChange={setFilter}
          items={[{ key: 'all', label: 'Tất cả' }, { key: 'preorder', label: 'Nhận đặt trước' }, { key: 'funding', label: 'Đang gọi vốn' }]}
        />
        <Select value={crabType} onChange={(e) => setCrabType(e.target.value)} aria-label="Loại cua">
          <option value="">Mọi loại cua</option>
          {options('crabType').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>
      <QueryView query={batches}>
        {(page) => {
          const rows = page.items.filter((b) => (filter === 'funding' ? isFunding(b) : filter === 'preorder' ? takesPreorders(b) : true))
          if (rows.length === 0) return <OpEmpty title="Chưa có Lô nào khớp bộ lọc" />
          return <div className="op-cards">{rows.map((b) => <BatchCard key={b.batchCode} b={b} />)}</div>
        }}
      </QueryView>
    </SiteShell>
  )
}

/* /nha-dau-tu/bieu-quyet — Các cuộc biểu quyết tập thể ở những Lô tôi đã chốt vốn (GET /api/batches/{code}/decisions cho từng Lô).
   Biểu quyết qua POST /api/decisions/{decisionNo}/votes, nằm trong DecisionList. */
import { useState } from 'react'
import type { DecisionResponse } from '../../shared/api/api.gen'
import { OpEmpty, OpHeading, OpLoading, OpNote, OpTabs, QueryView } from '../../shared/ui/console'
import { DecisionList } from './DecisionList'
import { batchApi, isFrozen, useGetMany, usePortfolio } from './investorShared'

type Filter = 'open' | 'closed'

export default function DecisionsPage() {
  const [filter, setFilter] = useState<Filter>('open')
  const portfolio = usePortfolio()
  const frozen = (portfolio.data?.items ?? []).filter(isFrozen)
  const queries = useGetMany<DecisionResponse[]>(frozen.map((p) => batchApi(p.batch.code, 'decisions')))
  const all = queries.flatMap((q) => q.data ?? [])
  const open = all.filter((d) => d.status === 'Open').sort((a, b) => a.closesAt.localeCompare(b.closesAt))
  const closed = all.filter((d) => d.status !== 'Open').sort((a, b) => (b.decidedAt ?? b.closesAt).localeCompare(a.decidedAt ?? a.closesAt))
  const failed = queries.filter((q) => q.isError).length
  const rows = filter === 'open' ? open : closed

  return (
    <>
      <OpHeading eyebrow="Góp vốn" title="Biểu quyết" description="Phiếu của bạn tính theo vốn đã chốt ở Lô." />
      <OpTabs<Filter>
        value={filter}
        onChange={setFilter}
        items={[{ key: 'open', label: 'Đang mở', count: open.filter((d) => d.canVote).length }, { key: 'closed', label: 'Đã kết thúc' }]}
      />

      <QueryView query={portfolio}>
        {() => {
          if (queries.some((q) => q.isPending)) return <OpLoading />
          return (
            <>
              {failed > 0 && <OpNote tone="danger">Chưa tải được biểu quyết của {failed} Lô.</OpNote>}
              {rows.length === 0
                ? <OpEmpty title={filter === 'open' ? 'Không có cuộc biểu quyết nào đang mở' : 'Chưa có cuộc biểu quyết nào đã kết thúc'} />
                : <DecisionList decisions={rows} showBatch />}
            </>
          )
        }}
      </QueryView>
    </>
  )
}

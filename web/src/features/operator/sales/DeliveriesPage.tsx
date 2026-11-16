/* /operator/deliveries — Đợt giao và chuyến giao cần làm ở mọi Lô của hộ nuôi tôi, mở sẵn mục có việc.
   Gộp từ GET /api/batches/{code}/delivery-tranches của từng Lô đã mở (BR-160, BR-164, BR-165). */
import { useState } from 'react'
import type { TrancheStatusResponse } from '../../../shared/api/api.gen'
import { OpEmpty, OpError, OpHeading, OpLoading, OpNote, OpPanel, OpTabs, QueryView } from '../../../shared/ui/console'
import { TrancheTable, needsShipment, type TrancheRow } from './TrancheTable'
import { enc, isOpened, useGetMany, useIsOwner, useMyBatches } from './common'

type Tab = 'create' | 'scheduled' | 'dispatched' | 'accepted' | 'all'

const FILTERS: Record<Tab, (t: TrancheRow) => boolean> = {
  create: needsShipment,
  scheduled: (t) => t.shipmentStatus === 'Scheduled',
  dispatched: (t) => t.shipmentStatus === 'Dispatched',
  accepted: (t) => t.shipmentStatus === 'Accepted',
  all: () => true,
}

const EMPTY: Record<Tab, string> = {
  create: 'Không có đợt nào chờ lập chuyến',
  scheduled: 'Không có chuyến nào chờ xuất',
  dispatched: 'Không có chuyến nào đang giao',
  accepted: 'Chưa có chuyến nào được nghiệm thu',
  all: 'Chưa có đợt giao nào',
}

export default function DeliveriesPage() {
  const batches = useMyBatches()
  const { known, owner } = useIsOwner()
  return (
    <>
      <OpHeading eyebrow="Bán và giao" title="Giao hàng" />
      {known && !owner && <OpNote tone="info">Chỉ chủ hộ nuôi lập chuyến và xuất hàng.</OpNote>}
      <QueryView query={batches}>
        {(page) => <Board codes={page.items.filter((b) => isOpened(b.status)).map((b) => b.batchCode)} />}
      </QueryView>
    </>
  )
}

function Board({ codes }: { codes: string[] }) {
  const [picked, setPicked] = useState<Tab | null>(null)
  const results = useGetMany<TrancheStatusResponse[]>(codes.map((code) => `/api/batches/${enc(code)}/delivery-tranches`))

  if (results.some((r) => r.isPending)) return <OpLoading />
  const failed = results.find((r) => r.isError)
  if (failed) return <OpError error={failed.error} onRetry={() => results.forEach((r) => void r.refetch())} />

  const rows: TrancheRow[] = results
    .flatMap((r, i) => (r.data ?? []).map((t) => ({ ...t, batchCode: codes[i] })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.seq - b.seq)
  if (rows.length === 0) return <OpEmpty title="Chưa có đợt giao nào">Đợt giao có khi Lô đã mở và đơn đặt trước được xác nhận.</OpEmpty>

  const count = (key: Tab) => rows.filter(FILTERS[key]).length
  // Mở sẵn mục đầu tiên đang có việc: lập chuyến, xuất hàng, rồi ghi nhận hàng.
  const tab = picked ?? (['create', 'scheduled', 'dispatched'] as const).find((key) => count(key) > 0) ?? 'all'

  return (
    <>
      <OpTabs<Tab>
        items={[
          { key: 'create', label: 'Cần lập chuyến', count: count('create') },
          { key: 'scheduled', label: 'Chờ xuất', count: count('scheduled') },
          { key: 'dispatched', label: 'Đang giao', count: count('dispatched') },
          { key: 'accepted', label: 'Đã nghiệm thu', count: count('accepted') },
          { key: 'all', label: 'Tất cả', count: rows.length },
        ]}
        value={tab}
        onChange={setPicked}
        label="Lọc đợt giao"
      />
      <OpPanel>
        <TrancheTable rows={rows.filter(FILTERS[tab])} showBatch empty={EMPTY[tab]} />
      </OpPanel>
    </>
  )
}

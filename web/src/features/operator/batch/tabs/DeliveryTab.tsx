/* Mục "Đặt trước và giao hàng" của một Lô. Đầu trang là các đợt cần lập chuyến ngay, rồi chuyến đang chạy; đợt đã xong, đơn đặt trước
   và phân bổ cua gấp lại. GET /api/operators/me/preorders?batchCode=, /api/batches/{code}/delivery-tranches, /allocations (BR-160, BR-164, BR-234). */
import type { AllocationResponse, PagedResultOfPreorderResponse, TrancheStatusResponse } from '../../../../shared/api/api.gen'
import { OpBadge, OpEmpty, OpFacts, OpMore, OpPanel, OpTable, QueryView, StatusBadge, useGet } from '../../../../shared/ui/console'
import { PreorderTable } from '../../sales/PreorderTable'
import { TrancheTable, inTransit, needsShipment } from '../../sales/TrancheTable'
import { enc } from '../../sales/common'
import '../../sales/sales.css'
import type { BatchTabProps } from '../types'

const MAX_ROWS = 200

export default function DeliveryTab({ code }: BatchTabProps) {
  const base = `/api/batches/${enc(code)}`
  const preorders = useGet<PagedResultOfPreorderResponse>('/api/operators/me/preorders', { batchCode: code, pageSize: 100 })
  const tranches = useGet<TrancheStatusResponse[]>(`${base}/delivery-tranches`)
  const allocations = useGet<AllocationResponse[]>(`${base}/allocations`)

  const orders = preorders.data?.items ?? []
  // Phân bổ còn hiệu lực trước, phân bổ đã nhả sau; mới nhất trước.
  const newest = [...(allocations.data ?? [])].reverse()
  const activeCount = newest.filter((a) => !a.releasedAt).length
  const allocated = [...newest.filter((a) => !a.releasedAt), ...newest.filter((a) => a.releasedAt)].slice(0, MAX_ROWS)

  return (
    <QueryView query={tranches}>
      {(list) => {
        const rows = list.map((t) => ({ ...t, batchCode: code }))
        const todo = rows.filter(needsShipment)
        const running = rows.filter(inTransit)
        const rest = rows.filter((t) => !needsShipment(t) && !inTransit(t))
        if (rows.length === 0 && orders.length === 0 && !preorders.isPending) return <OpEmpty title="Lô chưa có đơn đặt trước nào" />
        return (
          <>
            <OpFacts items={[
              { label: 'Cần lập chuyến', value: todo.length, tone: todo.length ? 'warn' : undefined },
              { label: 'Chuyến đang chạy', value: running.length, tone: running.length ? 'info' : undefined },
              { label: 'Đợt đã xong', value: rest.length },
              { label: 'Đơn đặt trước', value: preorders.data?.total ?? orders.length },
            ]} />

            {todo.length > 0 && (
              <OpPanel accent title="Cần lập chuyến giao" subtitle="Lập chuyến thì dòng còn thiếu được bù từ cua đã duyệt hạng còn trong tồn.">
                <TrancheTable rows={todo} />
              </OpPanel>
            )}
            {running.length > 0 && (
              <OpPanel title="Chuyến đang chạy">
                <TrancheTable rows={running} />
              </OpPanel>
            )}

            {rest.length > 0 && <OpMore label="Đợt đã xong hoặc đã huỷ" count={rest.length}><TrancheTable rows={rest} /></OpMore>}
            {orders.length > 0 && <OpMore label="Đơn đặt trước" count={orders.length} defaultOpen={rows.length === 0}><PreorderTable rows={orders} /></OpMore>}
            {allocated.length > 0 && (
              <OpMore label="Phân bổ cua" count={activeCount}>
                <OpTable
                  rows={allocated}
                  rowKey={(a, i) => `${a.crabCode}-${a.orderNo}-${i}`}
                  columns={[
                    { key: 'crab', header: 'Mã cua', cell: (a) => <b className="op-mono">{a.crabCode}</b> },
                    { key: 'order', header: 'Đơn', cell: (a) => <><span className="op-mono">{a.orderNo}</span>{a.trancheSeq ? <span className="os-sub">Đợt {a.trancheSeq}</span> : null}</> },
                    { key: 'spec', header: 'Quy cách', cell: (a) => <><span className="op-mono">{a.crabSpecCode ?? a.lineSpecCode ?? '—'}</span>{a.isSubstitution && <> <OpBadge tone="gold">Thay hạng</OpBadge></>}</> },
                    { key: 'status', header: 'Trạng thái', cell: (a) => <><StatusBadge kind="allocation" value={a.status} />{a.releaseReason && <span className="os-sub">{a.releaseReason}</span>}</> },
                  ]}
                />
              </OpMore>
            )}
          </>
        )
      }}
    </QueryView>
  )
}

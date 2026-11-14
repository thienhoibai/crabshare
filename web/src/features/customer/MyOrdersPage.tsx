/* /khach — Đơn của tôi: các đơn đặt trước (GET /api/preorders) kèm tóm tắt việc cần làm.
   Việc cần làm lấy từ đơn chờ cọc và từ chuyến giao của các đơn đang giao (GET /api/preorders/{orderNo}/deliveries). */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight, Sprout } from 'lucide-react'
import type { PreorderResponse } from '../../shared/api/api.gen'
import {
  Money, OpEmpty, OpFacts, OpHeading, OpPanel, OpTable, OpTabs, OpTodo, QueryView, StatusBadge, formatDate, formatDateTime, formatVnd,
  type Todo,
} from '../../shared/ui/console'
import { DELIVERY_ORDER, OPEN_ORDER, depositState, nextTranche, orderHref, shipmentStage, useDeliveriesOf, useMyOrders } from './customerData'

type Filter = 'open' | 'closed' | 'all'

function Summary({ orders }: { orders: PreorderResponse[] }) {
  const waitingDeposit = orders.filter((o) => o.status === 'PendingDeposit')
  const deliveries = useDeliveriesOf(orders.filter((o) => DELIVERY_ORDER.includes(o.status)).map((o) => o.orderNo))
  const shipments = deliveries.flatMap((q) => q.data?.shipments ?? [])
  const toAccept = shipments.filter((s) => shipmentStage(s) === 'accept')
  const toPay = shipments.filter((s) => shipmentStage(s) === 'pay')
  const balance = toPay.reduce((sum, s) => sum + (s.acceptance?.balanceDue ?? 0), 0)
  const loading = deliveries.some((q) => q.isPending)

  const todo: Todo[] = [
    ...waitingDeposit.map((o) => ({
      title: `Đặt cọc đơn ${o.orderNo}`,
      sub: `${formatVnd(o.depositAmount)} · giữ đơn tới ${formatDateTime(o.holdExpiresAt)}`,
      href: orderHref(o.orderNo, 'coc'),
      tone: 'warn' as const,
    })),
    ...toAccept.map((s) => ({
      title: `Nghiệm thu chuyến ${s.shipmentNo}`,
      sub: `Đơn ${s.orderNo} · đợt ${s.trancheSeq}`,
      href: orderHref(s.orderNo, `chuyen-${s.shipmentNo}`),
      tone: 'gold' as const,
    })),
    ...toPay.map((s) => ({
      title: `Trả phần còn lại của chuyến ${s.shipmentNo}`,
      sub: `${formatVnd(s.acceptance?.balanceDue ?? 0)} · hạn ${formatDateTime(s.acceptance?.balanceDueAt)}`,
      href: orderHref(s.orderNo, `chuyen-${s.shipmentNo}`),
      tone: 'danger' as const,
    })),
  ]

  return (
    <>
      {todo.length > 0 && (
        <OpPanel title="Việc cần làm" accent>
          <OpTodo items={todo} />
        </OpPanel>
      )}
      <OpFacts items={[
        { label: 'Chờ đặt cọc', value: waitingDeposit.length, tone: waitingDeposit.length ? 'warn' : undefined },
        { label: 'Chờ nghiệm thu', value: loading ? '…' : toAccept.length, tone: toAccept.length ? 'info' : undefined },
        { label: 'Còn phải trả', value: loading ? '…' : formatVnd(balance), tone: balance > 0 ? 'danger' : undefined },
        { label: 'Đơn đang chạy', value: orders.filter((o) => OPEN_ORDER.includes(o.status)).length },
      ]} />
    </>
  )
}

export default function MyOrdersPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<Filter>('open')
  const orders = useMyOrders(page)

  return (
    <>
      <OpHeading
        eyebrow="Khách hàng"
        title="Đơn của tôi"
        action={<a className="rd-btn rd-btn--ghost" href="/khach/lo"><Sprout size={17} /> Đặt trước ở Lô khác</a>}
      />
      <QueryView query={orders}>
        {(data) => {
          if (data.total === 0) {
            return (
              <OpPanel>
                <OpEmpty title="Bạn chưa có đơn đặt trước nào">
                  <a className="rd-btn rd-btn--primary" href="/khach/lo">Xem Lô nhận đặt trước</a>
                </OpEmpty>
              </OpPanel>
            )
          }
          const open = data.items.filter((o) => OPEN_ORDER.includes(o.status))
          const closed = data.items.filter((o) => !OPEN_ORDER.includes(o.status))
          const rows = filter === 'open' ? open : filter === 'closed' ? closed : data.items
          const pages = Math.ceil(data.total / data.pageSize)
          return (
            <>
              <Summary orders={data.items} />
              <OpTabs<Filter>
                value={filter}
                onChange={setFilter}
                items={[
                  { key: 'open', label: 'Đang chạy', count: open.length },
                  { key: 'closed', label: 'Đã xong', count: closed.length },
                  { key: 'all', label: 'Tất cả' },
                ]}
              />
              <OpPanel>
                <OpTable
                  rows={rows}
                  rowKey={(o) => o.orderNo}
                  empty="Không có đơn nào ở mục này"
                  onRowClick={(o) => navigate(orderHref(o.orderNo))}
                  columns={[
                    {
                      key: 'order', header: 'Đơn',
                      cell: (o) => <><a className="op-mono" href={orderHref(o.orderNo)}><b>{o.orderNo}</b></a><br /><small className="rd-muted">Lô {o.batchCode}</small></>,
                    },
                    {
                      key: 'qty', header: 'Số lượng', num: true,
                      cell: (o) => <><b>{o.convertedCrabs} con</b><br /><small className="rd-muted">{formatVnd(o.estimatedValue)}</small></>,
                    },
                    {
                      key: 'deposit', header: 'Tiền cọc',
                      cell: (o) => <><Money value={o.depositAmount} /><br /><StatusBadge kind="deposit" value={depositState(o)} /></>,
                    },
                    {
                      key: 'next', header: 'Đợt kế tiếp',
                      cell: (o) => {
                        const t = nextTranche(o)
                        return t ? <>Đợt {t.seq} · {formatDate(t.dueDate)}<br /><StatusBadge kind="deliveryTranche" value={t.status} /></> : <span className="rd-muted">—</span>
                      },
                    },
                    { key: 'status', header: 'Trạng thái', cell: (o) => <StatusBadge kind="order" value={o.status} /> },
                  ]}
                />
                {pages > 1 && (
                  <div className="op-pager">
                    <span>Trang {data.page} / {pages} · {data.total} đơn</span>
                    <div>
                      <button type="button" className="rd-iconbtn" aria-label="Trang trước" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft size={18} /></button>
                      <button type="button" className="rd-iconbtn" aria-label="Trang sau" disabled={data.page >= pages} onClick={() => setPage(data.page + 1)}><ChevronRight size={18} /></button>
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

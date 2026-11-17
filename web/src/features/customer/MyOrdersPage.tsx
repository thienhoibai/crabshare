/* /khach — Đơn đặt trước và việc khách cần xử lý. */
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Sprout } from 'lucide-react'
import type { PreorderResponse } from '../../shared/api/api.gen'
import {
  Money, OpBadge, OpEmpty, OpHeading, OpPanel, OpTabs, QueryView, StatusBadge, formatDate, label,
} from '../../shared/ui/console'
import { CustomerTasks } from './CustomerTasks'
import { OPEN_ORDER, depositHoldExpired, depositState, nextTranche, orderHref, useMyOrders } from './customerData'

type Filter = 'open' | 'closed' | 'all'

function OrderRow({ order }: { order: PreorderResponse }) {
  const next = nextTranche(order)
  const expired = depositHoldExpired(order)
  const deposit = expired ? null : depositState(order)
  const status = expired ? 'Hết hạn đặt cọc' : label('order', order.status)
  return (
    <li>
      <a className="customer-order-row" href={orderHref(order.orderNo)} aria-label={`Xem đơn ${order.orderNo}, ${status}`}>
        <div className="customer-order-row__head">
          <span><b>{order.orderNo}</b><small>Lô {order.batchCode}</small></span>
          {expired ? <OpBadge>{status}</OpBadge> : <StatusBadge kind="order" value={order.status} />}
        </div>
        <dl className="customer-order-row__facts">
          <div><dt>Số lượng</dt><dd>{order.convertedCrabs} con</dd></div>
          <div><dt>Ước tính</dt><dd><Money value={order.estimatedValue} /></dd></div>
          <div><dt>Tiền cọc</dt><dd><Money value={order.depositAmount} />{deposit && <StatusBadge kind="deposit" value={deposit} />}</dd></div>
          <div>
            <dt>Đợt giao tiếp theo</dt>
            <dd>{next ? <>Đợt {next.seq}, {formatDate(next.dueDate)}<StatusBadge kind="deliveryTranche" value={next.status} /></> : 'Chưa có'}</dd>
          </div>
        </dl>
      </a>
    </li>
  )
}

export default function MyOrdersPage() {
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Filter | null>(null)
  const orders = useMyOrders(page)

  return (
    <>
      <OpHeading
        title="Đơn của tôi"
        action={orders.data && orders.data.total > 0 ? <a className="rd-btn rd-btn--ghost" href="/khach/lo"><Sprout size={17} /> Xem Lô nhận đặt trước</a> : undefined}
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
          const filter = picked ?? (open.length > 0 ? 'open' : 'all')
          const rows = filter === 'open' ? open : filter === 'closed' ? closed : data.items
          const pages = Math.ceil(data.total / data.pageSize)
          return (
            <>
              <CustomerTasks orders={data.items} />
              <OpTabs<Filter>
                value={filter}
                onChange={setPicked}
                label="Lọc đơn đặt trước"
                items={[
                  { key: 'open', label: 'Đang xử lý', count: open.length },
                  { key: 'closed', label: 'Đã xong', count: closed.length },
                  { key: 'all', label: 'Tất cả' },
                ]}
              />
              <OpPanel title="Danh sách đơn">
                {rows.length > 0 ? <ul className="customer-order-list">{rows.map((order) => <OrderRow key={order.orderNo} order={order} />)}</ul>
                  : <OpEmpty title="Không có đơn nào ở mục này" />}
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

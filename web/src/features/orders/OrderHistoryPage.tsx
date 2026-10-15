/* UC28 — Lịch sử đơn của khách đang đăng nhập (NH-07). /huy-tra-hang cũng vào đây vì huỷ làm từ chi tiết đơn. */
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, PackageSearch } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import { vnd } from '../../shared/ui/kit/mock-data'
import { Shell, TopBar } from '../../shared/ui/kit/kit'
import { formatKg } from '../store/storeApi'
import { ORDER_STATUS_LABELS, statusTone, useMyOrders, type OrderSummary } from './orderTrackingApi'
import './checkout.css'

const TABS: { id: string; label: string; status?: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ thanh toán', status: 'PendingPayment' },
  { id: 'paid', label: 'Đã thanh toán', status: 'Paid,Packed' },
  { id: 'shipping', label: 'Đang giao', status: 'Shipping' },
  { id: 'done', label: 'Hoàn tất', status: 'Delivered,Completed' },
  { id: 'cancelled', label: 'Đã huỷ', status: 'Cancelled,Returned' },
]

function Row({ order }: { order: OrderSummary }) {
  const cancellable = order.status === 'PendingPayment' || order.status === 'Paid'
  return (
    <article className="ot-row" aria-label={`Đơn ${order.orderNo}`}>
      <div className="ot-row__info">
        <b>{order.orderNo}</b>
        <span>{formatDateTime(order.placedAt)}</span>
        <strong className={`ot-status ot-status--${statusTone(order.status)}`}>
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </strong>
        <span>{order.lineCount} dòng · {formatKg(order.totalKg)} kg · lô {order.batchCode}</span>
      </div>
      <div className="ot-row__action">
        <b>{vnd(order.totalAmount)}</b>
        <Link className="rd-btn rd-btn--ghost rd-btn--sm" to={`/theo-doi-don-hang/${order.orderNo}`}>
          {cancellable ? 'Theo dõi / huỷ' : order.status === 'Shipping' ? 'Theo dõi giao hàng' : 'Xem chi tiết'}
        </Link>
      </div>
    </article>
  )
}

export default function OrderHistoryPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0]
  const page = Math.max(1, Number(params.get('page') || 1) || 1)
  const query = useMemo(() => ({ status: tab.status, page, pageSize: 10 }), [tab.status, page])
  const list = useMyOrders(query)
  const setTab = (id: string) => setParams(id === 'all' ? {} : { tab: id })
  const setPage = (next: number) => {
    const nextParams: Record<string, string> = {}
    if (tab.id !== 'all') nextParams.tab = tab.id
    if (next > 1) nextParams.page = String(next)
    setParams(nextParams)
  }

  return (
    <Shell theme="light">
      <TopBar area="store" right={<Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/cua-hang">Về cửa hàng</Link>} />
      <main className="co">
        <header className="co-head">
          <p className="rd-eyebrow">Đơn hàng của tôi</p>
          <h1 className="rd-h2">Lịch sử đơn hàng</h1>
          <p className="rd-muted">Xem tiến độ, huỷ đơn khi chưa đóng gói, hoặc mở chi tiết từng đơn.</p>
        </header>

        <nav className="ot-tabs" aria-label="Lọc theo trạng thái">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={t.id === tab.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        {list.isPending ? <p role="status" className="rd-muted">Đang tải đơn hàng…</p>
          : list.isError ? <p role="alert" className="co-error">{errorMessage(list.error)}</p>
          : list.data.items.length === 0 ? (
            <section className="co-card rd-empty">
              <PackageSearch size={32} />
              <p>Chưa có đơn nào{tab.status ? ' ở mục này' : ''}.</p>
              <Link className="rd-btn rd-btn--primary" to="/cua-hang">Mua hàng</Link>
            </section>
          ) : (
            <>
              <div className="ot-list">
                {list.data.items.map((order) => <Row key={order.orderNo} order={order} />)}
              </div>
              {list.data.total > list.data.pageSize && (
                <div className="ot-pager">
                  <button type="button" className="rd-btn rd-btn--ghost rd-btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft size={16} /> Trước
                  </button>
                  <span>Trang {list.data.page} / {Math.ceil(list.data.total / list.data.pageSize)}</span>
                  <button type="button" className="rd-btn rd-btn--ghost rd-btn--sm"
                    disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>
                    Sau <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
      </main>
    </Shell>
  )
}

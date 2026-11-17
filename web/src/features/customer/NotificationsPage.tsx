/* /khach/thong-bao — Việc cần làm lấy từ đơn và chuyến giao. Thông báo góp vốn dùng API riêng khi có vai trò nhà đầu tư. */
import { useState } from 'react'
import { BellRing, ChevronLeft, ChevronRight } from 'lucide-react'
import type { NotificationPage } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import { Money, OpEmpty, OpHeading, OpIcon, OpPanel, OpRow, QueryView, formatDateTime, useGet } from '../../shared/ui/console'
import { CustomerTasks } from './CustomerTasks'
import { useMyOrders } from './customerData'

const PAGE_SIZE = 20

export default function NotificationsPage() {
  const isInvestor = useAuthStore((s) => !!s.user?.roles.includes('Investor'))
  const [page, setPage] = useState(1)
  const orders = useMyOrders()
  const notifications = useGet<NotificationPage>(isInvestor ? '/api/me/notifications' : null, { page, pageSize: PAGE_SIZE })

  return (
    <>
      <OpHeading title="Thông báo" />
      <QueryView query={orders}>{(data) => <CustomerTasks orders={data.items} showEmpty />}</QueryView>
      {isInvestor && (
        <QueryView query={notifications}>
          {(data) => {
            if (data.total === 0) return <OpPanel title="Thông báo góp vốn"><OpEmpty title="Chưa có thông báo góp vốn" icon={<BellRing size={30} />} /></OpPanel>
            const pages = Math.ceil(data.total / data.pageSize)
            return (
              <OpPanel title="Thông báo góp vốn">
                {data.items.map((n) => (
                  <OpRow
                    key={n.id}
                    href={`/lo/${encodeURIComponent(n.batchCode)}`}
                    media={<OpIcon tone="gold"><BellRing size={22} /></OpIcon>}
                    title={n.title}
                    sub={`Lô ${n.batchCode}`}
                    mid={<span>{n.body}</span>}
                    end={<>{n.amount !== null && <Money value={n.amount} />}<small>{formatDateTime(n.at)}</small></>}
                  />
                ))}
                {pages > 1 && (
                  <div className="op-pager" style={{ margin: '8px 12px 4px' }}>
                    <span>Trang {data.page} / {pages} · {data.total} thông báo</span>
                    <div>
                      <button type="button" className="rd-iconbtn" aria-label="Trang trước" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft size={18} /></button>
                      <button type="button" className="rd-iconbtn" aria-label="Trang sau" disabled={data.page >= pages} onClick={() => setPage(data.page + 1)}><ChevronRight size={18} /></button>
                    </div>
                  </div>
                )}
              </OpPanel>
            )
          }}
        </QueryView>
      )}
    </>
  )
}

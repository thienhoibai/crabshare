/* /khach/thong-bao — Thông báo (GET /api/me/notifications, phân trang).
   API hiện chỉ phát thông báo về góp vốn và chỉ nhận tài khoản có vai trò nhà đầu tư; tài khoản chỉ là khách hàng
   nhận 403, nên trang không gọi API cho các tài khoản đó và chỉ đường tới nơi theo dõi đơn. */
import { useState } from 'react'
import { BellRing, ChevronLeft, ChevronRight } from 'lucide-react'
import type { NotificationPage } from '../../shared/api/api.gen'
import { useAuthStore } from '../../shared/auth/authStore'
import { Money, OpEmpty, OpHeading, OpIcon, OpPanel, OpRow, QueryView, formatDateTime, useGet } from '../../shared/ui/console'

const PAGE_SIZE = 20

export default function NotificationsPage() {
  const isInvestor = useAuthStore((s) => !!s.user?.roles.includes('Investor'))
  const [page, setPage] = useState(1)
  const notifications = useGet<NotificationPage>(isInvestor ? '/api/me/notifications' : null, { page, pageSize: PAGE_SIZE })

  return (
    <>
      <OpHeading eyebrow="Tài khoản" title="Thông báo" />
      {!isInvestor ? (
        <OpPanel>
          <OpEmpty title="Chưa có thông báo" icon={<BellRing size={30} />}>
            <a className="rd-btn rd-btn--ghost" href="/khach">Xem đơn của tôi</a>
          </OpEmpty>
        </OpPanel>
      ) : (
        <QueryView query={notifications}>
          {(data) => {
            if (data.total === 0) return <OpPanel><OpEmpty title="Chưa có thông báo" icon={<BellRing size={30} />} /></OpPanel>
            const pages = Math.ceil(data.total / data.pageSize)
            return (
              <OpPanel className="op-list">
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

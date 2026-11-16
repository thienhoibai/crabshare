/* /nha-dau-tu/thong-bao — Thông báo của nhà đầu tư (GET /api/me/notifications?page=&pageSize=): tiền về, hợp đồng đủ chữ ký, nhật ký nuôi mới,
   cảnh báo vận hành, quyết toán công bố, chi trả xong. Máy chủ không lưu mốc đã đọc nên trang chỉ liệt kê theo thời gian. */
import { useState } from 'react'
import { BellRing, ChevronLeft, ChevronRight, FileSignature, HandCoins, NotebookPen, Receipt, Wallet, type LucideIcon } from 'lucide-react'
import type { NotificationPage } from '../../shared/api/api.gen'
import { OpEmpty, OpHeading, OpIcon, OpPanel, QueryView, formatDateTime, formatVnd, useGet, type Tone } from '../../shared/ui/console'
import { portfolioHref } from './investorShared'
import './investorPages.css'

const KIND: Record<string, [icon: LucideIcon, tone: Tone]> = {
  PaymentConfirmed: [Wallet, 'ok'],
  ContractSigned: [FileSignature, 'info'],
  ProductionReceived: [NotebookPen, 'mute'],
  AlertRaised: [BellRing, 'danger'],
  SettlementPublished: [Receipt, 'gold'],
  PayoutSucceeded: [HandCoins, 'ok'],
}

const PAGE_SIZE = 20

export default function NotificationsPage() {
  const [page, setPage] = useState(1)
  const feed = useGet<NotificationPage>('/api/me/notifications', { page, pageSize: PAGE_SIZE })

  return (
    <>
      <OpHeading eyebrow="Giấy tờ và tiền" title="Thông báo" />

      <QueryView query={feed}>
        {(data) => {
          const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
          if (data.items.length === 0) return <OpEmpty title="Chưa có thông báo nào" />
          return (
            <>
              <OpPanel>
                <div>
                  {data.items.map((n) => {
                    const [Icon, tone] = KIND[n.type] ?? [BellRing, 'mute' as Tone]
                    return (
                      <article key={n.id} className="inv-notice">
                        <OpIcon tone={tone}><Icon size={20} /></OpIcon>
                        <div>
                          <b>{n.title}{n.amount !== null ? ` · ${formatVnd(n.amount)}` : ''}</b>
                          <p>{n.body}</p>
                          {n.canOpenPortfolio && <a className="op-link" href={portfolioHref(n.batchCode)}>Mở Lô {n.batchCode}</a>}
                        </div>
                        <time dateTime={n.at}>{formatDateTime(n.at)}</time>
                      </article>
                    )
                  })}
                </div>
              </OpPanel>

              {pages > 1 && (
                <div className="op-pager">
                  <span>{data.total} thông báo</span>
                  <div>
                    <button type="button" className="rd-iconbtn" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button>
                    Trang {data.page} / {pages}
                    <button type="button" className="rd-iconbtn" aria-label="Trang sau" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button>
                  </div>
                </div>
              )}
            </>
          )
        }}
      </QueryView>
    </>
  )
}

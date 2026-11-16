/* /nha-dau-tu/danh-muc — Các Lô tôi đã góp vốn (GET /api/investor/portfolio?status=&q=&page=&pageSize=).
   Chỉ có số đã ghi nhận: vốn đã xác nhận, tỷ lệ vốn trong Lô, số được nhận theo bảng quyết toán đã duyệt. */
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PortfolioItem, PortfolioPage as PortfolioPageDto } from '../../shared/api/api.gen'
import {
  Input, OpBadge, OpEmpty, OpFacts, OpHeading, OpPanel, OpRow, QueryView, Select, StatusBadge, crabImg, formatDate, formatVnd, label, useGet,
} from '../../shared/ui/console'
import { isFrozen, portfolioHref, ratioText } from './investorShared'

/** Các trạng thái mà bộ lọc của API nhận. */
const STATUSES = ['Funding', 'Stocked', 'InProduction', 'Harvesting', 'Settlement', 'Closed', 'Cancelled']
const PAGE_SIZE = 20

const stage = (p: PortfolioItem) => {
  const b = p.batch
  if (b.status === 'Funding') return b.fundingDeadline ? `Hạn góp vốn ${formatDate(b.fundingDeadline)}` : 'Đang gọi vốn'
  if (b.dayOfCycle !== null) return `Ngày nuôi ${b.dayOfCycle} / ${b.cycleDays}`
  return b.stockedAt ? `Thả cua ${formatDate(b.stockedAt)}` : 'Chưa thả cua'
}

export default function PortfolioPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const portfolio = useGet<PortfolioPageDto>('/api/investor/portfolio', { q: q.trim(), status, page, pageSize: PAGE_SIZE })

  return (
    <>
      <OpHeading eyebrow="Góp vốn" title="Lô tôi đã góp" />

      <div className="op-toolbar">
        <Input className="op-toolbar__grow" value={q} maxLength={100} placeholder="Tìm mã Lô, tên Lô, người nuôi" aria-label="Tìm Lô"
          onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <Select value={status} aria-label="Trạng thái Lô" onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label('batch', s)}</option>)}
        </Select>
      </div>

      <QueryView query={portfolio}>
        {(data) => {
          const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
          return (
            <>
              <OpFacts items={[
                { label: 'Vốn đã xác nhận', value: formatVnd(data.summary.totalConfirmedAmount) },
                { label: 'Ở Lô đang chạy', value: formatVnd(data.summary.activeConfirmedAmount) },
                { label: 'Lô đang chạy', value: `${data.summary.activeBatches} / ${data.summary.totalBatches}` },
                { label: 'Quyết toán đã duyệt', value: formatVnd(data.summary.approvedNetPayout), tone: 'ok' },
              ]} />

              {data.items.length === 0 ? (
                <OpEmpty title={q || status ? 'Không có Lô nào khớp bộ lọc' : 'Bạn chưa góp vốn vào Lô nào'}>
                  {!q && !status && <a className="rd-btn rd-btn--primary" href="/nha-dau-tu/lo">Xem Lô đang gọi vốn</a>}
                </OpEmpty>
              ) : (
                <OpPanel className="op-list">
                  {data.items.map((p) => (
                    <OpRow
                      key={p.batch.code}
                      href={portfolioHref(p.batch.code)}
                      media={crabImg(p.batch.crabType)}
                      title={p.batch.title}
                      sub={`${p.batch.code} · ${p.batch.operatorName}`}
                      mid={
                        <>
                          <span className="op-inline">
                            <StatusBadge kind="batch" value={p.batch.status} />
                            {p.batch.openAlerts > 0 && <OpBadge tone="danger">{p.batch.openAlerts} cảnh báo</OpBadge>}
                          </span>
                          <small>{stage(p)}</small>
                        </>
                      }
                      end={
                        <>
                          <b>{formatVnd(p.confirmedAmount)}</b>
                          <small>{p.settlement ? `Thực nhận ${formatVnd(p.settlement.netPayout)}` : `${ratioText(p.capitalRatio)} vốn của Lô${isFrozen(p) ? '' : ', chưa chốt'}`}</small>
                        </>
                      }
                    />
                  ))}
                </OpPanel>
              )}

              {pages > 1 && (
                <div className="op-pager">
                  <span>{data.total} Lô</span>
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

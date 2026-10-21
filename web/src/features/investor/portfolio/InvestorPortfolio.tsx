import { useState } from 'react'
import { ChevronRight, Wallet } from 'lucide-react'
import { errorMessage } from '../../../shared/api/http'
import { formatDate, formatDateTime, formatVnd } from '../../../shared/lib/format'
import { usePortfolio, usePortfolioDetail, type PortfolioItem, type PortfolioPage } from './portfolioApi'
import './portfolio.css'
import BatchTimeline from '../../timeline/BatchTimeline'

const states: Record<string, string> = { Funding: 'Đang gọi vốn', Stocked: 'Đã thả giống', InProduction: 'Đang nuôi', Harvesting: 'Đang thu hoạch', Settlement: 'Đang quyết toán', Closed: 'Đã đóng', Cancelled: 'Đã huỷ' }
const contributionStates: Record<string, string> = { Reserved: 'Đang giữ chỗ', Confirmed: 'Đã xác nhận', Expired: 'Hết hạn', Refunded: 'Đã hoàn' }
const contracts: Record<string, string> = { Draft: 'Nháp', OperatorSigned: 'Hộ nuôi đã ký', FullySigned: 'Đã đủ chữ ký', Void: 'Đã huỷ' }
export function ratioText(p: PortfolioItem) {
  if (p.capitalRatio == null) return 'Chưa có tỷ lệ vốn'
  return `${p.capitalBasis === 'LiveConfirmed' ? 'Tạm tính ' : ''}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(p.capitalRatio * 100)}% vốn lô`
}
function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return <section className="iv-card pf-wide" role="alert"><p>{errorMessage(error)}</p><button className="rd-btn rd-btn--ghost" onClick={retry}>Thử lại</button></section>
}
function Balance({ summary }: { summary: PortfolioPage['summary'] }) {
  return <><section className="i2-balance"><small>Vốn đang tham gia</small><b data-testid="portfolio-active-capital">{formatVnd(summary.activeConfirmedAmount)}</b><span>{summary.activeBatches} lô đang tham gia</span><small>Chỉ gồm vốn đã xác nhận hoặc đã chốt; không gồm tiền giữ chỗ.</small></section>
    <section className="iv-card i2-todo"><h3 className="rd-h3">Danh mục của bạn</h3><dl className="pf-dl"><dt>Tổng vốn trong danh mục</dt><dd>{formatVnd(summary.totalConfirmedAmount)}</dd><dt>Tổng số lô</dt><dd>{summary.totalBatches}</dd><dt>Tiền nhận theo quyết toán đã duyệt</dt><dd>{formatVnd(summary.approvedNetPayout)}</dd></dl><p className="rd-note">Tỷ lệ tạm tính có thể thay đổi đến khi chốt vốn. Quyết toán chỉ hiển thị sau khi được duyệt.</p></section></>
}
function PositionRows({ items, open }: { items: PortfolioItem[]; open: (code: string) => void }) {
  return <div className="pf-rows">{items.map((p) => <button className="pf-row" key={p.batch.code} onClick={() => open(p.batch.code)} aria-label={`Xem lô ${p.batch.code}`}>
    <span className="pf-icon"><Wallet size={22} /></span><span className="pf-name"><b>{p.batch.code}</b><small>{p.batch.title}</small><small>{p.batch.operatorName}</small></span>
    <span className="pf-state">{states[p.batch.status] ?? p.batch.status}</span><span className="pf-money"><b>{formatVnd(p.confirmedAmount)}</b><small>{ratioText(p)}</small></span><ChevronRight size={18} />
  </button>)}</div>
}
export function PortfolioOverview({ open, all }: { open: (code: string) => void; all: () => void }) {
  const query = usePortfolio(1, '', '', 5)
  if (query.isPending) return <section className="iv-card" role="status">Đang tải danh mục…</section>
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />
  return <div className="i2-grid"><Balance summary={query.data.summary} /><section className="iv-card pf-wide"><div className="pf-head"><h3 className="rd-h3">Lô của bạn</h3><button className="rd-btn rd-btn--ghost" onClick={all}>Xem danh mục</button></div>{query.data.items.length ? <PositionRows items={query.data.items} open={open} /> : <p className="rd-muted">Bạn chưa có vốn đã xác nhận trong lô nào.</p>}</section></div>
}
export default function InvestorPortfolio({ open }: { open: (code: string) => void }) {
  const [q, setQ] = useState(''); const [input, setInput] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1)
  const query = usePortfolio(page, q, status)
  return <div className="i2-grid">
    {query.data && <Balance summary={query.data.summary} />}
    <section className="iv-card pf-wide"><form className="pf-filters" onSubmit={(e) => { e.preventDefault(); setQ(input.trim()); setPage(1) }}>
      <label>Tìm lô<input value={input} maxLength={100} onChange={(e) => setInput(e.target.value)} placeholder="Mã lô, tên lô hoặc hộ nuôi" /></label>
      <label>Trạng thái<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">Tất cả</option>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="rd-btn rd-btn--primary" type="submit">Tìm kiếm</button><button className="rd-btn rd-btn--ghost" type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>Làm mới</button>
    </form></section>
    {query.isPending ? <section className="iv-card pf-wide" role="status">Đang tải danh mục…</section> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : <section className="iv-card pf-wide">
      <div className="pf-head"><h3 className="rd-h3">Khoản góp của tôi</h3><span className="rd-muted">{query.data.total} lô</span></div>
      {query.data.items.length ? <PositionRows items={query.data.items} open={open} /> : <p className="rd-muted">{q || status ? 'Không có lô phù hợp bộ lọc.' : 'Bạn chưa có vốn đã xác nhận trong lô nào.'}</p>}
      <div className="pf-head"><button className="rd-btn rd-btn--ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page} / {Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}</span><button className="rd-btn rd-btn--ghost" disabled={page * query.data.pageSize >= query.data.total} onClick={() => setPage(page + 1)}>Trang sau</button></div>
    </section>}
  </div>
}
export function PortfolioPosition({ code }: { code: string }) {
  const query = usePortfolioDetail(code)
  if (query.isPending) return <section className="iv-card" role="status">Đang tải lô…</section>
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />
  const { position: p, contributions, timeline, latestProduction: log } = query.data
  const b = p.batch; const settled = p.settlement
  const progress = b.dayOfCycle == null || b.cycleDays <= 0 ? 0 : Math.min(100, Math.max(0, b.dayOfCycle / b.cycleDays * 100))
  return <div className="i2-grid">
    <section className="i2-balance"><small>{b.code} · {states[b.status] ?? b.status}</small><b>{formatVnd(p.confirmedAmount)}</b><span>{ratioText(p)}</span><small>{p.capitalBasis === 'Frozen' ? 'Vốn đã chốt' : 'Vốn đã xác nhận, chưa chốt tỷ lệ'}</small></section>
    <section className="iv-card i2-todo"><h3 className="rd-h3">{b.title}</h3><p className="rd-muted">{b.operatorName}</p><div className="pf-progress" role="progressbar" aria-label="Tiến độ chu kỳ" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div><dl className="pf-dl"><dt>Ngày nuôi</dt><dd>{b.dayOfCycle == null ? 'Chưa thả giống' : `${b.dayOfCycle} / ${b.cycleDays} ngày`}</dd><dt>Cua đang nuôi</dt><dd>{b.aliveCount == null ? 'Chưa có dữ liệu' : `${b.aliveCount} con`}</dd><dt>Cảnh báo đang mở</dt><dd>{b.openAlerts}</dd><dt>Dự kiến thu</dt><dd>{b.expectedHarvestDate ? formatDate(b.expectedHarvestDate) : 'Chưa có lịch'}</dd><dt>Vốn xác nhận của lô</dt><dd>{formatVnd(b.raisedCapital)}</dd></dl></section>
    <div className="pf-wide"><BatchTimeline code={b.code} /></div>
    <section className="iv-card"><h3 className="rd-h3">Lịch sử khoản góp</h3>{contributions.length ? contributions.map((c) => <div className="pf-entry" key={c.id}><b>#{c.id} · {formatVnd(c.amount)}</b><span>{contributionStates[c.status] ?? c.status}</span><small>{c.confirmedAt ? `Xác nhận ${formatDateTime(c.confirmedAt)}` : `Giữ chỗ ${formatDateTime(c.reservedAt)}`}</small>{c.contractNo && <small>Hợp đồng {c.contractNo} · {contracts[c.contractStatus ?? ''] ?? c.contractStatus}</small>}</div>) : <p className="rd-muted">Chưa có lịch sử khoản góp.</p>}</section>
    <section className="iv-card"><h3 className="rd-h3">Nhật ký nuôi mới nhất</h3>{log ? <><p>{formatDate(log.logDate)}</p><dl className="pf-dl"><dt>pH</dt><dd>{log.ph ?? '—'}</dd><dt>Nhiệt độ</dt><dd>{log.waterTempC == null ? '—' : `${log.waterTempC} °C`}</dd><dt>Độ mặn</dt><dd>{log.salinityPpt == null ? '—' : `${log.salinityPpt} ‰`}</dd><dt>Thức ăn</dt><dd>{log.feedKg == null ? '—' : `${log.feedKg} kg`}</dd></dl><p className="rd-note">{log.verifiedAt ? `Đã kiểm tra ${formatDateTime(log.verifiedAt)}` : 'Chưa kiểm tra'}{log.plausibilityFlag === 'Ok' ? '' : ' · Có dấu hiệu cần kiểm tra'}</p></> : <p className="rd-muted">Chưa có nhật ký nuôi.</p>}</section>
    <section className="iv-card"><h3 className="rd-h3">Quyết toán đã duyệt</h3>{settled ? <dl className="pf-dl"><dt>Hoàn vốn</dt><dd>{formatVnd(settled.capitalReturn)}</dd><dt>Phần chia thực tế</dt><dd>{formatVnd(settled.profitShare)}</dd><dt>Thuế khấu trừ</dt><dd>{formatVnd(settled.taxWithheld)}</dd><dt>Tiền nhận theo quyết toán</dt><dd>{formatVnd(settled.netPayout)}</dd><dt>Hiện vật</dt><dd>{settled.inKindQtyKg} kg</dd><dt>Trạng thái</dt><dd>{settled.status === 'PaidOut' ? 'Đã chi trả' : settled.status === 'Closed' ? 'Đã đóng' : 'Đã duyệt, chờ chi trả'}</dd></dl> : <p className="rd-muted">Chưa có quyết toán được duyệt.</p>}</section>
    <section className="iv-card i2-notes"><h3 className="rd-h3">Hành trình lô</h3>{timeline.length ? <ul>{timeline.map((e, i) => <li key={`${e.type}-${e.at}-${i}`}><b>{e.label}</b><small>{formatDateTime(e.at)}</small></li>)}</ul> : <p className="rd-muted">Chưa có sự kiện.</p>}</section>
  </div>
}

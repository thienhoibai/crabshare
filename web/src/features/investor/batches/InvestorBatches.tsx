import { useSearchParams } from 'react-router'
import { ChevronRight, Shell } from 'lucide-react'
import { errorMessage } from '../../../shared/api/http'
import { formatDateTime, formatVnd } from '../../../shared/lib/format'
import { crabTypes, costCategories } from '../../operator/batchesApi'
import { useInvestorBatch, useInvestorBatches, type InvestorBatch } from './batchesApi'
import '../portfolio/portfolio.css'
import './batches.css'
import BatchTimeline from '../../timeline/BatchTimeline'

const states: Record<string, string> = {
  Funding: 'Đang gọi vốn',
  Cancelled: 'Đã hủy',
  Stocked: 'Đã thả giống',
  InProduction: 'Đang nuôi',
  Harvesting: 'Đang thu hoạch',
  Settlement: 'Đang quyết toán',
  Closed: 'Đã đóng'
}
function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="iv-card" role="alert">
      <p>{errorMessage(error)}</p>
      <button className="rd-btn rd-btn--ghost" onClick={retry}>
        Thử lại
      </button>
    </section>
  )
}
function Loading() {
  return (
    <section className="iv-card be-loading" role="status" aria-busy="true">
      <p>Đang tải lô…</p>
      <div />
      <div />
      <div />
    </section>
  )
}
function FundingProgress({ batch }: { batch: InvestorBatch }) {
  const progress = batch.fundingProgress
  const visualPercent = Math.min(100, Math.max(0, progress.pctOfTarget))
  return (
    <div className="be-progress">
      <b>{progress.percentLabel}</b>
      <div
        className="pf-progress"
        role="progressbar"
        aria-label={`Tiến độ gọi vốn ${batch.batchCode}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={visualPercent}
        aria-valuetext={progress.percentLabel}
      >
        <i style={{ width: `${visualPercent}%` }} />
      </div>
    </div>
  )
}
export default function InvestorBatches({ open }: { open: (code: string) => void }) {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const crabType = params.get('crabType') ?? ''
  const rawPage = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const query = useInvestorBatches(status, crabType, page)
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next)
  }
  const changePage = (value: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(value))
    setParams(next)
  }
  return (
    <div className="be-layout">
      <section className="iv-card">
        <div className="pf-filters">
          <label htmlFor="explore-status">
            Trạng thái
            <select
              id="explore-status"
              aria-label="Trạng thái"
              value={status}
              onChange={(e) => filter('status', e.target.value)}
            >
              <option value="">Tất cả</option>
              {Object.entries(states).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="explore-crab">
            Loại cua
            <select
              id="explore-crab"
              aria-label="Loại cua"
              value={crabType}
              onChange={(e) => filter('crabType', e.target.value)}
            >
              <option value="">Tất cả</option>
              {Object.entries(crabTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rd-btn rd-btn--ghost"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            Làm mới
          </button>
        </div>
      </section>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : (
        <section className="iv-card">
          <div className="pf-head">
            <h2 className="rd-h3">Lô đã công bố</h2>
            <span className="rd-muted">{query.data.total} lô</span>
          </div>
          {query.data.items.length ? (
            <div className="pf-rows">
              {query.data.items.map((batch) => (
                <button
                  className="pf-row be-row"
                  key={batch.batchCode}
                  aria-label={`Xem lô ${batch.batchCode}`}
                  onClick={() => open(batch.batchCode)}
                >
                  <span className="pf-icon">
                    <Shell size={22} />
                  </span>
                  <span className="pf-name">
                    <b>{batch.batchCode}</b>
                    <span>{batch.title}</span>
                    <small>
                      {batch.operatorName} ·{' '}
                      {crabTypes[batch.crabType as keyof typeof crabTypes] ?? batch.crabType}
                    </small>
                  </span>
                  <span className="pf-state">{states[batch.status] ?? batch.status}</span>
                  <span className="be-row__funding">
                    <FundingProgress batch={batch} />
                    <small>Mục tiêu {formatVnd(batch.targetCapital)}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <p role="status" className="rd-muted">
              Không có lô phù hợp bộ lọc.
            </p>
          )}
          <nav className="pf-head" aria-label="Phân trang lô">
            <button
              className="rd-btn rd-btn--ghost"
              disabled={page === 1}
              onClick={() => changePage(page - 1)}
            >
              Trang trước
            </button>
            <span>
              Trang {query.data.page} / {Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}
            </span>
            <button
              className="rd-btn rd-btn--ghost"
              disabled={page * query.data.pageSize >= query.data.total}
              onClick={() => changePage(page + 1)}
            >
              Trang sau
            </button>
          </nav>
        </section>
      )}
    </div>
  )
}
export function InvestorBatchDetail({ code }: { code: string }) {
  const query = useInvestorBatch(code)
  if (!code)
    return (
      <section className="iv-card" role="alert">
        Không tìm thấy lô.
      </section>
    )
  if (query.isPending) return <Loading />
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />
  const batch = query.data
  const cost = batch.standardCost!
  return (
    <div className="be-layout">
      <section className="iv-card">
        <span className="pf-state">{states[batch.status] ?? batch.status}</span>
        <h2 className="rd-h3">{batch.title}</h2>
        <p className="rd-muted">
          {batch.operatorName} · {crabTypes[batch.crabType as keyof typeof crabTypes] ?? batch.crabType}
        </p>
      </section>
      <BatchTimeline code={code} />
      <div className="i2-grid">
        <section className="iv-card">
          <h2 className="rd-h3">Tiến độ gọi vốn</h2>
          <FundingProgress batch={batch} />
          <dl className="pf-dl">
            <dt>Vốn đã xác nhận</dt>
            <dd>{formatVnd(batch.fundingProgress.confirmedCapital)}</dd>
            <dt>Vốn đang giữ chỗ</dt>
            <dd>{formatVnd(batch.fundingProgress.reservedCapital)}</dd>
            <dt>Nhà đầu tư</dt>
            <dd>{batch.fundingProgress.investorCount}</dd>
            <dt>Mục tiêu</dt>
            <dd>{formatVnd(batch.targetCapital)}</dd>
          </dl>
          <p className="rd-note">Tiến độ theo vốn đã xác nhận. Vốn giữ chỗ được hiển thị riêng.</p>
        </section>
        <section className="iv-card">
          <h2 className="rd-h3">Điều khoản đã công bố</h2>
          <dl className="pf-dl">
            <dt>Số lượng giống</dt>
            <dd>{batch.seedQuantity} con</dd>
            <dt>Sản lượng dự kiến</dt>
            <dd>{batch.expectedOutputKg} kg</dd>
            <dt>Chu kỳ nuôi</dt>
            <dd>{batch.cycleDays} ngày</dd>
            <dt>Hạn bổ sung giống</dt>
            <dd>{batch.restockCutoffDays} ngày</dd>
            <dt>Vốn tối thiểu vận hành</dt>
            <dd>{formatVnd(batch.minViableCapital)}</dd>
            <dt>Vốn tối đa</dt>
            <dd>{formatVnd(batch.maxCapital)}</dd>
            <dt>Khoản góp tối thiểu</dt>
            <dd>{formatVnd(batch.minContribution)}</dd>
            <dt>Tỷ lệ chia của hộ nuôi</dt>
            <dd>{batch.operatorSharePct}%</dd>
            <dt>Mở gọi vốn</dt>
            <dd>{formatDateTime(batch.fundingOpenAt)}</dd>
            <dt>Hạn gọi vốn</dt>
            <dd>{formatDateTime(batch.fundingDeadline)}</dd>
            {batch.offtakeDepositPct != null && (
              <>
                <dt>Tỷ lệ cọc bao tiêu</dt>
                <dd>{batch.offtakeDepositPct}%</dd>
              </>
            )}
            {batch.offtakePreorderCapPct != null && (
              <>
                <dt>Trần bao tiêu + đặt trước</dt>
                <dd>{batch.offtakePreorderCapPct}%</dd>
              </>
            )}
          </dl>
        </section>
        {(batch.offtakePrices?.length ?? 0) > 0 && (
          <section className="iv-card">
            <h2 className="rd-h3">Giá chốt bao tiêu</h2>
            <dl className="pf-dl">
              {batch.offtakePrices!.map((p) => (
                <div key={p.gradeCode}>
                  <dt>{p.gradeName}</dt>
                  <dd>{formatVnd(p.unitPrice)}/kg</dd>
                </div>
              ))}
            </dl>
            <p className="rd-note">Giá công khai trước gọi vốn (TL-30). Đăng ký bao tiêu tại tab Bao tiêu.</p>
          </section>
        )}
        <section className="iv-card pf-wide">
          <h2 className="rd-h3">Chi phí chuẩn đã khóa</h2>
          <p className="rd-muted">Phiên bản {cost.versionNo} · Đã khóa</p>
          <dl className="pf-dl">
            {cost.items.map((item, index) => (
              <div className="be-cost" key={`${item.category}-${index}`}>
                <dt>{costCategories[item.category as keyof typeof costCategories] ?? item.category}</dt>
                <dd>{formatVnd(item.amount)}</dd>
              </div>
            ))}
            <dt>Tổng chi phí chuẩn</dt>
            <dd>{formatVnd(cost.total)}</dd>
          </dl>
          <p className="rd-note">Khóa lúc {formatDateTime(cost.lockedAt)}</p>
        </section>
      </div>
    </div>
  )
}

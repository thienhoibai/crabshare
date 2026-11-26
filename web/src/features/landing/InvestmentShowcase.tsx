/* Mục "Đầu tư nuôi cua" của trang chủ (#gop-von), theo bản mẫu Thiện đã chọn ngày 26/11
   (UI_DoAn/Landing_xanh/ban_5_dau_tu). Mọi số liệu lấy từ danh sách lô công khai; thiếu số nào thì ẩn ô đó.
   Ảnh là ảnh loại cua (web/public/minhbach), không phải ảnh của lô. Không ghi lời hứa về kết quả tài chính. */
import { ArrowRight, CalendarDays, HandCoins, Hourglass, Landmark, Milestone, Scale, Users, Wallet } from 'lucide-react'
import { formatDate, formatVnd } from '../../shared/lib/format'
import { IMG } from '../../shared/ui/kit/images'
import type { LandingBatch, LandingBatchesData } from './LandingBatches'
import './investment-showcase.css'

const CRAB_PHOTOS: Record<string, string> = {
  FatteningMudCrab: IMG.thit,
  RoeCrab: IMG.gach,
  OilRoeCrab: IMG.gach,
  YoungFemaleCrab: IMG.com,
  SoftShellCrab: IMG.hop,
}
const crabPhoto = (type: string | null) => (type && CRAB_PHOTOS[type]) || IMG.hop
const number = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)
const href = (code: string) => `/lo/${encodeURIComponent(code)}`
const DAY = 86_400_000

function ratioOf(b: LandingBatch) {
  return b.targetCapital !== null && b.confirmedCapital !== null && b.targetCapital > 0
    ? (b.confirmedCapital / b.targetCapital) * 100
    : null
}
function daysLeft(deadline: string | null) {
  if (!deadline) return null
  const days = Math.ceil((Date.parse(deadline) - Date.now()) / DAY)
  return days > 0 ? days : null
}
const investors = (count: number) => (count > 0 ? `${number(count)} nhà đầu tư` : 'Chưa có người góp')

/** Vòng tròn phần vốn đã xác nhận trên vốn mục tiêu. */
function Ring({ ratio }: { ratio: number }) {
  const r = 52
  const length = 2 * Math.PI * r
  const filled = (Math.min(100, Math.max(0, ratio)) / 100) * length
  return (
    <div className="lis2-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="lis2-ring__track" />
        <circle cx="60" cy="60" r={r} className="lis2-ring__fill" strokeDasharray={`${filled} ${length}`} />
      </svg>
      <span className="lis2-ring__label"><b>{number(ratio)}%</b><small>đã xác nhận</small></span>
    </div>
  )
}

/** Lô nổi bật: lô có hạn góp gần nhất. */
function FeaturedLot({ batch: b }: { batch: LandingBatch }) {
  const ratio = ratioOf(b)
  const left = daysLeft(b.fundingDeadline)
  const place = b.publicFarm?.name ?? b.publicOperatorName
  return (
    <article className="lis2-feat" data-testid="landing-funding-card" aria-label={b.title}>
      <a className="lis2-feat__photo" href={href(b.batchCode)}>
        <img src={crabPhoto(b.crabType)} alt="" loading="lazy" decoding="async" />
        <span className="lis2-chips">
          <span className="lis2-chip lis2-chip--live"><i aria-hidden="true" />Đang gọi vốn</span>
          {left !== null && <span className="lis2-chip lis2-chip--time"><Hourglass aria-hidden="true" />Còn {number(left)} ngày</span>}
        </span>
        <span className="lis2-feat__title">
          <small>{[b.batchCode, place].filter(Boolean).join(' · ')}</small>
          <b>{b.title}</b>
        </span>
      </a>
      <div className="lis2-feat__body">
        {ratio !== null && <Ring ratio={ratio} />}
        {ratio !== null && (
          <p className="lis2-money">
            <b>{formatVnd(b.confirmedCapital!)}</b> <span>/ {formatVnd(b.targetCapital!)}</span>
          </p>
        )}
        <ul className="lis2-facts">
          {b.minContribution !== null && <li><Wallet aria-hidden="true" />Góp tối thiểu <b>{formatVnd(b.minContribution)}</b></li>}
          {b.investorCount !== null && <li><Users aria-hidden="true" />Đã góp <b>{investors(b.investorCount)}</b></li>}
          {b.fundingDeadline && <li><CalendarDays aria-hidden="true" />Hạn góp <b>{formatDate(b.fundingDeadline)}</b></li>}
        </ul>
      </div>
      <a className="lis2-feat__go" href={href(b.batchCode)}>
        Góp vốn vào lô này <span aria-hidden="true"><ArrowRight /></span>
      </a>
    </article>
  )
}

/** Lô thứ hai, thứ ba: một dòng gọn có ảnh, mức góp và thanh tiến độ. */
function MiniLot({ batch: b }: { batch: LandingBatch }) {
  const ratio = ratioOf(b)
  const place = b.publicFarm?.name ?? b.publicOperatorName
  const sub = [place, b.minContribution !== null ? `góp từ ${formatVnd(b.minContribution)}` : null].filter(Boolean).join(' · ')
  return (
    <article className="lis2-mini" data-testid="landing-funding-card" aria-label={b.title}>
      <a href={href(b.batchCode)}>
        <img src={crabPhoto(b.crabType)} alt="" loading="lazy" decoding="async" />
        <span className="lis2-mini__text">
          <b>{b.title}</b>
          {sub && <small>{sub}</small>}
          {ratio !== null && <span className="lis2-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, ratio)}%` }} /></span>}
        </span>
        {ratio !== null && <span className="lis2-mini__pct">{number(ratio)}%</span>}
      </a>
    </article>
  )
}

const FLOW = [
  { icon: <HandCoins />, title: 'Bạn góp vốn', text: 'Chuyển khoản bằng mã riêng của lô, ký hợp đồng số.' },
  { icon: <Landmark />, title: 'Tài khoản riêng của lô', text: 'Tiền không đưa thẳng cho người nuôi.' },
  { icon: <Milestone />, title: 'Giải ngân theo mốc', text: 'Mỗi mốc có bằng chứng mới được chi.', extra: 'segs' as const },
  { icon: <Scale />, title: 'Quyết toán công khai', text: 'Chia theo tỷ lệ vốn, tới từng đồng.', extra: 'split' as const },
]

export function InvestmentShowcase({ data }: { data: LandingBatchesData }) {
  const [featured, ...others] = data.funding
  return (
    <section className="lis2" id="gop-von" aria-labelledby="lis2-title">
      <div className="ld-wrap">
        <div className="lis2-top">
          <div className="lis2-intro">
            <p className="lis2-kicker">Đầu tư nuôi cua</p>
            <h2 id="lis2-title">Góp vốn vào một lô cua. <em>Thấy rõ tiền đi đâu.</em></h2>
            <p className="lis2-lead">Mỗi lô một tài khoản riêng. Tiền ra theo mốc. Chia theo bảng quyết toán.</p>
            {(data.fundingCount !== null || data.minimumContribution !== null || data.fundingInvestors !== null) && (
              <dl className="lis2-nums">
                {data.fundingCount !== null && <div><dt>Lô đang gọi vốn</dt><dd>{number(data.fundingCount)}</dd></div>}
                {data.minimumContribution !== null && <div><dt>Góp từ</dt><dd className="is-money">{formatVnd(data.minimumContribution)}</dd></div>}
                {data.fundingInvestors !== null && data.fundingInvestors > 0 && <div><dt>Nhà đầu tư đã góp</dt><dd>{number(data.fundingInvestors)}</dd></div>}
              </dl>
            )}
            <div className="lis2-cta">
              <a className="ld-btn ld-btn--solid ld-btn--lg" href="/lo">Xem lô đang gọi vốn <ArrowRight size={18} aria-hidden="true" /></a>
              <a className="lis2-cta__link" href="#dong-von">Đồng vốn đi đâu <ArrowRight size={18} aria-hidden="true" /></a>
            </div>
            <p className="lis2-risk">Góp vốn có rủi ro. CrabShare không cam kết kết quả tài chính.</p>
          </div>

          <div className="lis2-lots">
            {featured && <FeaturedLot batch={featured} />}
            {others.length > 0 && <div className="lis2-minis">{others.map((b) => <MiniLot key={b.batchCode} batch={b} />)}</div>}
            {data.failed && (
              <p className="lis2-state" role="status">
                Chưa tải được thông tin lô. <button type="button" onClick={data.retry}>Thử lại</button>
              </p>
            )}
            {!data.loading && !data.failed && !featured && (
              <p className="lis2-state">Hiện chưa có lô đủ thông tin để nhận góp vốn.</p>
            )}
          </div>
        </div>

        <div className="lis2-flow" id="dong-von">
          <div className="lis2-flow__head">
            <h3>Đồng vốn của bạn <em>đi qua 4 chặng.</em></h3>
            <p>Chặng nào cũng xem được trong tài khoản của bạn.</p>
          </div>
          <ol>
            {FLOW.map((step) => (
              <li key={step.title}>
                <span className="lis2-node" aria-hidden="true">{step.icon}</span>
                <h4>{step.title}</h4>
                <p>{step.text}</p>
                {step.extra === 'segs' && <span className="lis2-segs" aria-hidden="true"><span>Mốc 1</span><span>Mốc 2</span><span>Mốc 3</span></span>}
                {step.extra === 'split' && <span className="lis2-split" aria-hidden="true"><i /><i /><i /></span>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

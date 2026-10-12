/* Cổng nhà đầu tư (bản 2, nền sáng kiểu ứng dụng): menu trái 3 mục, thẻ số liệu gọn, thẻ góp vốn dính bên phải trang lô.
   Dữ liệu đang lấy từ shared/ui/kit/mock-data.ts — các task Funding/Batches/Settlement sẽ thay bằng API. */
import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ArrowLeft, Bell, ChevronRight, Compass, House, Receipt, ShoppingBag, UserRound } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import KycVerification, { KycStatusCard } from '../accounts/KycVerification'
import PayoutAccountForm from '../accounts/PayoutAccountForm'
import {
  HOLDINGS, LOTS, NOTICES, STAGES, activeHoldings, activeTotal, closedPayout2610, lot, maxCapital, minContribution,
  pct, small, stage, tr, vnd, type Lot,
} from '../../shared/ui/kit/mock-data'
import {
  ContributeModal, CostBars, FundBar, Lifeline, Logo, SettleSim, SettlementCard, Shell, StageChip, Tabs, Tranches,
} from '../../shared/ui/kit/kit'
import './investor.css'

/* ---------- điều hướng trong một bản ---------- */
type View = 'home' | 'explore' | 'lot' | 'settle' | 'profile'
function useNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState<View>(location.pathname.endsWith('/ho-so') ? 'profile' : 'home')
  useEffect(() => {
    setView((current) => location.pathname.endsWith('/ho-so') ? 'profile' : current === 'profile' ? 'home' : current)
  }, [location.pathname])
  const [code, setCode] = useState('L2612-01')
  const [prev, setPrev] = useState<View>('home')
  const top = () => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  return {
    view,
    code,
    /** Trang đang được coi là mục menu hiện tại (lô mở từ đâu thì giữ mục đó). */
    section: view === 'lot' ? prev : view,
    go: (v: View) => { setView(v); navigate(v === 'profile' ? '/nha-dau-tu/ho-so' : '/nha-dau-tu'); top() },
    open: (c: string) => { setPrev(view === 'lot' ? prev : view); setCode(c); setView('lot'); top() },
    back: () => { setView(prev); top() },
  }
}

const FILTERS = ['Tất cả', ...STAGES.map((s) => s.label)] as const
type Filter = (typeof FILTERS)[number]
const byFilter = (f: Filter) => LOTS.filter((l) => f === 'Tất cả' || stage(l.stage).label === f)
const holdingOf = (code: string) => HOLDINGS.find((h) => h.code === code)
const facts = (l: Lot) => [
  ['Mục tiêu', tr(l.target, 0)],
  ['Đã góp', `${pct(l.confirmed, l.target)}%`],
  ['Góp tối thiểu', tr(minContribution(l))],
  ['Chu kỳ', `${l.cycleDays} ngày · ${l.boxes} ô`],
]

function Bell0() {
  return <button type="button" className="rd-iconbtn iv-bell" aria-label="Thông báo, 3 mới"><Bell size={18} /><i /></button>
}

/** Thẻ lô có ảnh nền: dùng ở lưới (bản 1) và băng chuyền (bản 3). */

/** Các khối nội dung của trang lô, bản nào cũng dùng. */
function LotSections({ l }: { l: Lot }) {
  return (
    <>
      <section className="iv-card">
        <h3 className="rd-h3">Tiền đi đâu</h3>
        <CostBars l={l} />
      </section>
      <section className="iv-card">
        <h3 className="rd-h3">Hành trình</h3>
        <Lifeline s={l.stage} />
        <Tranches l={l} />
        <p className="rd-note">{l.note}</p>
      </section>
      {l.stage === 'settle' ? (
        <section className="iv-card iv-card--wide">
          <h3 className="rd-h3">Bảng quyết toán</h3>
          <SettlementCard />
        </section>
      ) : l.stage !== 'closed' ? (
        <section className="iv-card iv-card--wide">
          <h3 className="rd-h3">Thử xem cách chia</h3>
          <SettleSim l={l} />
        </section>
      ) : null}
    </>
  )
}

function InvestCard({ l, onInvest }: { l: Lot; onInvest: (amount: number) => void }) {
  const min = minContribution(l)
  const room = Math.max(min, maxCapital(l) - l.confirmed)
  const [amount, setAmount] = useState(Math.min(room, Math.max(min, 10_000_000)))
  const mine = holdingOf(l.code)
  if (l.stage !== 'funding') {
    return (
      <aside className="i2-invest">
        <StageChip s={l.stage} />
        <p className="i2-invest__big">{l.when}</p>
        {mine ? <p className="rd-muted">Bạn góp {vnd(mine.amount)} vào lô này.</p> : <p className="rd-muted">Lô không nhận thêm vốn.</p>}
        <p className="rd-note">{l.note}</p>
      </aside>
    )
  }
  return (
    <aside className="i2-invest">
      <p className="rd-eyebrow">Góp vào lô này</p>
      <p className="i2-invest__big">{vnd(amount)}</p>
      <input className="rd-range" type="range" min={min} max={room} step={500_000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ '--p': (amount - min) / Math.max(1, room - min) } as CSSProperties} aria-label="Số tiền góp" />
      <div className="rd-range__ends"><span>Tối thiểu {tr(min)}</span><span>Còn {tr(room)}</span></div>
      <dl className="i2-invest__dl">
        <dt>Phần của bạn</dt><dd>≈ {pct(amount, l.confirmed + amount)}%</dd>
        <dt>Lỗ tối đa</dt><dd>{tr(amount)}</dd>
        <dt>Hạn gọi vốn</dt><dd>{l.when.replace(' gọi vốn', '')}</dd>
      </dl>
      <button type="button" className="rd-btn rd-btn--primary rd-btn--block rd-btn--lg" onClick={() => onInvest(amount)}>Góp vốn</button>
      <p className="rd-note">Giữ chỗ 15 phút. Chưa đủ 80% đúng hạn thì hoàn tiền.</p>
    </aside>
  )
}

function InvV2Inner() {
  const nav = useNav()
  const user = useAuthStore((s) => s.user)
  const fullName = user?.fullName ?? 'Nhà đầu tư'
  const initials = fullName.trim().split(/\s+/).slice(-2).map((word) => word[0]).join('')
  const [filter, setFilter] = useState<Filter>('Tất cả')
  const [investing, setInvesting] = useState<{ l: Lot; amount: number } | null>(null)
  const l = lot(nav.code)
  const bySt = (s: string) => activeHoldings.filter((h) => lot(h.code).stage === s).reduce((a, h) => a + h.amount, 0)
  const alloc = STAGES.map((s) => ({ ...s, v: bySt(s.key) })).filter((s) => s.v > 0)
  const items: { v: View; label: string; icon: typeof House }[] = [
    { v: 'home', label: 'Tổng quan', icon: House },
    { v: 'explore', label: 'Khám phá lô', icon: Compass },
    { v: 'settle', label: 'Quyết toán', icon: Receipt },
    { v: 'profile', label: 'Hồ sơ & eKYC', icon: UserRound },
  ]
  const active = nav.section
  const titles: Record<View, string> = { home: `Chào ${fullName}`, explore: 'Khám phá lô', lot: l.code, settle: 'Quyết toán', profile: 'Hồ sơ & eKYC' }
  return (
    <div className="i2">
      <aside className="i2-side">
        <Logo />
        <nav className="i2-nav" aria-label="Menu">
          {items.map(({ v, label, icon: Icon }) => (
            <button key={v} type="button" className={active === v ? 'is-on' : ''} onClick={() => nav.go(v)}><Icon size={18} />{label}</button>
          ))}
          <a href="/cua-hang"><ShoppingBag size={18} />Cửa hàng</a>
        </nav>
        <div className="i2-side__me"><span className="rd-avatar">{initials}</span><span><b>{fullName}</b><small>Nhà đầu tư</small></span></div>
      </aside>

      <main className="i2-main">
        <header className="i2-head">
          <div>
            {nav.view === 'lot' && <button type="button" className="iv-back" onClick={nav.back}><ArrowLeft size={16} /> Quay lại</button>}
            <h1 className="rd-h2">{titles[nav.view]}</h1>
          </div>
          <Bell0 />
        </header>

        {nav.view === 'home' && (
          <div className="i2-grid">
            <KycStatusCard />
            <section className="i2-balance">
              <small>Vốn đang tham gia</small>
              <b>{vnd(activeTotal)}</b>
              <span className="i2-alloc">{alloc.map((a) => <i key={a.key} style={{ flex: a.v, background: a.tone }} title={a.label} />)}</span>
              <ul className="i2-legend">{alloc.map((a) => <li key={a.key}><i style={{ background: a.tone }} />{a.label}<b>{tr(a.v, 0)}</b></li>)}</ul>
            </section>
            <section className="iv-card i2-todo">
              <h3 className="rd-h3">Việc cần làm</h3>
              <button type="button" onClick={() => nav.open('L2611-01')}><span className="i2-todo__dot" /><span><b>Soát quyết toán L2611-01</b><small>còn 5 ngày</small></span><ChevronRight size={18} /></button>
              <button type="button" onClick={() => nav.open('L2612-01')}><span className="i2-todo__dot is-green" /><span><b>L2612-01 sắp đủ vốn</b><small>84% · còn 5 ngày</small></span><ChevronRight size={18} /></button>
            </section>
            <section className="iv-card i2-table">
              <h3 className="rd-h3">Lô của bạn</h3>
              {activeHoldings.map((h) => {
                const x = lot(h.code)
                return (
                  <button type="button" key={h.code} className="i2-row" onClick={() => nav.open(h.code)}>
                    <img src={small(x.img, 200)} alt="" />
                    <span className="i2-row__name"><b>{x.code}</b><small>{x.crab}</small></span>
                    <StageChip s={x.stage} />
                    <span className="i2-row__life"><Lifeline s={x.stage} compact /></span>
                    <b className="i2-row__amt">{vnd(h.amount)}</b>
                    <ChevronRight size={18} />
                  </button>
                )
              })}
            </section>
            <section className="iv-card i2-notes">
              <h3 className="rd-h3">Mới nhất</h3>
              <ul>{NOTICES.map((n) => <li key={n.t}><b>{n.t}</b><small>{n.s}</small></li>)}</ul>
            </section>
          </div>
        )}

        {nav.view === 'profile' && <div className="account-profile"><section className="iv-card">
          <h3 className="rd-h3">Thông tin nhà đầu tư</h3>
          <p><strong>{fullName}</strong><br />{user?.email}</p>
          <KycVerification />
        </section><section className="iv-card"><h3 className="rd-h3">Tài khoản nhận tiền</h3><PayoutAccountForm owner="Investor" /></section>
          {user?.roles.includes('Customer') && <section className="iv-card"><h3 className="rd-h3">Địa chỉ giao hàng</h3><a className="rd-btn rd-btn--ghost" href="/tai-khoan/dia-chi">Mở sổ địa chỉ</a></section>}
        </div>}

        {nav.view === 'explore' && (
          <div className="i2-explore">
            <Tabs items={FILTERS} value={filter} onChange={setFilter} />
            <div className="iv-card i2-list">
              {byFilter(filter).map((x) => (
                <button type="button" key={x.code} className="i2-lrow" onClick={() => nav.open(x.code)}>
                  <img src={small(x.img, 240)} alt="" />
                  <span className="i2-lrow__name"><b>{x.code}</b><small>{x.crab} · {x.boxes} ô</small></span>
                  <span className="i2-lrow__prog">{x.stage === 'funding' ? <><FundBar l={x} labels={false} /><small>{pct(x.confirmed, x.target)}% của {tr(x.target, 0)}</small></> : <><Lifeline s={x.stage} compact /><small>{stage(x.stage).label}</small></>}</span>
                  <span className="i2-lrow__when">{x.when}</span>
                  <span className="rd-btn rd-btn--ghost rd-btn--sm">Xem</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {nav.view === 'lot' && (
          <div className="i2-lot">
            <div className="i2-lot__main">
              <div className="i2-lot__img"><img src={l.img} alt="" /><StageChip s={l.stage} solid /></div>
              <p className="rd-muted">{l.crab} · {l.boxes} ô · {OPERATOR_NAME}</p>
              <dl className="i2-facts">{facts(l).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
              <LotSections l={l} />
            </div>
            <InvestCard key={l.code} l={l} onInvest={(amount) => setInvesting({ l, amount })} />
          </div>
        )}

        {nav.view === 'settle' && (
          <div className="i2-grid">
            <section className="iv-card i2-wide">
              <h3 className="rd-h3">L2611-01 · chờ bạn soát</h3>
              <SettlementCard />
            </section>
            <section className="iv-card">
              <h3 className="rd-h3">Đã xong</h3>
              <div className="i2-done"><span><b>L2610-03</b><small>Cua gạch · góp 15 triệu</small></span><b>{vnd(closedPayout2610)}</b></div>
              <p className="rd-note">Tiền đã chuyển về tài khoản ngân hàng của bạn.</p>
            </section>
          </div>
        )}
      </main>
      {investing && <ContributeModal l={investing.l} initial={investing.amount} onClose={() => setInvesting(null)} />}
    </div>
  )
}
const OPERATOR_NAME = 'HTX Nuôi cua Cà Mau'

export default function InvestorPortal() {
  return (
    <Shell theme="light">
      <InvV2Inner />
    </Shell>
  )
}

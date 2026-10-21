/* Cổng nhà đầu tư bản 2. Tab Quyết toán là sao kê thật (TH-13). */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ArrowLeft, Compass, FileSignature, Handshake, House, Receipt, Wallet, ShoppingBag, UserRound } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import KycVerification, { KycStatusCard } from '../accounts/KycVerification'
import PayoutAccountForm from '../accounts/PayoutAccountForm'
import InvestorBatches, { InvestorBatchDetail } from './batches/InvestorBatches'
import InvestorPortfolio, { PortfolioOverview, PortfolioPosition } from './portfolio/InvestorPortfolio'
import InvestorOfftake from './offtake/InvestorOfftake'
import InvestorContracts from './contracts/InvestorContracts'
import InvestorSettlements from './settlement/InvestorSettlements'
import NotificationBell from './notifications/NotificationBell'
import { Logo, Shell } from '../../shared/ui/kit/kit'
import './investor.css'

/* ---------- điều hướng trong một bản ---------- */
type View = 'home' | 'explore' | 'lot' | 'settle' | 'profile' | 'portfolio' | 'position' | 'offtake' | 'contracts'
function pathView(path: string): View | null {
  if (path === '/nha-dau-tu/hop-dong') return 'contracts'
  if (path.startsWith('/nha-dau-tu/lo/')) return 'lot'
  if (path === '/nha-dau-tu/kham-pha') return 'explore'
  if (path.startsWith('/nha-dau-tu/danh-muc/')) return 'position'
  if (path === '/nha-dau-tu/danh-muc') return 'portfolio'
  if (path === '/nha-dau-tu/bao-tieu' || path.startsWith('/nha-dau-tu/bao-tieu')) return 'offtake'
  if (path.endsWith('/ho-so')) return 'profile'
  return null
}
function portfolioCode(path: string) {
  try { return decodeURIComponent(path.split('/danh-muc/')[1] ?? '') } catch { return '' }
}
function useNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState<View>(pathView(location.pathname) ?? 'home')
  useEffect(() => {
    setView((current) => pathView(location.pathname) ?? (['profile', 'portfolio', 'position', 'explore', 'lot', 'offtake', 'contracts'].includes(current) ? 'home' : current))
  }, [location.pathname])
  let code = ''
  try { code = decodeURIComponent(location.pathname.split('/lo/')[1] ?? '') } catch { /* Mã URL không hợp lệ. */ }
  const top = () => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  return {
    view,
    code,
    portfolioCode: portfolioCode(location.pathname),
    /** Trang đang được coi là mục menu hiện tại (lô mở từ đâu thì giữ mục đó). */
    section: view === 'position' ? 'portfolio' : view === 'lot' ? 'explore' : view,
    go: (v: View) => { setView(v); navigate(v === 'profile' ? '/nha-dau-tu/ho-so' : v === 'portfolio' ? '/nha-dau-tu/danh-muc' : v === 'explore' ? '/nha-dau-tu/kham-pha' : v === 'offtake' ? '/nha-dau-tu/bao-tieu' : v === 'contracts' ? '/nha-dau-tu/hop-dong' : '/nha-dau-tu'); top() },
    openPosition: (c: string) => { navigate(`/nha-dau-tu/danh-muc/${encodeURIComponent(c)}`); top() },
    open: (c: string) => { navigate(`/nha-dau-tu/lo/${encodeURIComponent(c)}${location.search}`); top() },
    back: () => { navigate(`/nha-dau-tu/kham-pha${location.search}`); top() },
  }
}

function InvV2Inner() {
  const nav = useNav()
  const user = useAuthStore((s) => s.user)
  const fullName = user?.fullName ?? 'Nhà đầu tư'
  const initials = fullName.trim().split(/\s+/).slice(-2).map((word) => word[0]).join('')
  const items: { v: View; label: string; icon: typeof House }[] = [
    { v: 'home', label: 'Tổng quan', icon: House },
    { v: 'portfolio', label: 'Danh mục', icon: Wallet },
    { v: 'offtake', label: 'Bao tiêu', icon: Handshake },
    { v: 'contracts', label: 'Hợp đồng', icon: FileSignature },
    { v: 'explore', label: 'Khám phá lô', icon: Compass },
    { v: 'settle', label: 'Quyết toán', icon: Receipt },
    { v: 'profile', label: 'Hồ sơ & eKYC', icon: UserRound },
  ]
  const active = nav.section
  const titles: Record<View, string> = { home: `Chào ${fullName}`, explore: 'Khám phá lô', lot: nav.code, settle: 'Quyết toán', profile: 'Hồ sơ & eKYC', portfolio: 'Danh mục', position: 'Chi tiết danh mục', offtake: 'Bao tiêu', contracts: 'Hợp đồng góp vốn' }
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
            {nav.view === 'position' && <button type="button" className="iv-back" onClick={() => nav.go('portfolio')}><ArrowLeft size={16} /> Danh mục</button>}
            {nav.view === 'lot' && <button type="button" className="iv-back" onClick={nav.back}><ArrowLeft size={16} /> Quay lại</button>}
            <h1 className="rd-h2">{titles[nav.view]}</h1>
          </div>
          <NotificationBell />
        </header>

        {nav.view === 'home' && <><KycStatusCard /><PortfolioOverview open={nav.openPosition} all={() => nav.go('portfolio')} /></>}
        {nav.view === 'portfolio' && <InvestorPortfolio open={nav.openPosition} />}
        {nav.view === 'position' && <PortfolioPosition code={nav.portfolioCode} />}
        {nav.view === 'offtake' && <InvestorOfftake />}
        {nav.view === 'contracts' && <InvestorContracts />}

        {nav.view === 'profile' && <div className="account-profile"><section className="iv-card">
          <h3 className="rd-h3">Thông tin nhà đầu tư</h3>
          <p><strong>{fullName}</strong><br />{user?.email}</p>
          <KycVerification />
        </section><section className="iv-card"><h3 className="rd-h3">Tài khoản nhận tiền</h3><PayoutAccountForm owner="Investor" /></section>
          {user?.roles.includes('Customer') && <section className="iv-card"><h3 className="rd-h3">Địa chỉ giao hàng</h3><a className="rd-btn rd-btn--ghost" href="/tai-khoan/dia-chi">Mở sổ địa chỉ</a></section>}
        </div>}

        {nav.view === 'explore' && <InvestorBatches open={nav.open} />}
        {nav.view === 'lot' && <InvestorBatchDetail code={nav.code} />}

        {nav.view === 'settle' && <InvestorSettlements />}
      </main>
    </div>
  )
}

export default function InvestorPortal() {
  return (
    <Shell theme="light">
      <InvV2Inner />
    </Shell>
  )
}

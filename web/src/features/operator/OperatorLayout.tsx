import { useEffect, useState, type ReactNode } from 'react'
import {
  Bell, BellRing, ClipboardSignature, DollarSign, Home, LayoutGrid, LogOut, Map, Menu, Monitor, NotebookPen, Package, Smartphone, Store, Users, X,
} from 'lucide-react'
import { Logo, Shell } from '../../shared/ui/kit/kit'
import { useAuthStore } from '../../shared/auth/authStore'
import { useOperatorApplication } from './operatorsApi'
import './operator.css'

const ALERT_COUNT = 2

const navGroups = [
  {
    label: 'Vận hành',
    items: [
      { id: 'dashboard', href: '/operator', icon: Home, label: 'Tổng quan' },
      { id: 'batch', href: '/operator/batch', icon: LayoutGrid, label: 'Quản lý lô nuôi' },
      { id: 'map', href: '/operator/map', icon: Map, label: 'Sơ đồ trại' },
      { id: 'members', href: '/operator/members', icon: Users, label: 'Nhân viên' },
    ],
  },
  {
    label: 'Pháp lý',
    items: [
      { id: 'register', href: '/operator/register', icon: ClipboardSignature, label: 'Đăng ký hộ nuôi' },
      { id: 'kyc', href: '/operator/kyc', icon: ClipboardSignature, label: 'Hồ sơ & eKYC' },
    ],
  },
  {
    label: 'Thu hoạch & tiền',
    items: [
      { id: 'harvest', href: '/operator/harvest', icon: Package, label: 'Thu hoạch & đóng gói' },
      { id: 'listings', href: '/operator/listings', icon: Store, label: 'Niêm yết sản phẩm' },
      { id: 'settlement', href: '/operator/settlement', icon: DollarSign, label: 'Đối soát doanh thu' },
      { id: 'payout', href: '/operator/payout-account', icon: DollarSign, label: 'Tài khoản nhận tiền' },
    ],
  },
  {
    label: 'Tác vụ nhanh',
    items: [
      { id: 'log', href: '/operator/log', icon: NotebookPen, label: 'Nhật ký nuôi' },
      { id: 'alerts', href: '/operator/alerts', icon: BellRing, label: 'Cảnh báo' },
    ],
  },
]

const tabs = [
  { id: 'dashboard', href: '/operator', icon: Home, label: 'Tổng quan' },
  { id: 'batch', href: '/operator/batch', icon: LayoutGrid, label: 'Lô nuôi' },
  { id: 'map', href: '/operator/map', icon: Map, label: 'Sơ đồ' },
  { id: 'harvest', href: '/operator/harvest', icon: Package, label: 'Thu hoạch' },
]

const devices: Record<string, { name: string; w: number; h: number }> = {
  '6.5': { name: 'iPhone 13/14 (6.5")', w: 390, h: 844 },
  '6.7': { name: 'iPhone 14 Pro Max (6.7")', w: 430, h: 932 },
  '6.9': { name: 'Galaxy S20 Ultra (6.9")', w: 412, h: 915 },
  ipad: { name: 'iPad Pro (11")', w: 834, h: 1194 },
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() || 'OP'

function NavLinks({ activeTab, onPick }: { activeTab: string; onPick?: () => void }) {
  return (
    <nav className="o2-nav" aria-label="Menu hộ nuôi">
      {navGroups.map((group) => (
        <div key={group.label} className="contents">
          <p className="o2-nav__label">{group.label}</p>
          {group.items.map(({ id, href, icon: Icon, label }) => (
            <a key={id} href={href} className={activeTab === id ? 'is-on' : ''} onClick={onPick}>
              <Icon size={18} />
              {label}
              {id === 'alerts' && <span className="o2-count">{ALERT_COUNT}</span>}
            </a>
          ))}
        </div>
      ))}
    </nav>
  )
}

function Simulator({ onClose }: { onClose: () => void }) {
  const [device, setDevice] = useState('6.5')
  const [scale, setScale] = useState(0.8)
  const d = devices[device]
  return (
    <div className="o2-sim">
      <div className="o2-sim__bar">
        <div>
          <Monitor size={18} />
          <select value={device} onChange={(e) => setDevice(e.target.value)} aria-label="Thiết bị">
            {Object.entries(devices).map(([k, v]) => <option key={k} value={k}>{v.name} ({v.w}×{v.h})</option>)}
          </select>
          <span className="o2-sim__zoom">
            <button type="button" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} aria-label="Thu nhỏ">−</button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale((s) => Math.min(1.5, s + 0.1))} aria-label="Phóng to">+</button>
          </span>
        </div>
        <button type="button" className="rd-btn rd-btn--sm rd-btn--ghost" onClick={onClose}><X size={16} /> Đóng</button>
      </div>
      <div className="o2-sim__stage">
        <div style={{ width: (d.w + 24) * scale, height: (d.h + 24) * scale, flex: 'none' }}>
          <div
            style={{
              width: d.w + 24, height: d.h + 24, padding: 12, borderRadius: 48, background: '#000',
              transform: `scale(${scale})`, transformOrigin: 'top left',
            }}
          >
            <iframe src={window.location.pathname + window.location.search} title="Xem trên di động" style={{ width: '100%', height: '100%', border: 0, borderRadius: 36, background: 'var(--bg)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OperatorLayout({ children, activeTab }: { children: ReactNode; activeTab: string }) {
  const application = useOperatorApplication()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [showSimulator, setShowSimulator] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDemoFrame, setIsDemoFrame] = useState(false)

  useEffect(() => { setIsDemoFrame(window.self !== window.top) }, [])

  const name = user?.fullName ?? 'Hộ nuôi'
  const farmName = application.isPending ? 'Đang tải hồ sơ…' : application.isError ? 'Không tải được hồ sơ' : application.data?.legalName ?? 'Chưa có hồ sơ'
  const memberRole = application.data ? application.data.memberRole === 'Owner' ? 'Chủ hộ nuôi' : 'Nhân viên hộ nuôi' : 'CrabShare Operator'
  const signOut = () => { logout(); window.location.href = '/' }
  const bell = (
    <a href="/operator/alerts" className="rd-iconbtn o2-bell" aria-label={`Cảnh báo, ${ALERT_COUNT} mới`}>
      <Bell size={18} />{ALERT_COUNT > 0 && <i />}
    </a>
  )

  return (
    <Shell theme="light">
      <div className="o2">
        <aside className="o2-side">
          <Logo href="/operator" />
          <div className="o2-farm">
            <small>Hồ sơ hộ nuôi</small>
            <b>{farmName}</b>
            <span>{memberRole}</span>
          </div>
          <NavLinks activeTab={activeTab} />
          <div className="o2-side__foot">
            {!isDemoFrame && (
              <button type="button" className="rd-btn rd-btn--sm rd-btn--ghost rd-btn--block" onClick={() => setShowSimulator(true)}>
                <Smartphone size={16} /> Xem bản di động
              </button>
            )}
            <div className="o2-me">
              <span className="rd-avatar">{initials(name)}</span>
              <span><b className="truncate">{name}</b><small>{memberRole}</small></span>
            </div>
            <button type="button" className="o2-out" onClick={signOut}><LogOut size={16} /> Đăng xuất</button>
          </div>
        </aside>

        <header className="o2-mhead">
          <Logo href="/operator" />
          {bell}
        </header>

        <main className="o2-main">
          <div className="o2-top">
            <p className="o2-top__where">{farmName} · <b>{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</b></p>
            <div className="o2-top__right">
              {bell}
              <span className="rd-avatar" title={name}>{initials(name)}</span>
            </div>
          </div>
          {children}
        </main>

        <nav className="o2-tabbar" aria-label="Điều hướng nhanh">
          {tabs.map(({ id, href, icon: Icon, label }) => (
            <a key={id} href={href} className={`o2-tab ${activeTab === id ? 'is-on' : ''}`}><Icon size={20} />{label}</a>
          ))}
          <button type="button" className={`o2-tab ${menuOpen ? 'is-on' : ''}`} onClick={() => setMenuOpen(true)}><Menu size={20} />Menu</button>
        </nav>

        {menuOpen && (
          <div className="o2-sheet" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="o2-sheet__scrim" onClick={() => setMenuOpen(false)} />
            <div className="o2-sheet__panel">
              <div className="o2-sheet__head">
                <div className="o2-me">
                  <span className="rd-avatar">{initials(name)}</span>
                  <span><b>{name}</b><small>{farmName}</small></span>
                </div>
                <button type="button" className="rd-iconbtn" onClick={() => setMenuOpen(false)} aria-label="Đóng"><X size={18} /></button>
              </div>
              <NavLinks activeTab={activeTab} onPick={() => setMenuOpen(false)} />
              <button type="button" className="o2-out" onClick={signOut}><LogOut size={16} /> Đăng xuất</button>
            </div>
          </div>
        )}

        {showSimulator && !isDemoFrame && <Simulator onClose={() => setShowSimulator(false)} />}
      </div>
    </Shell>
  )
}

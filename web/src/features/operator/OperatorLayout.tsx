import { useState, useEffect, type ReactNode } from 'react'
import { Home, LayoutGrid, ClipboardSignature, BellRing, LogOut, Package, DollarSign, Smartphone, Menu, X, Monitor, Map, NotebookPen } from 'lucide-react'
import './operator.css'

const navGroups = [
  {
    label: 'Vận hành',
    items: [
      { id: 'dashboard', href: '/operator', icon: Home, label: 'Tổng quan' },
      { id: 'batch', href: '/operator/batch', icon: LayoutGrid, label: 'Quản lý lô nuôi' },
      { id: 'map', href: '/operator/map', icon: Map, label: 'Sơ đồ trại (RAS)' },
    ],
  },
  {
    label: 'Pháp lý',
    items: [
      { id: 'kyc', href: '/operator/kyc', icon: ClipboardSignature, label: 'Hồ sơ & eKYC' },
    ],
  },
  {
    label: 'Thu hoạch & tiền',
    items: [
      { id: 'harvest', href: '/operator/harvest', icon: Package, label: 'Thu hoạch & đóng gói' },
      { id: 'settlement', href: '/operator/settlement', icon: DollarSign, label: 'Đối soát doanh thu' },
    ],
  },
]

export default function OperatorLayout({ children, activeTab }: { children: ReactNode; activeTab: string }) {
  const [showSimulator, setShowSimulator] = useState(false)
  const [device, setDevice] = useState('6.5')
  const [scale, setScale] = useState(0.8)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isDemoFrame, setIsDemoFrame] = useState(false)

  useEffect(() => {
    setIsDemoFrame(window.self !== window.top)
  }, [])

  const devices: Record<string, { name: string; w: number; h: number }> = {
    '6.5': { name: 'iPhone 13/14 (6.5")', w: 390, h: 844 },
    '6.7': { name: 'iPhone 14 Pro Max (6.7")', w: 430, h: 932 },
    '6.9': { name: 'Galaxy S20 Ultra (6.9")', w: 412, h: 915 },
    ipad: { name: 'iPad Pro (11")', w: 834, h: 1194 },
  }

  const linkClass = (id: string) => `op-nav-link ${activeTab === id ? 'is-active' : ''}`

  const extraLinks = (
    <>
      <a href="/operator/log" className={linkClass('log')}>
        <NotebookPen className="w-4 h-4" /> Nhật ký nuôi
      </a>
      <a href="/operator/alerts" className={`${linkClass('alerts')} justify-between`}>
        <span className="flex items-center gap-2.5"><BellRing className="w-4 h-4" /> Cảnh báo</span>
        <span className="op-count">2</span>
      </a>
    </>
  )

  return (
    <div className="op-app">
      <header className="op-mobile-header">
        <div className="flex items-center gap-2">
          <div className="op-brand-mark">
            <img src="/assets/imgRegisterCrab.svg" alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </div>
          <strong className="op-wordmark">CrabShare</strong>
        </div>
        <div className="flex items-center gap-3">
          <a href="/operator/alerts" className="relative p-1">
            <BellRing className="w-5 h-5 text-[#4a433c]" />
            <span className="op-alert-dot">2</span>
          </a>
        </div>
      </header>

      <nav className="op-tabbar">
        <a href="/operator" className={`op-tab ${activeTab === 'dashboard' ? 'is-active' : ''}`}>
          <Home className="w-5 h-5" /><span>Trang chủ</span>
        </a>
        <a href="/operator/batch" className={`op-tab ${activeTab === 'batch' ? 'is-active' : ''}`}>
          <LayoutGrid className="w-5 h-5" /><span>Lô nuôi</span>
        </a>
        <a href="/operator/map" className={`op-tab ${activeTab === 'map' ? 'is-active' : ''}`}>
          <Map className="w-5 h-5" /><span>Sơ đồ</span>
        </a>
        <a href="/operator/harvest" className={`op-tab ${activeTab === 'harvest' ? 'is-active' : ''}`}>
          <Package className="w-5 h-5" /><span>Thu hoạch</span>
        </a>
        <button type="button" onClick={() => setMobileMenuOpen(true)} className={`op-tab ${mobileMenuOpen ? 'is-active' : ''}`}>
          <Menu className="w-5 h-5" /><span>Menu</span>
        </button>
      </nav>

      {mobileMenuOpen && (
        <>
          <div className="op-sheet-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <aside className="op-sheet">
            <div className="op-sheet-head">
              Tính năng khác
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="rounded-full bg-[#f4efe8] p-1"><X className="w-4 h-4" /></button>
            </div>
            <nav className="op-nav">
              <a href="/operator/kyc" className={linkClass('kyc')}><ClipboardSignature className="w-4 h-4" /> Hồ sơ & eKYC</a>
              <a href="/operator/settlement" className={linkClass('settlement')}><DollarSign className="w-4 h-4" /> Đối soát doanh thu</a>
              {extraLinks}
              <a href="/" className="op-nav-link" style={{ color: '#b42318', marginTop: 12 }}>
                <LogOut className="w-4 h-4" /> Đăng xuất
              </a>
            </nav>
          </aside>
        </>
      )}

      <aside className="op-sidebar">
        <a href="/" className="op-sidebar-brand">
          <div className="op-sidebar-word">
            <strong>CRABSHARE</strong>
            <span>OPERATOR</span>
          </div>
          <div className="op-brand-mark">
            <img src="/assets/imgRegisterCrab.svg" alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </div>
        </a>
        <div className="op-farm-chip">
          <small>Trại đang vận hành</small>
          <strong>Trại Cần Giờ 01</strong>
          <span>Nguyễn Văn A · RAS 155 ô</span>
        </div>
        <nav className="op-nav">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="op-nav-label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <a key={item.id} href={item.href} className={linkClass(item.id)}>
                    <Icon className="w-4 h-4" /> {item.label}
                  </a>
                )
              })}
            </div>
          ))}
          <p className="op-nav-label">Tác vụ nhanh</p>
          {extraLinks}
        </nav>
        <div className="op-sidebar-foot">
          {!isDemoFrame && (
            <button type="button" onClick={() => setShowSimulator(true)} className="op-btn op-btn-ink op-btn-full op-btn-sm">
              <Smartphone className="w-4 h-4" /> Bật demo mobile
            </button>
          )}
          <a href="/" className="op-nav-link" style={{ marginBottom: 0 }}>
            <LogOut className="w-4 h-4" /> Đăng xuất
          </a>
        </div>
      </aside>

      <main className="op-main">{children}</main>

      {showSimulator && !isDemoFrame && (
        <div className="op-sim-root">
          <div className="op-sim-bar">
            <div className="flex items-center gap-3 overflow-x-auto">
              <Monitor className="w-5 h-5 text-[#f4cf9c] shrink-0" />
              <strong className="hidden lg:block tracking-[.16em] text-xs">MOBILE UI SIMULATOR</strong>
              <select value={device} onChange={(e) => setDevice(e.target.value)}>
                {Object.entries(devices).map(([k, v]) => (
                  <option key={k} value={k}>{v.name} ({v.w}×{v.h})</option>
                ))}
              </select>
              <div className="op-sim-zoom hidden sm:flex items-center gap-2">
                <button type="button" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}>−</button>
                <span className="w-12 text-center text-[#f4cf9c]">{Math.round(scale * 100)}%</span>
                <button type="button" onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}>+</button>
              </div>
            </div>
            <button type="button" onClick={() => setShowSimulator(false)} className="op-btn op-btn-outline op-btn-sm" style={{ background: '#222', color: '#fff', borderColor: '#444' }}>
              <X className="w-4 h-4" /> Đóng
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center">
            <div
              className="relative mt-6 shrink-0"
              style={{ width: (devices[device].w + 24) * scale, height: (devices[device].h + 24) * scale }}
            >
              <div
                className="absolute top-0 left-0 bg-black rounded-[3rem] p-3 shadow-2xl border border-gray-800 flex"
                style={{
                  width: devices[device].w + 24,
                  height: devices[device].h + 24,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div className="absolute right-[-2px] top-32 w-1 h-16 bg-gray-800 rounded-r-lg" />
                <div className="absolute left-[-2px] top-24 w-1 h-12 bg-gray-800 rounded-l-lg" />
                <div className="absolute left-[-2px] top-40 w-1 h-12 bg-gray-800 rounded-l-lg" />
                <div className="w-full h-full rounded-[2.2rem] overflow-hidden bg-[#f4efe8] relative border border-gray-900">
                  {device !== 'ipad' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-50" />}
                  <iframe src={window.location.pathname} className="w-full h-full border-none" title="Mobile View Simulator" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* Khung điều hành dùng chung cho mọi cổng: menu trái, thanh trên, thanh dưới và menu trượt trên di động.
   Dùng làm layout route: { element: <ConsoleLayout area="operator" />, children: [...] }. Trang con chỉ trả về nội dung. */
import { useEffect, useState, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { ArrowLeftRight, Bell, LogOut, Menu, X } from 'lucide-react'
import { useGet } from '../../api/hooks'
import { useAuthStore } from '../../auth/authStore'
import { Logo, Shell } from '../kit/kit'
import { AREAS, areasFor, type Area, type NavItem } from './nav'
import './console.css'
import './console-v15.css'

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase() || 'CS'

/** Mục menu khớp với đường dẫn hiện tại: href dài nhất là đầu của đường dẫn. */
function activeHref(items: NavItem[], path: string): string | null {
  let best: string | null = null
  for (const { href } of items) {
    const match = path === href || path.startsWith(`${href}/`)
    if (match && (!best || href.length > best.length)) best = href
  }
  return best
}

function NavLinks({ area, active, roles, onPick }: { area: Area; active: string | null; roles: readonly string[]; onPick?: () => void }) {
  return (
    <nav className="o2-nav" aria-label={`Menu ${AREAS[area].title}`}>
      {AREAS[area].groups.map((group) => {
        const items = group.items.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r)))
        if (items.length === 0) return null
        return (
          <div key={group.label} className="contents">
            <p className="o2-nav__label">{group.label}</p>
            {items.map(({ href, icon: Icon, label }) => (
              <a key={href} href={href} className={active === href ? 'is-on' : ''} aria-current={active === href ? 'page' : undefined} onClick={onPick}>
                <Icon size={18} />
                {label}
              </a>
            ))}
          </div>
        )
      })}
    </nav>
  )
}

/** Tên hộ nuôi ở thẻ đầu menu của cổng người nuôi. */
function OperatorCard() {
  const me = useGet<{ legalName?: string | null; memberRole?: string | null; status?: string | null }>('/api/operators/me', undefined, { retry: false })
  const name = me.isPending ? 'Đang tải hồ sơ…' : me.data?.legalName ?? 'Chưa có hồ sơ hộ nuôi'
  const role = me.data ? (me.data.memberRole === 'Owner' ? 'Chủ hộ nuôi' : 'Nhân viên hộ nuôi') : 'Người nuôi'
  return (
    <div className="o2-farm">
      <small>Hồ sơ hộ nuôi</small>
      <b>{name}</b>
      <span>{role}</span>
    </div>
  )
}

export default function ConsoleLayout({ area, children }: { area: Area; children?: ReactNode }) {
  const config = AREAS[area]
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const roles = user?.roles ?? []
  const name = user?.fullName ?? config.title
  const allItems = config.groups.flatMap((g) => g.items).filter((i) => !i.roles || i.roles.some((r) => roles.includes(r)))
  const active = activeHref(allItems, location.pathname)
  const tabs = allItems.filter((i) => i.tab).slice(0, 4)
  const others = areasFor(roles).filter((a) => a !== area)
  const signOut = () => { logout(); window.location.href = '/' }

  const bell = config.bell ? (
    <a href={config.bell} className="rd-iconbtn o2-bell" aria-label="Cảnh báo và thông báo"><Bell size={18} /></a>
  ) : null
  const card = area === 'operator' ? <OperatorCard /> : (
    <div className="o2-farm">
      <small>Cổng</small>
      <b>{config.title}</b>
      <span>{user?.email}</span>
    </div>
  )
  const switcher = others.length > 0 && (
    <div className="op-todo">
      {others.map((a) => (
        <a key={a} href={AREAS[a].home}>
          <ArrowLeftRight size={16} />
          <span><small>Chuyển sang cổng</small><b>{AREAS[a].title}</b></span>
        </a>
      ))}
    </div>
  )

  return (
    <Shell theme="light">
      <div className="o2">
        <aside className="o2-side">
          <Logo href={config.home} />
          {card}
          <NavLinks area={area} active={active} roles={roles} />
          <div className="o2-side__foot">
            {switcher}
            <div className="o2-me">
              <span className="rd-avatar">{initials(name)}</span>
              <span><b className="truncate">{name}</b><small>{config.title}</small></span>
            </div>
            <button type="button" className="o2-out" onClick={signOut}><LogOut size={16} /> Đăng xuất</button>
          </div>
        </aside>

        <header className="o2-mhead">
          <Logo href={config.home} />
          {bell}
        </header>

        <main className="o2-main">
          <div className="o2-top">
            <p className="o2-top__where">{config.title} · <b>{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</b></p>
            <div className="o2-top__right">
              {bell}
              <span className="rd-avatar" title={name}>{initials(name)}</span>
            </div>
          </div>
          {children ?? <Outlet />}
        </main>

        <nav className="o2-tabbar" aria-label="Điều hướng nhanh">
          {tabs.map(({ href, icon: Icon, label, short }) => (
            <a key={href} href={href} className={`o2-tab ${active === href ? 'is-on' : ''}`}><Icon size={20} />{short ?? label}</a>
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
                  <span><b>{name}</b><small>{config.title}</small></span>
                </div>
                <button type="button" className="rd-iconbtn" onClick={() => setMenuOpen(false)} aria-label="Đóng"><X size={18} /></button>
              </div>
              <NavLinks area={area} active={active} roles={roles} onPick={() => setMenuOpen(false)} />
              {switcher}
              <button type="button" className="o2-out" onClick={signOut}><LogOut size={16} /> Đăng xuất</button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

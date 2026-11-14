/* Khung của các trang công khai: thanh trên dạng viên thuốc của bộ kit, thân trang, chân trang.
   Thay cho SiteChrome cũ. Không ghi chứng nhận hay lời hứa về lợi nhuận (BR-219). */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { LogIn, LogOut, UserRound } from 'lucide-react'
import { homePathFor, useAuthStore } from '../auth/authStore'
import { Logo, Shell } from '../ui/kit/kit'
import { AREAS, areasFor } from '../ui/console/nav'
import '../ui/console/console.css'
import '../ui/console/console-v15.css'

const LINKS = [
  { href: '/lo', label: 'Lô đang mở' },
  { href: '/chuan-phan-hang', label: 'Chuẩn phân hạng' },
  { href: '/#chia', label: 'Cách chia tiền' },
]

function AccountMenu() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!host.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key) }
  }, [open])

  if (!user) {
    return (
      <>
        <a className="rd-btn rd-btn--sm rd-btn--ghost" href="/dang-ky">Đăng ký</a>
        <a className="rd-btn rd-btn--sm rd-btn--primary" href="/dang-nhap"><LogIn size={15} /> Đăng nhập</a>
      </>
    )
  }
  const areas = areasFor(user.roles)
  return (
    <div className="op-acct" ref={host}>
      <button type="button" className="rd-btn rd-btn--sm rd-btn--ghost" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <UserRound size={15} /> {user.fullName.split(/\s+/).slice(-1)[0]}
      </button>
      {open && (
        <div className="op-acct__menu" role="menu">
          <div className="op-acct__who"><b>{user.fullName}</b><small>{user.email}</small></div>
          {areas.length === 0 && <a role="menuitem" href={homePathFor(user)}>Trang của tôi</a>}
          {areas.map((a) => <a key={a} role="menuitem" href={AREAS[a].home}>Cổng {AREAS[a].title.toLowerCase()}</a>)}
          {!user.roles.includes('OperatorMember') && <a role="menuitem" href="/dang-ky-ho-nuoi">Đăng ký làm người nuôi</a>}
          <button type="button" role="menuitem" onClick={() => { logout(); window.location.href = '/' }}><LogOut size={15} /> Đăng xuất</button>
        </div>
      )}
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="op-foot">
      <div className="op-foot__row">
        <Logo />
        <nav aria-label="Liên kết cuối trang">
          {LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
          <a href="/dang-nhap">Đăng nhập</a>
        </nav>
      </div>
      <p>Đồ án SEP490 · FA26SE229. Góp vốn có rủi ro, nền tảng không cam kết kết quả tài chính.</p>
    </footer>
  )
}

/** Khung trang công khai. narrow: thân trang hẹp cho bài đọc và form. bare: không bọc thân trang (trang tự dàn). */
export default function SiteShell({ children, narrow = false, bare = false }: { children: ReactNode; narrow?: boolean; bare?: boolean }) {
  const { pathname } = useLocation()
  return (
    <Shell theme="mix">
      <header className="rd-top">
        <Logo />
        <nav className="rd-top__nav" aria-label="Điều hướng chính">
          {LINKS.slice(0, 2).map((l) => <a key={l.href} href={l.href} className={pathname.startsWith(l.href) ? 'is-on' : ''}>{l.label}</a>)}
        </nav>
        <div className="rd-top__right"><AccountMenu /></div>
      </header>
      {bare ? children : <main className={`op-page ${narrow ? 'op-page--narrow' : ''}`}>{children}</main>}
      <SiteFooter />
    </Shell>
  )
}

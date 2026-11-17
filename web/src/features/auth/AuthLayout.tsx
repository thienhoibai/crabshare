import { useId, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { SiteFooter } from '../../shared/layout/SiteShell'
import { Logo, Shell } from '../../shared/ui/kit/kit'
import './auth.css'

export default function AuthLayout({ mode, children }: { mode: 'register' | 'login'; children: ReactNode }) {
  const titleId = useId()
  const registering = mode === 'register'
  const title = registering ? 'Đăng ký' : 'Đăng nhập'

  return (
    <Shell theme="dark" className="auth-shell">
      <div className="auth-stage">
        <div className="auth-backdrop" aria-hidden="true">
          <img src="/minhbach/crab-ras.webp" width={1122} height={1402} alt="" fetchPriority="high" />
        </div>
        <header className="auth-top">
          <Logo />
          <Link className="auth-home" to="/"><ArrowLeft size={16} aria-hidden="true" /> Về trang chủ</Link>
        </header>
        <main className="auth-layout">
          <section className="auth-content" aria-labelledby={titleId}>
            <nav className="auth-modes" aria-label="Đăng ký và đăng nhập">
              {registering ? <span aria-current="page">Đăng ký</span> : <Link to="/dang-ky">Đăng ký</Link>}
              {registering ? <Link to="/dang-nhap">Đăng nhập</Link> : <span aria-current="page">Đăng nhập</span>}
            </nav>
            <h1 className="auth-heading rd-h2" id={titleId}>{title}</h1>
            {children}
          </section>
          <p className="auth-caption">
            <strong>Nuôi cua trong hộp</strong>
            <span>Hệ thống lọc nước tuần hoàn (RAS)</span>
          </p>
        </main>
      </div>
      <SiteFooter />
    </Shell>
  )
}

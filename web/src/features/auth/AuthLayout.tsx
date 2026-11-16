import { useId, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { SiteFooter } from '../../shared/layout/SiteShell'
import { Logo, Shell } from '../../shared/ui/kit/kit'
import './auth.css'

export default function AuthLayout({ title, alternate, children }: { title: string; alternate: ReactNode; children: ReactNode }) {
  const titleId = useId()

  return (
    <Shell theme="light" className="auth-shell">
      <header className="auth-top">
        <Logo />
        <Link className="auth-home" to="/"><ArrowLeft size={16} aria-hidden="true" /> Về trang chủ</Link>
      </header>
      <main className="auth-layout">
        <section className="auth-content" aria-labelledby={titleId}>
          <div className="auth-heading">
            <h1 className="rd-h2" id={titleId}>{title}</h1>
            <p>{alternate}</p>
          </div>
          {children}
        </section>
        <figure className="auth-photo">
          <img src="/minhbach/crab-ras.webp" width={1122} height={1402} alt="" decoding="async" />
          <figcaption>
            <strong>Nuôi cua trong hộp</strong>
            <span>Hệ thống lọc nước tuần hoàn (RAS)</span>
          </figcaption>
        </figure>
      </main>
      <SiteFooter />
    </Shell>
  )
}

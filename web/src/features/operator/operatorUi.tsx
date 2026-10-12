import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, Info, X } from 'lucide-react'
import { useModalLock } from '../../shared/ui/kit/kit'
import { IMG, small } from '../../shared/ui/kit/mock-data'

/** Ảnh minh hoạ theo loại cua (chuỗi tiếng Việt hoặc mã crab_type). */
export function crabImg(type: string, w = 240) {
  const t = type.toLowerCase()
  const src = t.includes('gạch') || t.includes('roe') ? IMG.gach
    : t.includes('lột') || t.includes('soft') ? IMG.hop
      : t.includes('cốm') ? IMG.com
        : IMG.thit
  return small(src, w)
}

export type Tone = 'ok' | 'warn' | 'info' | 'mute' | 'gold' | 'danger'

/** Màu chấm theo tone, dùng cho style inline (--tone). */
export const toneVar: Record<Tone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  info: 'var(--info)',
  mute: 'var(--faint)',
  gold: 'var(--accent)',
  danger: 'var(--danger)',
}

export function OpHeading({
  eyebrow,
  title,
  description,
  action,
  crumb,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  crumb?: ReactNode
}) {
  return (
    <header className="op-heading">
      <div>
        {crumb}
        {eyebrow && <p className="rd-eyebrow">{eyebrow}</p>}
        <h1 className="rd-h2">{title}</h1>
        {description && <p className="rd-muted">{description}</p>}
      </div>
      {action && <div className="op-actions">{action}</div>}
    </header>
  )
}

export function OpPanel({
  title,
  subtitle,
  action,
  children,
  accent = false,
  dark = false,
  className = '',
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  accent?: boolean
  dark?: boolean
  className?: string
}) {
  return (
    <section className={`op-panel ${accent ? 'op-panel--accent' : ''} ${dark ? 'op-panel--dark' : ''} ${className}`}>
      {(title || action) && (
        <div className="op-panel__head">
          <div>
            {title && <h2 className="rd-h3">{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function OpBadge({ children, tone = 'mute' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`op-badge op-badge--${tone}`}><i />{children}</span>
}

export function OpBack({ href, children }: { href: string; children: ReactNode }) {
  return <a className="op-back" href={href}>{children}</a>
}

export function OpNote({ children, tone = '', className = '' }: { children: ReactNode; tone?: '' | 'danger' | 'info' | 'ok'; className?: string }) {
  const Icon = tone === 'danger' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : Info
  return (
    <div className={`op-note ${tone} ${className}`}>
      <Icon size={18} />
      <div>{children}</div>
    </div>
  )
}

const BTN: Record<string, string> = {
  primary: 'rd-btn--primary',
  ink: 'rd-btn--dark',
  ghost: 'rd-btn--ghost',
  outline: 'rd-btn--ghost',
  danger: 'op-btn--danger',
}

export function OpBtn({
  variant = 'primary',
  full,
  sm,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ink' | 'ghost' | 'outline' | 'danger'; full?: boolean; sm?: boolean }) {
  return (
    <button
      className={`rd-btn ${BTN[variant]} ${full ? 'rd-btn--block' : ''} ${sm ? 'rd-btn--sm' : ''} ${className}`}
      {...props}
    />
  )
}

/** Thẻ số liệu lớn nền tối. */
export function OpStat({ label, value, unit, sub, children, className = '' }: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={`op-hero ${className}`}>
      <small>{label}</small>
      <b>{value}{unit && <em>{unit}</em>}</b>
      {sub && <p className="op-hero__sub">{sub}</p>}
      {children}
    </section>
  )
}

/** Thanh chia phần + chú thích bên trong OpStat. */
export function OpSplit({ parts }: { parts: { label: string; value: number; display: string; tone: string }[] }) {
  const shown = parts.filter((p) => p.value > 0)
  return (
    <>
      <span className="op-hero__split">{shown.map((p) => <i key={p.label} style={{ flex: p.value, background: p.tone }} title={p.label} />)}</span>
      <ul className="op-hero__legend">{shown.map((p) => <li key={p.label}><i style={{ background: p.tone }} />{p.label}<b>{p.display}</b></li>)}</ul>
    </>
  )
}

export type Fact = { label: string; value: ReactNode; tone?: 'ok' | 'danger' | 'warn' | 'info' }

export function OpFacts({ items }: { items: Fact[] }) {
  return (
    <dl className="op-facts">
      {items.map((f) => (
        <div key={f.label} className={f.tone ? `is-${f.tone}` : ''}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Một hàng danh sách: ảnh/icon · tên · phần giữa · phần cuối · mũi tên. */
export function OpRow({ href, onClick, media, title, sub, mid, end }: {
  href?: string
  onClick?: () => void
  media: ReactNode
  title: ReactNode
  sub?: ReactNode
  mid?: ReactNode
  end?: ReactNode
}) {
  const body = (
    <>
      <span className="op-row__media">{typeof media === 'string' ? <img src={media} alt="" loading="lazy" /> : media}</span>
      <span className="op-row__name"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <span className="op-row__mid">{mid}</span>
      <span className="op-row__end">{end}</span>
      <ChevronRight size={18} />
    </>
  )
  return href
    ? <a className="op-row" href={href}>{body}</a>
    : <button type="button" className="op-row" onClick={onClick}>{body}</button>
}

export type Todo = { title: string; sub: string; href: string; tone?: Tone }

export function OpTodo({ items }: { items: Todo[] }) {
  return (
    <div className="op-todo">
      {items.map((t) => (
        <a key={t.title} href={t.href}>
          <span className="op-dot" style={{ '--tone': toneVar[t.tone ?? 'gold'] } as CSSProperties} />
          <span><b>{t.title}</b><small>{t.sub}</small></span>
          <ChevronRight size={18} />
        </a>
      ))}
    </div>
  )
}

export function OpAside({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <aside className={`op-aside ${className}`}>{children}</aside>
}

export function OpModal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  useModalLock(onClose)
  return (
    <div className="op-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="op-modal__scrim" onClick={onClose} />
      <div className="op-modal__box">
        <div className="op-modal__head">
          <div><h3 className="rd-h3">{title}</h3>{sub && <small>{sub}</small>}</div>
          <button type="button" className="rd-iconbtn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function OpIcon({ children, tone = 'gold', round = false }: { children: ReactNode; tone?: Tone; round?: boolean }) {
  return <span className={`op-icon ${round ? 'op-icon--round' : ''}`} style={{ '--tone': toneVar[tone] } as CSSProperties}>{children}</span>
}

/** Thanh 5 bước vòng đời lô. */
export function OpSteps({ step, total = 5 }: { step: number; total?: number }) {
  return <span className="op-steps" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}>{Array.from({ length: total }, (_, i) => <i key={i} className={i < step ? 'is-on' : ''} />)}</span>
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'

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
        {eyebrow && <p className="op-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="op-desc">{description}</p>}
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
  className = '',
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  accent?: boolean
  className?: string
}) {
  return (
    <section className={`op-panel ${accent ? 'op-panel-accent' : ''} ${className}`}>
      {title && (
        <div className="op-panel-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function OpBadge({ children, tone = 'mute' }: { children: ReactNode; tone?: 'ok' | 'warn' | 'info' | 'mute' | 'gold' | 'danger' }) {
  return <span className={`op-badge op-badge-${tone}`}>{children}</span>
}

export function OpBack({ href, children }: { href: string; children: ReactNode }) {
  return (
    <button type="button" className="op-back" onClick={() => { window.location.href = href }}>
      {children}
    </button>
  )
}

export function OpNote({ children, tone = '', className = '' }: { children: ReactNode; tone?: '' | 'danger' | 'info'; className?: string }) {
  return <div className={`op-note ${tone} ${className}`}>{children}</div>
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
      className={`op-btn op-btn-${variant} ${full ? 'op-btn-full' : ''} ${sm ? 'op-btn-sm' : ''} ${className}`}
      {...props}
    />
  )
}

/* Phần khung của bộ kit .rd: vỏ trang theo chủ đề, logo, thanh tiến độ và hai hook dùng chung.
   Thành phần của khu điều hành nằm ở shared/ui/console. Kiểu ở kit.css. */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import './kit.css'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/* ---------- khung ---------- */
export type Theme = 'dark' | 'light' | 'mix'
export function Shell({ theme, children, className = '' }: { theme: Theme; children: ReactNode; className?: string }) {
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = theme === 'dark' ? '#070908' : theme === 'mix' ? '#eeebe4' : '#f4f1ea'
    return () => { document.body.style.background = prev }
  }, [theme])
  return <div className={`rd rd--${theme} ${className}`}>{children}</div>
}

export function Logo({ href = '/' }: { href?: string }) {
  return <a className="rd-logo" href={href}><span className="rd-logo__mark" aria-hidden="true" />crabshare</a>
}

/* ---------- mảnh nhỏ ---------- */
export function Bar({ value, max, tone }: { value: number; max: number; tone?: string }) {
  return (
    <span className="rd-bar" style={tone ? ({ '--tone': tone } as CSSProperties) : undefined}>
      <i style={{ width: `${clamp((value / max) * 100, 0, 100)}%` }} />
    </span>
  )
}

/** Đếm ngược tới một mốc thời gian (ms). Hạn ngắn hiện mm:ss; hạn dài hiện ngày, giờ, phút. */
export function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [until])
  const left = until ? Math.max(0, until - now) : 0
  const d = Math.floor(left / 86_400_000)
  const h = Math.floor((left % 86_400_000) / 3_600_000)
  const m = Math.floor((left % 3_600_000) / 60000)
  const s = Math.floor((left % 60000) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const text = d > 0 ? `${d} ngày ${h} giờ` : h > 0 ? `${h} giờ ${pad(m)} phút` : `${pad(m)}:${pad(s)}`
  return { left, text }
}

/** Khoá cuộn trang và đóng bằng phím Esc khi một hộp thoại đang mở. */
export function useModalLock(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', k)
      document.body.style.overflow = prev
    }
  }, [onClose])
}

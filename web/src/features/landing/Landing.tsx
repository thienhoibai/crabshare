/* Bản E — tự do thiết kế.
   Hero WebGL gợn nước theo chuột · chữ đổi độ đậm theo khoảng cách con trỏ · dòng nước chữ trôi trên sóng
   · thư viện kéo vô hạn nhiều lô · đèn soi truy xuất · kéo doanh thu để chia · món cua hiện ảnh lớn · nút nam châm. */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import './landing.css'
import HeroGL from './HeroGL'
import Cursor from './Cursor'
import { exampleContributions, formatPct, formatVND, settle } from './settlement'

/* ---------- ảnh: cua sống của nhóm + món cua từ Pexels (dùng tạm qua CDN) ---------- */
const px = (id: string, w = 1200, file?: string) =>
  `https://images.pexels.com/photos/${id}/${file ?? `pexels-photo-${id}.jpeg`}?auto=compress&cs=tinysrgb&w=${w}`

const IMG = {
  hero: '/minhbach/cua-gach-card.jpg',
  thit: '/minhbach/cua-thit-card.jpg',
  hop: '/minhbach/cua-hop-card.jpg',
  com: '/minhbach/cua-com-card.jpg',
  qr: '/minhbach/truy-xuat.png',
  tied: px('38549558', 1920),
  steamer: px('34618081'),
  chili: px('8995869'),
  sauce: px('20943894'),
  claws: px('12918202'),
  pot: px('24186313', 1200, 'pexels-photo-24186313/free-photo-of-crab-served-on-pan.jpeg'),
  mangroveBoat: px('14021567'),
  mangroveAerial: px('29137616', 1200, 'pexels-photo-29137616/free-photo-of-aerial-view-of-lush-green-mangrove-river.jpeg'),
  mangroveSunset: px('13189031'),
  mangroveWater: px('29865226', 1200, 'pexels-photo-29865226/free-photo-of-lush-mangrove-forest-with-serene-waterway.jpeg'),
  sorter: px('23938824', 1200, 'pexels-photo-23938824/free-photo-of-woman-in-hat-working.jpeg'),
  handPick: px('8940060'),
  monoBox: px('3947295'),
  steamerLeaves: px('34618069', 1200, 'pexels-photo-34618069/free-photo-of-steamed-crab-in-bamboo-basket-surrounded-by-leaves.jpeg'),
  sauce2: px('20943890'),
  curry: px('4869432'),
  kingChili: px('775863'),
  stacked: px('10432704'),
  serving: px('10432640'),
  chefPlate: px('10432634'),
  steamLegs: px('10346452'),
  market: px('8352010'),
  onIce: px('18092324', 1200, 'pexels-photo-18092324/free-photo-of-crabs-in-a-store.jpeg'),
  bound: px('10432611'),
}

/* ---------- tiện ích ---------- */
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const matches = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches
const isFine = () => matches('(hover: hover) and (pointer: fine)')
const isReduced = () => matches('(prefers-reduced-motion: reduce)')

function watchVisible(el: Element, cb: (visible: boolean) => void) {
  const io = new IntersectionObserver(([e]) => cb(e.isIntersecting), { rootMargin: '120px 0px' })
  io.observe(el)
  return () => io.disconnect()
}

function useTween(target: number, ms = 650) {
  const [value, setValue] = useState(target)
  const cur = useRef(target)
  useEffect(() => {
    if (isReduced()) {
      cur.current = target
      setValue(target)
      return
    }
    const from = cur.current
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      cur.current = from + (target - from) * (1 - Math.pow(1 - k, 3))
      setValue(cur.current)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.classList.add('is-in')
        io.disconnect()
      }
    }, { rootMargin: '0px 0px -12% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

const trieu = (v: number) => (v / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const signed = (n: number) => {
  const r = Math.round(n)
  return (r > 0 ? '+' : r < 0 ? '−' : '') + formatVND(Math.abs(r))
}

/* ---------- mảnh nhỏ ---------- */
const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
)
const QrIcon = () => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
    <path d="M2 2h9v9H2zm2 2v5h5V4zm13-2h9v9h-9zm2 2v5h5V4zM2 17h9v9H2zm2 2v5h5v-5zM5 5h3v3H5zm15 0h3v3h-3zM5 20h3v3H5zm12-3h3v3h-3zm3 3h3v3h-3zm3-3h3v3h-3zm-6 6h3v3h-3zm6 0h3v3h-3z" />
  </svg>
)
const Roll = ({ text }: { text: string }) => (
  <span className="cse-roll"><span data-text={text}>{text}</span></span>
)

function Ring({ pct, size = 54 }: { pct: number; size?: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <svg className="cse-ring" width={size} height={size} viewBox="0 0 54 54" aria-hidden="true">
      <circle cx="27" cy="27" r={r} fill="none" stroke="rgba(243,239,231,.14)" strokeWidth="4" />
      <circle className="cse-ring__bar" cx="27" cy="27" r={r} fill="none" stroke="url(#cse-grad)" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 27 27)" />
      <text x="27" y="31" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{pct}%</text>
    </svg>
  )
}

/** Nam châm: phần tử con bị hút về phía con trỏ, thả ra thì nảy về. */
function Magnetic({ children, strength = 0.3, area = false }: { children: ReactNode; strength?: number; area?: boolean }) {
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const w = wrap.current
    const target = w?.firstElementChild as HTMLElement | null
    if (!w || !target || !isFine() || isReduced()) return
    const inner = target.querySelector<HTMLElement>('[data-magnet-inner]')
    const move = (e: PointerEvent) => {
      const r = w.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      target.style.transition = 'transform .25s cubic-bezier(.22,1,.36,1), scale .6s cubic-bezier(.22,1,.36,1)'
      target.style.transform = `translate3d(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px, 0)`
      if (inner) {
        inner.style.transition = 'transform .25s cubic-bezier(.22,1,.36,1)'
        inner.style.transform = `translate3d(${(dx * strength * 0.5).toFixed(1)}px, ${(dy * strength * 0.5).toFixed(1)}px, 0)`
      }
    }
    const leave = () => {
      target.style.transition = 'transform .9s cubic-bezier(.2,1.8,.4,1), scale .6s cubic-bezier(.22,1,.36,1)'
      target.style.transform = ''
      if (inner) {
        inner.style.transition = 'transform .9s cubic-bezier(.2,1.8,.4,1)'
        inner.style.transform = ''
      }
    }
    w.addEventListener('pointermove', move)
    w.addEventListener('pointerleave', leave)
    return () => {
      w.removeEventListener('pointermove', move)
      w.removeEventListener('pointerleave', leave)
    }
  }, [strength])
  return <span ref={wrap} className={area ? 'cse-magnet cse-magnet--area' : 'cse-magnet'}>{children}</span>
}

/* ---------- intro ---------- */
function Intro({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [n, setN] = useState(0)
  const [out, setOut] = useState(false)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1200)
      setN(Math.round((1 - (1 - k) * (1 - k)) * 100))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  useEffect(() => {
    if (out || n < 100 || !ready) return
    const t = window.setTimeout(() => {
      setOut(true)
      onDone()
    }, 180)
    return () => window.clearTimeout(t)
  }, [n, ready, out, onDone])
  return (
    <div className={`cse-intro ${out ? 'is-out' : ''}`} style={{ '--p': n / 100 } as CSSProperties} aria-hidden="true">
      <span className="cse-intro__word">crabshare</span>
      <div className="cse-intro__bottom">
        <span className="cse-intro__meta">Cà Mau · 2026</span>
        <span className="cse-intro__count">{String(n).padStart(3, '0')}</span>
      </div>
      <span className="cse-intro__bar" />
    </div>
  )
}

/* ---------- nav ---------- */
function Nav() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const on = () => {
      const y = window.scrollY
      if (Math.abs(y - last) < 8) return
      setHidden(y > last && y > 200)
      last = y
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={`cse-nav ${hidden ? 'is-hidden' : ''}`}>
      <a className="cse-logo" href="#top" aria-label="CrabShare, về đầu trang">
        <span className="cse-logo__mark" aria-hidden="true" />
        crabshare
      </a>
      <nav className="cse-nav__links" aria-label="Mục trên trang">
        <a href="#keo">Khám phá</a>
        <a href="#soi">Truy xuất</a>
        <a href="#chia">Quyết toán</a>
        <a href="#mua">Món cua</a>
      </nav>
      <div className="cse-nav__right">
        <a className="cse-nav__login" href="/dang-nhap">Đăng nhập</a>
        <Magnetic strength={0.25}>
          <a className="cse-btn cse-btn--primary cse-btn--sm" href="/investor"><Roll text="Góp vốn" /></a>
        </Magnetic>
      </div>
    </header>
  )
}

/* ---------- hero ---------- */
type Seg = { t: string; accent?: boolean }

/** Tiêu đề chữ biến thiên: chữ gần con trỏ đậm lên và hẹp lại. */
function ProximityTitle({ lines }: { lines: Seg[][] }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !isFine() || isReduced()) return
    const chars = Array.from(el.querySelectorAll<HTMLElement>('.cse-ch'))
    const accent = chars.map((c) => c.classList.contains('is-accent'))
    const cur = new Float32Array(chars.length)
    let centers: { x: number; y: number }[] = []
    let R = 240
    const measure = () => {
      R = (parseFloat(getComputedStyle(el).fontSize) || 120) * 1.9
      centers = chars.map((c) => {
        const p = c.offsetParent as HTMLElement | null
        const pr = p ? p.getBoundingClientRect() : { left: 0, top: 0 }
        return { x: pr.left + window.scrollX + c.offsetLeft + c.offsetWidth / 2, y: pr.top + window.scrollY + c.offsetTop + c.offsetHeight / 2 }
      })
    }
    measure()
    document.fonts?.ready.then(measure)
    let cx = -1e5, cy = -1e5, raf = 0, visible = true
    const onMove = (e: PointerEvent) => { cx = e.clientX; cy = e.clientY }
    const loop = () => {
      raf = 0
      const mx = cx + window.scrollX
      const my = cy + window.scrollY
      for (let i = 0; i < chars.length; i++) {
        const c = centers[i]
        if (!c) continue
        let t = 1 - Math.hypot(mx - c.x, (my - c.y) * 1.25) / R
        t = t < 0 ? 0 : t * t * (3 - 2 * t)
        const v = cur[i] + (t - cur[i]) * 0.14
        if (Math.abs(v - cur[i]) > 0.0015) {
          cur[i] = v
          chars[i].style.fontVariationSettings = accent[i]
            ? `'wght' ${Math.round(300 + v * 450)}, 'opsz' 144`
            : `'wght' ${Math.round(380 + v * 420)}, 'wdth' ${Math.round(100 - v * 22)}, 'opsz' 96`
        }
      }
      if (visible) raf = requestAnimationFrame(loop)
    }
    const stop = watchVisible(el, (v) => {
      visible = v
      if (v && !raf) raf = requestAnimationFrame(loop)
    })
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      stop()
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('resize', measure)
    }
  }, [])

  let idx = 0
  return (
    <h1 ref={ref} className="cse-title" aria-label={lines.map((l) => l.map((s) => s.t).join('')).join(' ')}>
      {lines.map((segs, li) => (
        <span className="cse-title__line" key={li} aria-hidden="true">
          {segs.map((s, si) =>
            s.t.split(/(\s+)/).map((word, wi) => {
              if (!word) return null
              if (/^\s+$/.test(word)) return <span key={`${si}-${wi}`}> </span>
              return (
                <span className="cse-word" key={`${si}-${wi}`}>
                  {Array.from(word.normalize('NFC')).map((ch, ci) => (
                    <span key={ci} className={`cse-ch${s.accent ? ' is-accent' : ''}`} style={{ '--i': idx++ } as CSSProperties}>{ch}</span>
                  ))}
                </span>
              )
            }),
          )}
        </span>
      ))}
    </h1>
  )
}

function BatchCard() {
  const ref = useRef<HTMLAnchorElement>(null)
  const onMove = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    const el = ref.current
    if (!el || isReduced()) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${((x - 0.5) * 16).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`)
  }
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--rx', '0deg')
  }
  return (
    <a ref={ref} className="cse-card" href="/investor" onPointerMove={onMove} onPointerLeave={onLeave}>
      <Ring pct={84} />
      <span className="cse-card__text">
        <span className="cse-card__code">L2612-01 · Cua thịt</span>
        <span className="cse-card__meta">Đang gọi vốn · còn 5 ngày</span>
      </span>
      <span className="cse-card__arrow"><Arrow /></span>
    </a>
  )
}

function Hero({ onReady }: { onReady: () => void }) {
  return (
    <section id="top" className="cse-hero" aria-label="Giới thiệu">
      <HeroGL src={IMG.hero} onReady={onReady} />
      <div className="cse-hero__shade" aria-hidden="true" />
      <div className="cse-hero__content">
        <div className="cse-hero__top">
          <p className="cse-eyebrow cse-fade" style={{ '--d': '150ms' } as CSSProperties}>
            <span className="cse-eyebrow__dot" aria-hidden="true" />
            Cà Mau · 09°10′N 105°09′E
          </p>
          <div className="cse-fade" style={{ '--d': '650ms' } as CSSProperties}><BatchCard /></div>
        </div>
        <ProximityTitle lines={[[{ t: 'Góp vốn.' }], [{ t: 'Nuôi cua.' }], [{ t: 'Chia ' }, { t: 'từng đồng.', accent: true }]]} />
        <div className="cse-hero__row cse-fade" style={{ '--d': '950ms' } as CSSProperties}>
          <div className="cse-hero__ctas">
            <Magnetic>
              <a className="cse-btn cse-btn--primary" href="/investor"><Roll text="Góp vốn" /><span className="cse-btn__icon"><Arrow /></span></a>
            </Magnetic>
            <Magnetic>
              <a className="cse-btn cse-btn--glass" href="#mua"><Roll text="Mua cua" /></a>
            </Magnetic>
          </div>
          <a className="cse-scroll" href="#keo"><span className="cse-scroll__line" aria-hidden="true" />Cuộn</a>
        </div>
      </div>
    </section>
  )
}

/* ---------- dòng nước chảy: chữ trôi trên mặt sóng, rê chuột nước dâng, nhấp tạo gợn ---------- */
const RIVER_WORDS = ['Minh bạch', 'Truy xuất', 'Từng đồng', 'Cà Mau', 'Hộp RAS', 'Mã QR']
const RIVER_REPS = 3
const RINGS = 8
const BUBBLES = 16
const NB = ' '

function riverWords(prefix: string) {
  return RIVER_WORDS.flatMap((w, i) => [
    <tspan key={`${prefix}w${i}`} className={i % 2 ? 'is-outline' : undefined}>{w}</tspan>,
    <tspan key={`${prefix}s${i}`} className="is-star">{`${NB}${NB}✦${NB}${NB}`}</tspan>,
  ])
}

/** Đường cong mượt (Catmull-Rom) qua các điểm cách đều theo trục x. */
function curve(ys: ArrayLike<number>, x0: number, step: number, dy = 0) {
  const n = ys.length
  let d = `M${x0.toFixed(1)},${(ys[0] + dy).toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const y0 = ys[i > 0 ? i - 1 : 0] + dy
    const y1 = ys[i] + dy
    const y2 = ys[i + 1] + dy
    const y3 = ys[i + 2 < n ? i + 2 : n - 1] + dy
    const xa = x0 + i * step
    d += `C${(xa + step / 3).toFixed(1)},${(y1 + (y2 - y0) / 6).toFixed(1)} ${(xa + (2 * step) / 3).toFixed(1)},${(y2 - (y3 - y1) / 6).toFixed(1)} ${(xa + step).toFixed(1)},${y2.toFixed(1)}`
  }
  return d
}

function River() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const surfRef = useRef<SVGPathElement>(null)
  const tpRef = useRef<SVGTextPathElement>(null)
  const measRef = useRef<SVGTextElement>(null)
  const backRef = useRef<SVGPathElement>(null)
  const frontRef = useRef<SVGPathElement>(null)
  const glossRef = useRef<SVGPathElement>(null)
  const reflRef = useRef<SVGGElement>(null)
  const maskRef = useRef<SVGRectElement>(null)
  const lineEls = useRef<(SVGPathElement | null)[]>([])
  const ringEls = useRef<(SVGEllipseElement | null)[]>([])
  const bubEls = useRef<(SVGCircleElement | null)[]>([])

  useEffect(() => {
    const wrap = wrapRef.current
    const svg = svgRef.current
    const surfEl = surfRef.current
    const tp = tpRef.current
    const meas = measRef.current
    const back = backRef.current
    const front = frontRef.current
    const gloss = glossRef.current
    const refl = reflRef.current
    const maskRect = maskRef.current
    if (!wrap || !svg || !surfEl || !tp || !meas || !back || !front || !gloss || !refl || !maskRect) return
    const reduced = isReduced()
    const STEP = 24
    const X0 = -120
    let W = 1, H = 1, fs = 80, base = 0, sink = 16, seq = 1600, n = 2, k1 = 0.01, k2 = 0.03
    let ys = new Float32Array(2)
    let bys = new Float32Array(2)
    let lys = new Float32Array(2)
    let offset = 0, raf = 0, visible = false, last = performance.now()
    let mx = -1e4, bump = 0, tbump = 0, lastY = window.scrollY, vel = 0, dir = -1
    let lastInput = -1e9, nextDrop = 0, wakeX = -1e4, wakeT = 0, ringIdx = 0
    const waves: { x: number; t: number; a: number }[] = []
    const rings = Array.from({ length: RINGS }, () => ({ x: 0, t: -1e9, s: 1 }))
    const bubbles = Array.from({ length: BUBBLES }, () => ({ x: Math.random(), p: Math.random(), s: 0.1 + Math.random() * 0.22, ph: Math.random() * 6.28 }))

    /** Độ cao mặt nước tại x: hai lớp sóng + chỗ nước dâng dưới con trỏ + các gợn lan ra. */
    const surf = (x: number, t: number) => {
      let y = base + H * 0.075 * Math.sin(x * k1 - t * 0.9) + H * 0.03 * Math.sin(x * k2 + t * 1.6 + 1.3)
      if (bump > 0.5) {
        const d = x - mx
        y -= bump * Math.exp(-(d * d) / 24200)
      }
      for (const w of waves) {
        const age = t - w.t
        if (age < 0 || age > 3) continue
        const e = Math.abs(x - w.x) - age * 380
        y += w.a * Math.exp(-age * 1.2) * Math.sin(e * 0.05) * Math.exp(-(e * e) / 12800)
      }
      return y
    }
    const ring = (x: number, s: number, now: number) => {
      const r = rings[ringIdx++ % RINGS]
      r.x = x
      r.t = now
      r.s = s
    }
    const splash = (x: number, a: number, now: number) => {
      waves.push({ x, t: now / 1000, a })
      if (waves.length > 6) waves.shift()
      ring(x, 1, now)
    }

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = reduced ? 0 : now / 1000
      const sy = window.scrollY
      const dy = sy - lastY
      lastY = sy
      vel += (dy - vel) * 0.12
      if (dy > 1) dir = -1
      else if (dy < -1) dir = 1
      if (!reduced) {
        offset += dir * (60 + Math.min(Math.abs(vel) * 28, 900)) * dt
        if (offset <= -seq) offset += seq
        if (offset > 0) offset -= seq
        if (now > nextDrop && now - lastInput > 3500) {
          splash(Math.random() * W, H * 0.03, now)
          nextDrop = now + 2400 + Math.random() * 2400
        }
      }
      bump += (tbump - bump) * 0.07
      for (let i = 0; i < n; i++) ys[i] = surf(X0 + i * STEP, t)
      surfEl.setAttribute('d', curve(ys, X0, STEP))
      tp.setAttribute('startOffset', offset.toFixed(1))
      const frontD = curve(ys, X0, STEP, sink)
      gloss.setAttribute('d', frontD)
      front.setAttribute('d', `${frontD}L${W - X0},${H}L${X0},${H}Z`)
      for (let i = 0; i < n; i++) {
        const x = X0 + i * STEP
        bys[i] = base - H * 0.17 + H * 0.035 * Math.sin(x * k2 * 0.6 + t * 1.1 + 2) + H * 0.025 * Math.sin(x * k1 * 1.3 - t * 0.5)
      }
      back.setAttribute('d', `${curve(bys, X0, STEP)}L${W - X0},${H}L${X0},${H}Z`)
      for (let j = 0; j < lineEls.current.length; j++) {
        const el = lineEls.current[j]
        if (!el) continue
        const depth = sink + fs * 0.34 + j * H * 0.085
        for (let i = 0; i < n; i++) lys[i] = ys[i] + depth + H * 0.012 * Math.sin((X0 + i * STEP) * 0.018 + t * (1.4 + j * 0.3) + j)
        el.setAttribute('d', curve(lys, X0, STEP))
      }
      for (let j = 0; j < RINGS; j++) {
        const el = ringEls.current[j]
        if (!el) continue
        const r = rings[j]
        const age = (now - r.t) / 1000
        if (age > 1.9) {
          if (el.style.opacity !== '0') el.style.opacity = '0'
          continue
        }
        const k = age / 1.9
        const rx = 10 + (1 - (1 - k) * (1 - k)) * 230 * r.s
        el.setAttribute('cx', r.x.toFixed(1))
        el.setAttribute('cy', (surf(r.x, t) + sink).toFixed(1))
        el.setAttribute('rx', rx.toFixed(1))
        el.setAttribute('ry', (rx * 0.17).toFixed(1))
        el.style.opacity = ((1 - k) * 0.85).toFixed(2)
      }
      for (let j = 0; j < BUBBLES; j++) {
        const el = bubEls.current[j]
        if (!el) continue
        const b = bubbles[j]
        if (!reduced) b.p -= b.s * dt
        if (b.p < 0) {
          b.p = 1
          b.x = Math.random()
        }
        const bx = b.x * W + Math.sin(t * 1.6 + b.ph) * 5
        const topY = surf(bx, t) + sink + 6
        el.setAttribute('cx', bx.toFixed(1))
        el.setAttribute('cy', (topY + b.p * (H - topY)).toFixed(1))
        el.style.opacity = (Math.min(1, b.p * 4) * Math.min(1, (1 - b.p) * 6) * 0.6).toFixed(2)
      }
    }

    const measure = () => {
      W = Math.max(1, wrap.clientWidth)
      H = Math.round(clamp(W * 0.21, 210, 340))
      fs = Math.round(clamp(W * 0.066, 46, 112))
      base = H * 0.5
      sink = fs * 0.2
      k1 = (Math.PI * 2) / (W * 0.8)
      k2 = (Math.PI * 2) / Math.max(180, W * 0.23)
      n = Math.ceil((W - X0 * 2) / STEP) + 1
      ys = new Float32Array(n)
      bys = new Float32Array(n)
      lys = new Float32Array(n)
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
      svg.style.height = `${H}px`
      wrap.style.setProperty('--fs', `${fs}px`)
      const len = meas.getComputedTextLength()
      if (len > 0) seq = len
      refl.setAttribute('transform', `matrix(1 0 0 -1 0 ${(2 * (base + sink)).toFixed(1)})`)
      maskRect.setAttribute('y', (base + sink).toFixed(1))
      maskRect.setAttribute('height', Math.max(1, H - base - sink).toFixed(1))
      maskRect.setAttribute('width', String(W - X0 * 2))
      if (reduced) draw(performance.now())
    }

    const frame = (now: number) => {
      raf = 0
      draw(now)
      if (visible) raf = requestAnimationFrame(frame)
    }
    const toX = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect()
      return ((e.clientX - r.left) / Math.max(1, r.width)) * W
    }
    const onMove = (e: PointerEvent) => {
      const x = toX(e)
      const now = performance.now()
      mx = x
      tbump = H * 0.1
      lastInput = now
      if (Math.abs(x - wakeX) > 120 && now - wakeT > 180) {
        ring(x, 0.45, now)
        wakeX = x
        wakeT = now
      }
    }
    const onLeave = () => { tbump = 0 }
    const onDown = (e: PointerEvent) => {
      const now = performance.now()
      splash(toX(e), H * 0.07, now)
      lastInput = now
      wrap.classList.add('is-touched')
    }

    measure()
    document.fonts?.ready.then(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerleave', onLeave)
    wrap.addEventListener('pointerdown', onDown)
    const stop = reduced
      ? () => {}
      : watchVisible(wrap, (v) => {
          visible = v
          if (v && !raf) {
            last = performance.now()
            lastY = window.scrollY
            raf = requestAnimationFrame(frame)
          }
        })
    return () => {
      stop()
      cancelAnimationFrame(raf)
      ro.disconnect()
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerleave', onLeave)
      wrap.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return (
    <div ref={wrapRef} className="cse-river">
      <svg ref={svgRef} className="cse-river__svg" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="cse-rv-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34968a" stopOpacity="0.18" />
            <stop offset="1" stopColor="#34968a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cse-rv-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0f302b" stopOpacity="0.66" />
            <stop offset="0.55" stopColor="#08140f" stopOpacity="0.93" />
            <stop offset="1" stopColor="#070908" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="cse-rv-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="cse-rv-mask" maskUnits="userSpaceOnUse" x="-400" y="-400" width="6000" height="1400">
            <rect ref={maskRef} x="-120" y="130" width="1680" height="130" fill="url(#cse-rv-fade)" />
          </mask>
          <filter id="cse-rv-wobble" x="-5%" y="-40%" width="110%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.09" numOctaves="2" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <path ref={surfRef} id="cse-rv-surface" d="M-120,130L1560,130" />
        </defs>
        <path ref={backRef} className="cse-river__back" d="M0,0" />
        <text id="cse-rv-text" className="cse-river__text">
          <textPath ref={tpRef} href="#cse-rv-surface" startOffset="0">
            {Array.from({ length: RIVER_REPS }, (_, r) => riverWords(`r${r}`))}
          </textPath>
        </text>
        <path ref={frontRef} className="cse-river__front" d="M0,0" />
        <g mask="url(#cse-rv-mask)">
          <g ref={reflRef} className="cse-river__refl"><use href="#cse-rv-text" /></g>
        </g>
        <path ref={glossRef} className="cse-river__gloss" d="M0,0" />
        {[0, 1, 2].map((j) => (
          <path key={j} ref={(el) => { lineEls.current[j] = el }} className="cse-river__line" d="M0,0" />
        ))}
        {Array.from({ length: RINGS }, (_, j) => (
          <ellipse key={j} ref={(el) => { ringEls.current[j] = el }} className="cse-river__ring" cx="0" cy="0" rx="0" ry="0" style={{ opacity: 0 }} />
        ))}
        {Array.from({ length: BUBBLES }, (_, j) => (
          <circle key={j} ref={(el) => { bubEls.current[j] = el }} className="cse-river__bubble" cx="0" cy="0" r={1.4 + (j % 4) * 0.7} style={{ opacity: 0 }} />
        ))}
        <text ref={measRef} className="cse-river__text" x="0" y="-400" visibility="hidden">{riverWords('m')}</text>
      </svg>
      <p className="cse-river__hint" aria-hidden="true">Chạm vào mặt nước</p>
    </div>
  )
}

/* ---------- thư viện kéo vô hạn: nhiều lô, nhiều ảnh, xếp so le ---------- */
type ImgTile = { kind: 'img'; src: string; label: string }
type StatTile = { kind: 'stat'; big: string; small: string; tone: 'grad' | 'glass' | 'cream' | 'teal' }
type LotStage = 'funding' | 'growing' | 'harvest' | 'settle' | 'soon' | 'closed'
type LotTile = { kind: 'lot'; code: string; crab: string; src: string; stage: LotStage; pct: number; meta: string }
type Tile = ImgTile | StatTile | LotTile

const STAGE: Record<LotStage, { label: string; tone: string }> = {
  funding: { label: 'Đang gọi vốn', tone: '#7ee2a8' },
  growing: { label: 'Đang nuôi', tone: '#6fc8ff' },
  harvest: { label: 'Đang thu hoạch', tone: '#ffcf5a' },
  settle: { label: 'Đang quyết toán', tone: '#ff8a4c' },
  soon: { label: 'Sắp mở', tone: '#c9c3b8' },
  closed: { label: 'Đã chia xong', tone: '#8a857c' },
}
/** Ảnh trong thư viện chỉ cần bản nhỏ hơn. */
const sm = (src: string) => (src.startsWith('http') ? src.replace(/w=\d+/, 'w=720') : src)

const LOTS: LotTile[] = [
  { kind: 'lot', code: 'L2612-01', crab: 'Cua thịt · 500 ô', src: IMG.thit, stage: 'funding', pct: 84, meta: 'còn 5 ngày' },
  { kind: 'lot', code: 'L2611-02', crab: 'Cua lột · 300 ô', src: IMG.hop, stage: 'funding', pct: 63, meta: 'còn 12 ngày' },
  { kind: 'lot', code: 'L2612-02', crab: 'Cua gạch · 400 ô', src: IMG.com, stage: 'growing', pct: 57, meta: 'ngày 34 / 60' },
  { kind: 'lot', code: 'L2701-01', crab: 'Cua thịt · 500 ô', src: IMG.handPick, stage: 'harvest', pct: 82, meta: '412 / 500 con' },
  { kind: 'lot', code: 'L2611-01', crab: 'Cua thịt · 500 ô', src: IMG.tied, stage: 'settle', pct: 100, meta: 'Pool +26 triệu' },
  { kind: 'lot', code: 'L2612-03', crab: 'Cua cốm · 400 ô', src: IMG.mangroveWater, stage: 'soon', pct: 0, meta: 'mở sau 20 ngày' },
  { kind: 'lot', code: 'L2610-03', crab: 'Cua gạch · 300 ô', src: IMG.monoBox, stage: 'closed', pct: 100, meta: 'đã chia 100%' },
]
const STATS: StatTile[] = [
  { kind: 'stat', big: '0đ', small: 'CrabShare không giữ tiền của bạn', tone: 'grad' },
  { kind: 'stat', big: '7%', small: 'Người nuôi nhận, chỉ khi có lãi', tone: 'glass' },
  { kind: 'stat', big: 'QR', small: 'Mỗi con cua một mã', tone: 'cream' },
  { kind: 'stat', big: '80%', small: 'Lô chỉ chạy khi đủ vốn tối thiểu', tone: 'teal' },
  { kind: 'stat', big: '48h', small: 'Nộp bằng chứng trước đợt giải ngân sau', tone: 'glass' },
  { kind: 'stat', big: '15ph', small: 'Giữ chỗ khi bạn bấm góp vốn', tone: 'grad' },
]
const PICS: ImgTile[] = [
  { kind: 'img', src: IMG.mangroveBoat, label: 'Rừng đước' },
  { kind: 'img', src: IMG.steamer, label: 'Cua hấp' },
  { kind: 'img', src: IMG.sorter, label: 'Phân loại' },
  { kind: 'img', src: IMG.chili, label: 'Cua sốt ớt' },
  { kind: 'img', src: IMG.hero, label: 'Cua gạch' },
  { kind: 'img', src: IMG.mangroveAerial, label: 'Sông giữa rừng' },
  { kind: 'img', src: IMG.claws, label: 'Càng cua' },
  { kind: 'img', src: IMG.curry, label: 'Cua cà ri' },
  { kind: 'img', src: IMG.market, label: 'Chợ cua' },
  { kind: 'img', src: IMG.steamerLeaves, label: 'Xửng hấp' },
  { kind: 'img', src: IMG.qr, label: 'Quét mã' },
  { kind: 'img', src: IMG.sauce2, label: 'Cua sốt' },
  { kind: 'img', src: IMG.mangroveSunset, label: 'Hoàng hôn' },
  { kind: 'img', src: IMG.kingChili, label: 'Càng sốt cay' },
  { kind: 'img', src: IMG.serving, label: 'Lên đĩa' },
  { kind: 'img', src: IMG.bound, label: 'Buộc càng' },
  { kind: 'img', src: IMG.pot, label: 'Lẩu cua' },
  { kind: 'img', src: IMG.stacked, label: 'Cua luộc' },
  { kind: 'img', src: IMG.onIce, label: 'Ướp đá' },
  { kind: 'img', src: IMG.steamLegs, label: 'Hấp nóng' },
  { kind: 'img', src: IMG.chefPlate, label: 'Ra bếp' },
  { kind: 'img', src: IMG.sauce, label: 'Nước sốt' },
]
const pic = (i: number) => PICS[i % PICS.length]
/* 6 hàng × 7 cột: mỗi hàng có một lô và một con số, còn lại là ảnh */
const GRID: Tile[] = [
  pic(0), LOTS[0], pic(1), STATS[0], pic(2), pic(3), pic(4),
  STATS[1], pic(5), pic(6), pic(7), LOTS[1], pic(8), pic(9),
  pic(10), pic(11), LOTS[2], pic(12), pic(13), STATS[2], pic(14),
  pic(15), STATS[3], pic(16), pic(17), pic(18), pic(19), LOTS[3],
  LOTS[4], pic(20), pic(21), STATS[4], pic(22), LOTS[5], pic(23),
  pic(24), pic(25), STATS[5], pic(26), LOTS[6], pic(27), pic(28),
]
const COLS = 7
const COL_SHIFT = [0, 0.42, 0.12, 0.6, 0.26, 0.5, 0.08]
const PIC_H = [1.22, 0.92, 1.5, 1.08, 1.34, 0.86]
const tileH = (t: Tile, i: number) => (t.kind === 'lot' ? 1.42 : t.kind === 'stat' ? 1.02 : PIC_H[i % PIC_H.length])

function Gallery() {
  const secRef = useRef<HTMLElement>(null)
  const tileEls = useRef<(HTMLElement | null)[]>([])
  const imgEls = useRef<(HTMLImageElement | null)[]>([])

  useEffect(() => {
    const sec = secRef.current
    if (!sec) return
    const reduced = isReduced()
    const N = GRID.length
    const bx = new Float32Array(N)
    const by = new Float32Array(N)
    const hh = new Float32Array(N)
    const hc = new Float32Array(N)
    let cw = 280, gap = 16, W = 1, avgH = 1
    const measure = () => {
      const vw = window.innerWidth
      cw = Math.round(clamp(vw * 0.22, 200, 460))
      gap = Math.round(clamp(vw * 0.014, 12, 20))
      sec.style.setProperty('--cw', `${cw}px`)
      W = COLS * (cw + gap)
      const acc = new Array<number>(COLS).fill(0)
      for (let i = 0; i < N; i++) {
        const c = i % COLS
        const h = Math.round(cw * tileH(GRID[i], i))
        bx[i] = c * (cw + gap)
        by[i] = acc[c] + COL_SHIFT[c] * cw
        hh[i] = h
        acc[c] += h + gap
        const el = tileEls.current[i]
        if (el) el.style.height = `${h}px`
      }
      for (let i = 0; i < N; i++) hc[i] = acc[i % COLS]
      avgH = acc.reduce((s, v) => s + v, 0) / COLS
    }
    measure()
    let ox = -(W - sec.clientWidth) / 2
    let oy = -(avgH - sec.clientHeight) / 2
    let vx = 0, vy = 0, lx = 0, ly = 0, lt = 0, moved = 0
    let down = false, dragging = false, raf = 0, visible = false
    const mod = (a: number, m: number) => ((a % m) + m) % m
    const render = () => {
      const hx = clamp(-vx * 1.4, -28, 28).toFixed(1)
      const hy = clamp(-vy * 1.4, -28, 28).toFixed(1)
      for (let i = 0; i < N; i++) {
        const el = tileEls.current[i]
        if (!el) continue
        const x = mod(bx[i] + ox + cw, W) - cw
        const y = mod(by[i] + oy + hh[i], hc[i]) - hh[i]
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        const im = imgEls.current[i]
        if (im) im.style.transform = `translate3d(${hx}px, ${hy}px, 0)`
      }
    }
    const loop = () => {
      raf = 0
      if (!dragging) {
        ox += vx
        oy += vy
        vx *= 0.94
        vy *= 0.94
        if (!reduced && Math.abs(vx) + Math.abs(vy) < 0.2) {
          ox -= 0.3
          oy -= 0.1
        }
      }
      render()
      if (visible) raf = requestAnimationFrame(loop)
    }
    const start = () => { if (!raf) raf = requestAnimationFrame(loop) }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      down = true
      dragging = false
      moved = 0
      lx = e.clientX
      ly = e.clientY
      lt = performance.now()
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      lt = performance.now()
      moved += Math.abs(dx) + Math.abs(dy)
      if (!dragging && moved > 6) {
        dragging = true
        vx = 0
        vy = 0
        try { sec.setPointerCapture(e.pointerId) } catch { /* bỏ qua */ }
        sec.classList.add('is-drag', 'is-touched')
      }
      if (dragging) {
        ox += dx
        oy += dy
        vx = vx * 0.6 + dx * 0.4
        vy = vy * 0.6 + dy * 0.4
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!down) return
      down = false
      if (dragging) {
        if (performance.now() - lt > 90) { vx = 0; vy = 0 }
        try { if (sec.hasPointerCapture(e.pointerId)) sec.releasePointerCapture(e.pointerId) } catch { /* bỏ qua */ }
        sec.classList.remove('is-drag')
      }
      dragging = false
    }
    const onClick = (e: MouseEvent) => {
      if (moved > 6) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) {
        e.preventDefault()
        ox -= e.deltaX
        sec.classList.add('is-touched')
      }
    }
    sec.addEventListener('pointerdown', onDown)
    sec.addEventListener('pointermove', onMove)
    sec.addEventListener('pointerup', onUp)
    sec.addEventListener('pointercancel', onUp)
    sec.addEventListener('click', onClick, true)
    sec.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', measure)
    render()
    const stop = watchVisible(sec, (v) => {
      visible = v
      if (v) start()
    })
    return () => {
      stop()
      cancelAnimationFrame(raf)
      sec.removeEventListener('pointerdown', onDown)
      sec.removeEventListener('pointermove', onMove)
      sec.removeEventListener('pointerup', onUp)
      sec.removeEventListener('pointercancel', onUp)
      sec.removeEventListener('click', onClick, true)
      sec.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <section id="keo" ref={secRef} className="cse-gal" data-cursor="Kéo" aria-label="Thư viện các lô cua và món cua, kéo để xem">
      <h2 className="cse-gal__title">Kéo<br />thử.</h2>
      <p className="cse-gal__count"><b>{LOTS.length}</b> lô · <b>{Object.keys(STAGE).length}</b> trạng thái</p>
      <div className="cse-gal__plane">
        {GRID.map((t, i) => {
          const setTile = (el: HTMLElement | null) => { tileEls.current[i] = el }
          const setImg = (el: HTMLImageElement | null) => { imgEls.current[i] = el }
          if (t.kind === 'img') {
            return (
              <figure key={i} ref={setTile} className="cse-tile">
                <img ref={setImg} className="cse-tile__img" src={sm(t.src)} alt="" draggable={false} loading="lazy" decoding="async" />
                <figcaption className="cse-tile__cap">{t.label}</figcaption>
              </figure>
            )
          }
          if (t.kind === 'stat') {
            return (
              <div key={i} ref={setTile} className={`cse-tile cse-tile--stat cse-tile--${t.tone}`}>
                <span className="cse-tile__big">{t.big}</span>
                <span className="cse-tile__small">{t.small}</span>
              </div>
            )
          }
          const st = STAGE[t.stage]
          return (
            <a key={i} ref={setTile} className={`cse-tile cse-tile--lot is-${t.stage}`} href="/investor" draggable={false} style={{ '--tone': st.tone } as CSSProperties}>
              <img ref={setImg} className="cse-tile__img" src={sm(t.src)} alt="" draggable={false} loading="lazy" decoding="async" />
              <span className="cse-tile__shade" aria-hidden="true" />
              <span className="cse-lot__chip"><i aria-hidden="true" />{st.label}</span>
              <span className="cse-lot__go" aria-hidden="true"><Arrow /></span>
              <span className="cse-lot__body">
                <b className="cse-lot__code">{t.code}</b>
                <span className="cse-lot__crab">{t.crab}</span>
                <span className="cse-lot__bar" aria-hidden="true"><i style={{ width: `${t.pct}%` }} /></span>
                <span className="cse-lot__meta"><b>{t.stage === 'soon' ? '—' : `${t.pct}%`}</b><span>{t.meta}</span></span>
              </span>
            </a>
          )
        })}
      </div>
      <p className="cse-gal__hint">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M8 8l-4 4 4 4M16 8l4 4-4 4" />
        </svg>
        Kéo để khám phá
      </p>
    </section>
  )
}

/* ---------- đèn soi truy xuất ---------- */
function Soi() {
  const secRef = useRef<HTMLElement>(null)
  const stRef = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState(false)
  const [fine] = useState(isFine)

  useEffect(() => {
    const sec = secRef.current
    const st = stRef.current
    if (!sec || !st) return
    const reduced = isReduced()
    let x = st.clientWidth / 2, y = st.clientHeight / 2, tx = x, ty = y
    let lastMove = -1e9, raf = 0, visible = false, open = false
    const onMove = (e: PointerEvent) => {
      const r = st.getBoundingClientRect()
      tx = e.clientX - r.left
      ty = e.clientY - r.top
      lastMove = performance.now()
    }
    const loop = (now: number) => {
      raf = 0
      const w = st.clientWidth
      const h = st.clientHeight
      if (now - lastMove > 2400) {
        const t = now / 1000
        tx = w / 2 + Math.cos(t * 0.55) * w * 0.26
        ty = h / 2 + Math.sin(t * 0.9) * h * 0.18
      }
      x += (tx - x) * 0.1
      y += (ty - y) * 0.1
      const rect = sec.getBoundingClientRect()
      const total = rect.height - h
      const p = total > 0 ? clamp(-rect.top / total, 0, 1) : 1
      const q = clamp((p - 0.3) / 0.5, 0, 1)
      const e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2
      const base = Math.min(w, h) * (fine ? 0.22 : 0.3)
      const r = reduced ? Math.hypot(w, h) * 2 : base + e * Math.hypot(w, h) * 2
      st.style.setProperty('--x', `${x.toFixed(1)}px`)
      st.style.setProperty('--y', `${y.toFixed(1)}px`)
      st.style.setProperty('--r', `${r.toFixed(1)}px`)
      const nowOpen = p > 0.72 || reduced
      if (nowOpen !== open) {
        open = nowOpen
        sec.classList.toggle('is-open', open)
      }
      if (visible) raf = requestAnimationFrame(loop)
    }
    st.addEventListener('pointermove', onMove)
    st.addEventListener('pointerdown', onMove)
    const stop = watchVisible(sec, (v) => {
      visible = v
      if (v && !raf) raf = requestAnimationFrame(loop)
    })
    return () => {
      stop()
      cancelAnimationFrame(raf)
      st.removeEventListener('pointermove', onMove)
      st.removeEventListener('pointerdown', onMove)
    }
  }, [fine])

  return (
    <section id="soi" ref={secRef} className="cse-soi">
      <div ref={stRef} className="cse-soi__sticky" data-cursor="scan" data-cursor-label="CS-L2611-01-0342">
        <img className="cse-soi__img" src={IMG.tied} alt="Cua buộc dây trong nồi hấp" loading="lazy" decoding="async" />
        <div className="cse-soi__glow" aria-hidden="true" />
        <h2 className="cse-soi__title" aria-label="Soi từng con.">
          <span className="cse-soi__outline" aria-hidden="true">Soi<br />từng con.</span>
          <span className="cse-soi__fill" aria-hidden="true">Soi<br />từng con.</span>
        </h2>
        <p className="cse-soi__hint">{fine ? 'Rê chuột để soi · cuộn để mở' : 'Cuộn để mở'}</p>
        <div className="cse-soi__foot">
          <p className="cse-soi__cap">Mỗi con cua một mã QR. Quét là thấy nó từ đâu.</p>
          <button type="button" className={`cse-chip ${flip ? 'is-flipped' : ''}`} onClick={() => setFlip((f) => !f)} aria-pressed={flip} aria-label="Tra mã CS-L2611-01-0342">
            <span className="cse-chip__in">
              <span className="cse-chip__face">
                <span className="cse-chip__qr"><QrIcon /></span>
                <span><b>CS-L2611-01-0342</b><small>Chạm để tra</small></span>
              </span>
              <span className="cse-chip__face cse-chip__back">
                <b>Ô 342 · Lô L2611-01</b>
                <small>Thu 28/01/2027 · 412 g</small>
                <small>HTX Nuôi cua Cà Mau</small>
              </span>
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}

/* ---------- kéo để chia ---------- */
function Bubble({ name, value, loss = false, op = false, off = false, delay }: { name: string; value: number; loss?: boolean; op?: boolean; off?: boolean; delay: number }) {
  const shown = useTween(value, 700)
  const s = Math.max(120, 78 + 170 * Math.sqrt(Math.max(0, value) / 80_000_000))
  return (
    <div
      className={`cse-bubble${loss ? ' is-loss' : ''}${op ? ' cse-bubble--op' : ''}${off ? ' is-off' : ''}`}
      style={{ '--s': `${s.toFixed(1)}px`, '--delay': `${delay}ms` } as CSSProperties}
    >
      <span className="cse-bubble__name">{name}</span>
      <span className="cse-bubble__amt">{trieu(shown)}</span>
      <span className="cse-bubble__unit">triệu</span>
    </div>
  )
}

function Chia() {
  const [rev, setRev] = useState(126)
  const res = useMemo(
    () => settle({
      revenue: BigInt(rev) * 1_000_000n,
      lockedStandardCost: 100_000_000n,
      reserveTotal: 15_000_000n,
      reserveUsed: 15_000_000n,
      operatorPct: 7,
      contributions: exampleContributions,
    }),
    [rev],
  )
  const pool = Number(res.pool)
  const rem = Number(res.remuneration)
  const shown = useTween(pool)
  const sign = pool > 0 ? 'pos' : pool < 0 ? 'neg' : 'zero'
  const headRef = useReveal<HTMLHeadingElement>()
  return (
    <section id="chia" className={`cse-chia is-${sign}`}>
      <div className="cse-chia__glow" aria-hidden="true" />
      <div className="cse-chia__head">
        <h2 ref={headRef} className="cse-h2 cse-rv">
          <span><span>Kéo để</span></span>
          <span><span style={{ '--i': 1 } as CSSProperties}><em>chia.</em></span></span>
        </h2>
        <p className="cse-chia__note">Chi phí khoá trước: 100 triệu.<br />Phần dư chia theo vốn góp.</p>
      </div>
      <div className={`cse-chia__pool is-${sign}`}>{signed(shown)}</div>
      <p className="cse-chia__label">Revenue Pool</p>
      <div className="cse-range" style={{ '--p': (rev - 40) / 120 } as CSSProperties}>
        <span className="cse-range__bubble">Doanh thu {rev} triệu</span>
        <input
          type="range" min={40} max={160} step={1} value={rev}
          onChange={(e) => setRev(Number(e.target.value))}
          aria-label="Doanh thu thực thu, triệu đồng"
          aria-valuetext={`${rev} triệu, Revenue Pool ${signed(pool)}`}
          data-cursor="hide"
        />
        <span className="cse-range__tick" aria-hidden="true"><i />Hoà vốn</span>
        <div className="cse-range__ends" aria-hidden="true"><span>40 triệu</span><span>160 triệu</span></div>
      </div>
      <div className="cse-bubbles">
        {res.lines.map((l, k) => (
          <Bubble key={l.id} name={`${l.name.replace('Nhà đầu tư ', '')} · ${formatPct(l.pctBps)}`} value={Number(l.payout)} loss={l.share < 0n} delay={k * 400} />
        ))}
        <Bubble name="Người nuôi 7%" value={rem} op off={rem <= 0} delay={1200} />
      </div>
      <p className="cse-chia__foot">Ví dụ minh hoạ · lỗ tối đa bằng vốn đã góp</p>
    </section>
  )
}

/* ---------- món cua: rê chuột hiện ảnh lớn, nền cả khối ngả theo màu món ---------- */
const MENU = [
  { name: 'Cua hấp', from: 'Cua gạch', price: '690.000 đ/kg', img: IMG.steamer },
  { name: 'Cua sốt', from: 'Cua thịt', price: '520.000 đ/kg', img: IMG.sauce },
  { name: 'Cua sốt ớt', from: 'Cua thịt', price: '520.000 đ/kg', img: IMG.chili },
  { name: 'Càng cua', from: 'Cua thịt', price: '520.000 đ/kg', img: IMG.claws },
  { name: 'Lẩu cua', from: 'Cua cốm', price: '610.000 đ/kg', img: IMG.pot },
]

function Mua() {
  const listRef = useRef<HTMLUListElement>(null)
  const floatRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  const headRef = useReveal<HTMLHeadingElement>()
  useEffect(() => {
    const list = listRef.current
    const fl = floatRef.current
    if (!list || !fl || !isFine()) return
    let x = 0, y = 0, tx = 0, ty = 0, prevX = 0, rot = 0, raf = 0, inside = false
    const loop = () => {
      raf = 0
      x += (tx - x) * 0.14
      y += (ty - y) * 0.14
      const vx = x - prevX
      prevX = x
      rot += (clamp(vx * 0.35, -9, 9) - rot) * 0.12
      fl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${rot.toFixed(2)}deg)`
      if (inside || Math.abs(tx - x) + Math.abs(ty - y) > 0.5) raf = requestAnimationFrame(loop)
    }
    const onMove = (e: PointerEvent) => {
      tx = e.clientX
      ty = e.clientY
      if (!inside) {
        inside = true
        x = tx
        y = ty
        prevX = x
      }
      if (!raf) raf = requestAnimationFrame(loop)
    }
    const onLeave = () => {
      inside = false
      setActive(-1)
    }
    list.addEventListener('pointermove', onMove)
    list.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      list.removeEventListener('pointermove', onMove)
      list.removeEventListener('pointerleave', onLeave)
    }
  }, [])
  return (
    <section id="mua" className={`cse-menu${active >= 0 ? ' is-hover' : ''}`}>
      <div className="cse-menu__ambient" aria-hidden="true">
        {MENU.map((m, i) => <img key={m.name} className={i === active ? 'is-active' : ''} src={sm(m.img)} alt="" loading="lazy" decoding="async" />)}
      </div>
      <div className="cse-menu__head">
        <h2 ref={headRef} className="cse-h2 cse-rv">
          <span><span>Từ hộp nuôi</span></span>
          <span><span style={{ '--i': 1 } as CSSProperties}>đến <em>bàn ăn.</em></span></span>
        </h2>
        <a className="cse-textlink" href="/cua-hang"><Roll text="Cửa hàng" /><Arrow /></a>
      </div>
      <ul ref={listRef} className="cse-menu__list">
        {MENU.map((m, i) => (
          <li key={m.name} className="cse-row" onPointerEnter={() => setActive(i)}>
            <a href="/cua-hang" data-cursor="Mua">
              <span className="cse-row__i">0{i + 1}</span>
              <span className="cse-row__name">{m.name}</span>
              <span className="cse-row__meta"><span>{m.from}</span><span>{m.price}</span></span>
              <img className="cse-row__thumb" src={sm(m.img)} alt="" loading="lazy" decoding="async" />
            </a>
          </li>
        ))}
      </ul>
      <div ref={floatRef} className={`cse-float${active >= 0 ? ' is-on' : ''}`} aria-hidden="true">
        {MENU.map((m, i) => <img key={m.name} className={i === active ? 'is-active' : ''} src={m.img} alt="" loading="lazy" decoding="async" />)}
      </div>
    </section>
  )
}

/* ---------- lời mời cuối + chân trang ---------- */
function Cta() {
  const headRef = useReveal<HTMLHeadingElement>()
  return (
    <section className="cse-cta">
      <div className="cse-cta__bg" aria-hidden="true" />
      <p className="cse-cta__small">Sẵn sàng?</p>
      <h2 ref={headRef} className="cse-h2 cse-rv cse-cta__h"><span><span>Chọn một lô.</span></span></h2>
      <Magnetic area strength={0.4}>
        <a className="cse-orb" href="/investor"><span className="cse-orb__label" data-magnet-inner>Góp vốn <Arrow /></span></a>
      </Magnetic>
      <a className="cse-textlink" href="/cua-hang"><Roll text="Hoặc mua cua" /><Arrow /></a>
    </section>
  )
}

function Footer() {
  return (
    <footer className="cse-foot">
      <div className="cse-foot__word" aria-hidden="true">
        {Array.from('CRABSHARE').map((c, i) => <span key={i}>{c}</span>)}
      </div>
      <div className="cse-foot__row">
        <span>© 2026 CrabShare · Đồ án FA26SE229 · Dữ liệu trên trang là mô phỏng · Ảnh món cua: Pexels</span>
        <nav className="cse-foot__links" aria-label="Liên kết">
          <a href="/dang-nhap">Đăng nhập</a>
          <a href="/operator">Người nuôi</a>
          <a href="/admin">Quản trị</a>
        </nav>
      </div>
    </footer>
  )
}

/* ---------- trang ---------- */
export default function Landing() {
  const [reduced] = useState(isReduced)
  const [heroReady, setHeroReady] = useState(false)
  const [ready, setReady] = useState(reduced)
  const [introGone, setIntroGone] = useState(reduced)

  useEffect(() => {
    document.title = 'CrabShare — Góp vốn. Nuôi cua. Chia từng đồng.'
    const prevRestore = history.scrollRestoration
    history.scrollRestoration = 'manual'
    if (!window.location.hash) window.scrollTo(0, 0)
    const prev = document.body.style.background
    document.body.style.background = '#070908'
    return () => {
      document.body.style.background = prev
      history.scrollRestoration = prevRestore
    }
  }, [])
  useEffect(() => {
    const html = document.documentElement
    html.style.overflow = ready ? '' : 'hidden'
    return () => { html.style.overflow = '' }
  }, [ready])
  useEffect(() => {
    const t = window.setTimeout(() => setHeroReady(true), 3200)
    return () => window.clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!ready || introGone) return
    const t = window.setTimeout(() => setIntroGone(true), 1300)
    return () => window.clearTimeout(t)
  }, [ready, introGone])

  const onHeroReady = useCallback(() => setHeroReady(true), [])
  const onIntroDone = useCallback(() => setReady(true), [])

  return (
    <div className={`cse${ready ? ' is-ready' : ''}`}>
      <svg className="cse-defs" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="cse-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffae3a" />
            <stop offset=".5" stopColor="#ff5b24" />
            <stop offset="1" stopColor="#ff2f4e" />
          </linearGradient>
        </defs>
      </svg>
      <div className="cse__grain" aria-hidden="true" />
      <Cursor />
      {!introGone && <Intro ready={heroReady} onDone={onIntroDone} />}
      <Nav />
      <main>
        <Hero onReady={onHeroReady} />
        <River />
        <Gallery />
        <Soi />
        <Chia />
        <Mua />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}

/* Bộ thành phần dùng chung cho 6 bản thiết kế (3 cửa hàng, 3 nhà đầu tư).
   Màu sắc lấy từ biến CSS của từng chủ đề (.rd--dark / .rd--light / .rd--mix) nên cùng một thành phần
   tự hợp với mọi bản. */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, Check, Clock, Landmark, Minus, Plus, QrCode, ShieldCheck, ShoppingBag, Signature, Truck, X } from 'lucide-react'
import { settle } from '../../../features/landing/settlement'
import {
  DEPOSIT, HOLD_MIN, IMG, LIFE, OPERATOR, SETTLE_2611, costOf, lifeIndex, lot, maxCapital, minCapital, minContribution,
  myPayout2611, pct, product, small, stage, tr, vnd, type Lot, type Product, type Stage,
} from './mock-data'
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

export function TopBar({ area, right, children, className = '' }: { area: 'store' | 'investor'; right?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={`rd-top ${className}`}>
      <Logo />
      <nav className="rd-top__nav" aria-label="Điều hướng chính">
        {children ?? (
          <>
            <a href="/cua-hang" className={area === 'store' ? 'is-on' : ''}>Cửa hàng</a>
            <a href="/nha-dau-tu" className={area === 'investor' ? 'is-on' : ''}>Góp vốn</a>
          </>
        )}
      </nav>
      <div className="rd-top__right">{right}</div>
    </header>
  )
}

/* ---------- mảnh nhỏ ---------- */
export function StageChip({ s, solid = false }: { s: Stage; solid?: boolean }) {
  const st = stage(s)
  return <span className={`rd-chip${solid ? ' rd-chip--solid' : ''}`} style={{ '--tone': st.tone } as CSSProperties}><i />{st.label}</span>
}

export function Bar({ value, max, tone }: { value: number; max: number; tone?: string }) {
  return (
    <span className="rd-bar" style={tone ? ({ '--tone': tone } as CSSProperties) : undefined}>
      <i style={{ width: `${clamp((value / max) * 100, 0, 100)}%` }} />
    </span>
  )
}

/** Thanh vốn có vạch 80 / 100 / 120% mục tiêu. */
export function FundBar({ l, labels = true }: { l: Lot; labels?: boolean }) {
  const max = maxCapital(l)
  const at = (v: number) => `${(v / max) * 100}%`
  return (
    <span className="rd-fund">
      <span className="rd-fund__track">
        <i className="rd-fund__fill" style={{ width: at(Math.min(l.confirmed, max)) }} />
        <b style={{ left: at(minCapital(l)) }} />
        <b style={{ left: at(l.target) }} />
      </span>
      {labels && (
        <span className="rd-fund__labels">
          <span style={{ left: at(minCapital(l)) }}>80%</span>
          <span style={{ left: at(l.target) }}>100%</span>
          <span style={{ left: '100%' }}>120%</span>
        </span>
      )}
    </span>
  )
}

export function Ring({ value, size = 56, label }: { value: number; size?: number; label?: string }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <svg className="rd-ring" width={size} height={size} viewBox="0 0 54 54" aria-hidden="true">
      <circle cx="27" cy="27" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle cx="27" cy="27" r={r} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - clamp(value, 0, 100) / 100)} transform="rotate(-90 27 27)" />
      <text x="27" y="31" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor">{label ?? `${Math.round(value)}%`}</text>
    </svg>
  )
}

export function Qty({ value, onChange, max = 99, small: sm = false }: { value: number; onChange: (v: number) => void; max?: number; small?: boolean }) {
  return (
    <span className={`rd-qty${sm ? ' rd-qty--sm' : ''}`}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label="Bớt một"><Minus size={sm ? 14 : 16} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Thêm một"><Plus size={sm ? 14 : 16} /></button>
    </span>
  )
}

export function SizePills({ p, value, onChange }: { p: Product; value: number; onChange: (i: number) => void }) {
  if (p.sizes.length < 2) return <p className="rd-size-one">{p.sizes[0].label}</p>
  return (
    <div className="rd-pills" role="radiogroup" aria-label="Chọn cỡ">
      {p.sizes.map((s, i) => (
        <button key={s.label} type="button" role="radio" aria-checked={value === i} className={value === i ? 'is-on' : ''} onClick={() => onChange(i)}>{s.label}</button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ items, value, onChange, className = '' }: { items: readonly T[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`rd-tabs ${className}`} role="tablist">
      {items.map((it) => (
        <button key={it} type="button" role="tab" aria-selected={value === it} className={value === it ? 'is-on' : ''} onClick={() => onChange(it)}>{it}</button>
      ))}
    </div>
  )
}

export function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [until])
  const left = until ? Math.max(0, until - now) : 0
  const m = Math.floor(left / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return { left, text: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }
}

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

export function QrMock({ size = 150 }: { size?: number }) {
  const cells = useMemo(() => {
    const out: [number, number][] = []
    let seed = 7
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
      if (finder) continue
      seed = (seed * 9301 + 49297) % 233280
      if (seed / 233280 > 0.52) out.push([x, y])
    }
    return out
  }, [])
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#111" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="#111" />
    </g>
  )
  return (
    <svg className="rd-qr" width={size} height={size} viewBox="-2 -2 25 25" role="img" aria-label="Mã QR chuyển khoản (minh hoạ)">
      <rect x="-2" y="-2" width="25" height="25" fill="#fff" rx="2" />
      {cells.map(([x, y]) => <rect key={`${x}.${y}`} x={x} y={y} width="1" height="1" fill="#111" />)}
      {finder(0, 0)}{finder(14, 0)}{finder(0, 14)}
    </svg>
  )
}

/* ---------- giỏ hàng ---------- */
/** item: sản phẩm lấy từ API (không có trong dữ liệu mẫu) được lưu kèm dòng giỏ. */
export type CartLine = { id: string; size: number; qty: number; item?: Product }
export const lineProduct = (l: CartLine) => l.item ?? product(l.id)
/** Số lượng tối đa mua được (đơn vị nguyên); 0 = hết hàng. */
export const maxQty = (p: Product) => (p.soldOut ? 0 : Math.floor(p.stock))
const qtyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

type CartState = {
  lines: CartLine[]
  add: (id: string, size: number, qty?: number, item?: Product) => void
  setQty: (id: string, size: number, qty: number) => void
  clear: () => void
  open: boolean
  setOpen: (v: boolean) => void
  holdUntil: number | null
  toast: string | null
  count: number
  subtotal: number
  today: number
  deposit: number
  groups: { lot: string; lines: CartLine[] }[]
}
const CartCtx = createContext<CartState | null>(null)

export function cartTotals(lines: CartLine[]) {
  let subtotal = 0, today = 0, deposit = 0, count = 0
  const map = new Map<string, CartLine[]>()
  for (const l of lines) {
    const p = lineProduct(l)
    const price = p.sizes[l.size].price * l.qty
    subtotal += price
    count += l.qty
    if (p.preorder) {
      const d = Math.round(price * DEPOSIT)
      deposit += d
      today += d
    } else today += price
    map.set(p.lot, [...(map.get(p.lot) ?? []), l])
  }
  return { subtotal, today, deposit, count, groups: [...map.entries()].map(([lotCode, ls]) => ({ lot: lotCode, lines: ls })) }
}

export function CartProvider({ children, seed = [] }: { children: ReactNode; seed?: CartLine[] }) {
  const [lines, setLines] = useState<CartLine[]>(seed)
  const [open, setOpen] = useState(false)
  const [holdUntil, setHoldUntil] = useState<number | null>(() => (seed.length ? Date.now() + HOLD_MIN * 60000 : null))
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef(0)
  const value = useMemo<CartState>(() => {
    const t = cartTotals(lines)
    return {
      lines,
      open,
      setOpen,
      holdUntil,
      toast,
      ...t,
      add: (id, size, qty = 1, item) => {
        const p = item ?? lines.find((l) => l.id === id)?.item ?? product(id)
        const max = maxQty(p)
        const flash = (msg: string) => {
          setToast(msg)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => setToast(null), 2400)
        }
        if (max < 1) {
          flash(`${p.name} đã hết hàng`)
          return
        }
        setLines((ls) => {
          const i = ls.findIndex((l) => l.id === id && l.size === size)
          if (i >= 0) {
            const next = [...ls]
            next[i] = { ...next[i], item: item ?? next[i].item, qty: Math.min(max, next[i].qty + qty) }
            return next
          }
          return [...ls, { id, size, qty: Math.min(max, qty), item }]
        })
        setHoldUntil((h) => h ?? Date.now() + HOLD_MIN * 60000)
        flash(`Đã thêm ${p.name}`)
      },
      setQty: (id, size, qty) =>
        setLines((ls) => {
          const next = qty <= 0 ? ls.filter((l) => !(l.id === id && l.size === size)) : ls.map((l) => (l.id === id && l.size === size ? { ...l, qty } : l))
          if (!next.length) setHoldUntil(null)
          return next
        }),
      clear: () => {
        setLines([])
        setHoldUntil(null)
      },
    }
  }, [lines, open, holdUntil, toast])
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>
}

export function useCart() {
  const c = useContext(CartCtx)
  if (!c) throw new Error('useCart cần CartProvider')
  return c
}

export function CartButton({ label = false }: { label?: boolean }) {
  const c = useCart()
  return (
    <button type="button" className={`rd-cartbtn${label ? ' rd-cartbtn--label' : ''}`} onClick={() => c.setOpen(true)} aria-label={`Giỏ hàng, ${c.count} món`}>
      <ShoppingBag size={18} />
      {label && <span>Giỏ hàng</span>}
      {c.count > 0 && <span className="rd-badge">{c.count}</span>}
    </button>
  )
}

export function CartToast() {
  const c = useCart()
  return <div className={`rd-toast${c.toast ? ' is-on' : ''}`} role="status">{c.toast && <><Check size={16} />{c.toast}</>}</div>
}

type CheckoutStep = 'cart' | 'ship' | 'pay' | 'done'

/** Ngăn kéo giỏ hàng có sẵn quy trình thanh toán 3 bước. */
export function CartDrawer() {
  const c = useCart()
  const [step, setStep] = useState<CheckoutStep>('cart')
  const [slot, setSlot] = useState('Hôm nay, 17–19h')
  const [method, setMethod] = useState('VietQR')
  const [orders, setOrders] = useState<string[]>([])
  const cd = useCountdown(c.holdUntil)
  const close = () => {
    c.setOpen(false)
    if (step === 'done') setStep('cart')
  }
  useEffect(() => {
    if (!c.open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') c.setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [c])
  const titles: Record<CheckoutStep, string> = { cart: 'Giỏ hàng', ship: 'Giao hàng', pay: 'Thanh toán', done: 'Đặt hàng xong' }
  const order = () => {
    setOrders(c.groups.map((g, i) => `DH-2609${g.lot.slice(-2)}-${String(41 + i).padStart(3, '0')}`))
    c.clear()
    setStep('done')
  }
  return (
    <>
      <div className={`rd-drawer${c.open ? ' is-open' : ''}`} aria-hidden={!c.open}>
        <div className="rd-drawer__scrim" onClick={close} />
        <aside className="rd-drawer__panel" role="dialog" aria-modal="true" aria-label={titles[step]}>
          <header className="rd-drawer__head">
            {step === 'ship' || step === 'pay' ? (
              <button type="button" className="rd-iconbtn" onClick={() => setStep(step === 'pay' ? 'ship' : 'cart')} aria-label="Quay lại"><ArrowLeft size={18} /></button>
            ) : <span />}
            <b>{titles[step]}</b>
            <button type="button" className="rd-iconbtn" onClick={close} aria-label="Đóng"><X size={18} /></button>
          </header>

          {step !== 'done' && c.lines.length > 0 && (
            <p className="rd-hold"><Clock size={14} /> Đang giữ hàng cho bạn · <b>{cd.text}</b></p>
          )}

          <div className="rd-drawer__body">
            {step === 'cart' && (c.lines.length === 0 ? (
              <div className="rd-empty"><ShoppingBag size={32} /><p>Giỏ đang trống</p><button type="button" className="rd-btn rd-btn--ghost" onClick={close}>Xem hàng</button></div>
            ) : (
              c.groups.map((g) => (
                <section key={g.lot} className="rd-cartgroup">
                  <p className="rd-cartgroup__head"><span>Lô {g.lot}</span><span>{lineProduct(g.lines[0]).farm ?? OPERATOR}</span></p>
                  {g.lines.map((l) => {
                    const p = lineProduct(l)
                    return (
                      <div key={`${l.id}-${l.size}`} className="rd-cartline">
                        <img src={small(p.img, 200)} alt="" />
                        <div className="rd-cartline__info">
                          <b>{p.name}</b>
                          <small>{p.sizes[l.size].label}{p.preorder ? ' · đặt trước' : ''}</small>
                          <Qty small value={l.qty} max={maxQty(p)} onChange={(v) => c.setQty(l.id, l.size, v)} />
                        </div>
                        <span className="rd-cartline__price">{vnd(p.sizes[l.size].price * l.qty)}</span>
                      </div>
                    )
                  })}
                </section>
              ))
            ))}

            {step === 'ship' && (
              <div className="rd-form">
                <label>Người nhận<input defaultValue="Nguyễn Minh Anh" /></label>
                <label>Số điện thoại<input defaultValue="0901 234 567" inputMode="tel" /></label>
                <label>Địa chỉ<input defaultValue="12 Nguyễn Văn Bảo, Gò Vấp, TP.HCM" /></label>
                <p className="rd-form__label">Giờ nhận</p>
                <div className="rd-pills">
                  {['Hôm nay, 17–19h', 'Ngày mai, 8–11h', 'Ngày mai, 17–19h'].map((s) => (
                    <button key={s} type="button" className={slot === s ? 'is-on' : ''} onClick={() => setSlot(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {step === 'pay' && (
              <div className="rd-form">
                {[
                  ['VietQR', 'Quét mã bằng app ngân hàng'],
                  ['Ví điện tử', 'MoMo, ZaloPay'],
                  ['Thẻ', 'Visa, Mastercard, ATM nội địa'],
                ].map(([m, d]) => (
                  <button key={m} type="button" className={`rd-option${method === m ? ' is-on' : ''}`} onClick={() => setMethod(m)}>
                    <span className="rd-option__dot" /><span><b>{m}</b><small>{d}</small></span>
                  </button>
                ))}
                <p className="rd-note"><Landmark size={14} /> Tiền vào thẳng tài khoản riêng của từng lô tại trung gian thanh toán. CrabShare không giữ tiền.</p>
              </div>
            )}

            {step === 'done' && (
              <div className="rd-done">
                <span className="rd-done__icon"><Check size={28} /></span>
                <h3>Đã đặt hàng</h3>
                <p>{orders.length > 1 ? `Tạo ${orders.length} đơn, mỗi lô một đơn.` : 'Đơn của bạn đã được tạo.'}</p>
                <ul className="rd-done__list">{orders.map((o) => <li key={o}>{o}</li>)}</ul>
                <p className="rd-note"><ShieldCheck size={14} /> Bạn có 2 giờ sau khi nhận hàng để báo lỗi.</p>
                <a className="rd-btn rd-btn--primary rd-btn--block" href="/theo-doi-don-hang">Theo dõi đơn</a>
              </div>
            )}
          </div>

          {step !== 'done' && c.lines.length > 0 && (
            <footer className="rd-drawer__foot">
              <dl className="rd-sum">
                <dt>Tạm tính</dt><dd>{vnd(c.subtotal)}</dd>
                <dt>Giao hàng</dt><dd>Miễn phí</dd>
                {c.deposit > 0 && <><dt>Đặt trước, trả cọc 15%</dt><dd>{vnd(c.deposit)}</dd></>}
                <dt className="rd-sum__total">Trả hôm nay</dt><dd className="rd-sum__total">{vnd(c.today)}</dd>
              </dl>
              {c.groups.length > 1 && step === 'cart' && <p className="rd-note"><Truck size={14} /> Hàng từ {c.groups.length} lô sẽ tạo {c.groups.length} đơn riêng.</p>}
              {step === 'cart' && <button type="button" className="rd-btn rd-btn--primary rd-btn--block rd-btn--lg" onClick={() => setStep('ship')}>Thanh toán</button>}
              {step === 'ship' && <button type="button" className="rd-btn rd-btn--primary rd-btn--block rd-btn--lg" onClick={() => setStep('pay')}>Tiếp tục</button>}
              {step === 'pay' && <button type="button" className="rd-btn rd-btn--primary rd-btn--block rd-btn--lg" onClick={order}>Đặt hàng · {vnd(c.today)}</button>}
            </footer>
          )}
        </aside>
      </div>
      <CartToast />
    </>
  )
}

/* ---------- xem sản phẩm ---------- */
export function TraceCard({ p }: { p: Product }) {
  if (p.farm) {
    return (
      <div className="rd-trace">
        <div className="rd-trace__head">
          <span className="rd-trace__icon"><QrCode size={20} /></span>
          <div><b>Nguồn gốc</b><small>Mỗi con có mã QR riêng trên dây buộc</small></div>
        </div>
        <dl>
          <dt>Lô</dt><dd>{p.lot} · {p.crab}</dd>
          <dt>Người nuôi</dt><dd>{p.farm}</dd>
          <dt>Ngày thu</dt><dd>{p.harvest}</dd>
        </dl>
        {p.traceTag && <a className="rd-btn rd-btn--ghost rd-btn--block" href={`/truy-xuat/${p.traceTag}`}>Truy xuất lô {p.lot}</a>}
      </div>
    )
  }
  const l = lot(p.lot)
  return (
    <div className="rd-trace">
      <div className="rd-trace__head">
        <span className="rd-trace__icon"><QrCode size={20} /></span>
        <div><b>Nguồn gốc</b><small>Mỗi con có mã QR riêng trên dây buộc</small></div>
      </div>
      <dl>
        <dt>Lô</dt><dd>{p.lot} · {l.crab}</dd>
        <dt>Người nuôi</dt><dd>{OPERATOR}</dd>
        <dt>{p.preorder ? 'Thu hoạch' : 'Ngày thu'}</dt><dd>{p.harvest}</dd>
        <dt>Nuôi tại</dt><dd>Hộp RAS · {l.boxes} ô</dd>
      </dl>
    </div>
  )
}

export function ProductView({ p, onAdded }: { p: Product; onAdded?: () => void }) {
  const cart = useCart()
  const [size, setSize] = useState(0)
  const [qty, setQty] = useState(1)
  const [shot, setShot] = useState(0)
  const gallery = p.gallery ?? [p.img, IMG.sorter, IMG.qr]
  const price = p.sizes[size].price
  const max = maxQty(p)
  return (
    <div className="rd-pv">
      <div className="rd-pv__gallery">
        <div className="rd-pv__main"><img key={shot} src={gallery[shot]} alt={p.name} /></div>
        <div className="rd-pv__thumbs">
          {gallery.map((g, i) => (
            <button key={g} type="button" className={i === shot ? 'is-on' : ''} onClick={() => setShot(i)} aria-label={`Ảnh ${i + 1}`}><img src={small(g, 240)} alt="" /></button>
          ))}
        </div>
      </div>
      <div className="rd-pv__info">
        <div className="rd-pv__tags">
          <span className="rd-tag">{p.kind}</span>
          {p.preorder ? <span className="rd-tag rd-tag--accent">Đặt trước · cọc 15%</span>
            : max < 1 ? <span className="rd-tag">Hết hàng</span>
            : <span className="rd-tag">Còn {qtyFmt.format(p.stock)} {p.unit}</span>}
        </div>
        <h2 className="rd-pv__name">{p.name}</h2>
        <p className="rd-pv__price">{vnd(price)}<small> / {p.unit}</small></p>
        <SizePills p={p} value={size} onChange={setSize} />
        <div className="rd-pv__buy">
          <Qty value={qty} max={Math.max(1, max)} onChange={(v) => setQty(Math.max(1, v))} />
          <button type="button" className="rd-btn rd-btn--primary rd-btn--lg rd-pv__cta" disabled={max < 1} onClick={() => { cart.add(p.id, size, qty, p); onAdded?.() }}>
            {max < 1 ? 'Hết hàng' : p.preorder ? `Đặt trước · cọc ${vnd(price * qty * DEPOSIT)}` : `Thêm vào giỏ · ${vnd(price * qty)}`}
          </button>
        </div>
        <p className="rd-pv__hint"><Clock size={14} /> Giữ hàng 15 phút khi bạn thêm vào giỏ.</p>
        <TraceCard p={p} />
        <ul className="rd-assure">
          <li><Truck size={16} /> Mỗi đơn thuộc đúng một lô</li>
          <li><ShieldCheck size={16} /> Báo lỗi trong 2 giờ sau khi nhận</li>
        </ul>
      </div>
    </div>
  )
}

/* ---------- nhà đầu tư ---------- */
export function Lifeline({ s, compact = false }: { s: Stage; compact?: boolean }) {
  const cur = lifeIndex(s)
  return (
    <ol className={`rd-life${compact ? ' rd-life--compact' : ''}`}>
      {LIFE.map((label, i) => (
        <li key={label} className={i < cur ? 'is-done' : i === cur ? 'is-on' : ''}>
          <span className="rd-life__dot">{i < cur ? <Check size={11} /> : null}</span>
          {!compact && <span className="rd-life__label">{label}</span>}
        </li>
      ))}
    </ol>
  )
}

export function CostBars({ l }: { l: Lot }) {
  const lines = costOf(l)
  const max = Math.max(...lines.map((c) => c.value))
  return (
    <div className="rd-cost">
      {lines.map((c) => (
        <div key={c.label} className={`rd-cost__row${c.reserve ? ' is-reserve' : ''}`}>
          <span className="rd-cost__label">{c.label}</span>
          <span className="rd-cost__bar"><i style={{ width: `${(c.value / max) * 100}%` }} /></span>
          <span className="rd-cost__val">{tr(c.value)}</span>
        </div>
      ))}
      <p className="rd-cost__total"><span>Standard Cost đã khoá</span><b>{vnd(l.target)}</b></p>
      <p className="rd-note">Dự phòng hao hụt không dùng hết sẽ cộng lại vào phần chia.</p>
    </div>
  )
}

export function Tranches({ l }: { l: Lot }) {
  const idx = lifeIndex(l.stage)
  const rows = [
    { t: 'Đợt 1 · 60%', d: 'Thả giống', done: idx >= 1 },
    { t: 'Đợt 2 · 25%', d: 'Sau khi nộp bằng chứng', done: idx >= 2 || (idx === 1 && (l.day ?? 0) > 30) },
    { t: 'Đợt 3 · 15%', d: 'Trước thu hoạch', done: idx >= 2 },
  ]
  return (
    <ul className="rd-tranche">
      {rows.map((r) => (
        <li key={r.t} className={r.done ? 'is-done' : ''}>
          <span className="rd-tranche__dot">{r.done ? <Check size={12} /> : null}</span>
          <b>{r.t}</b><small>{r.d}</small>
        </li>
      ))}
    </ul>
  )
}

/** Mô phỏng quyết toán cho một lô: kéo số vốn và doanh thu, thấy ngay phần mình nhận. */
export function SettleSim({ l }: { l: Lot }) {
  const min = minContribution(l)
  const [mine, setMine] = useState(Math.max(min, 10_000_000))
  const [rev, setRev] = useState(Math.round((l.target * 1.2) / 1e6))
  const res = useMemo(() => {
    const others = Math.max(0, l.target - mine)
    return settle({
      revenue: BigInt(rev) * 1_000_000n,
      lockedStandardCost: BigInt(l.target),
      reserveTotal: BigInt(Math.round(l.target * 0.15)),
      reserveUsed: BigInt(Math.round(l.target * 0.15)),
      operatorPct: 7,
      contributions: [{ id: 1, name: 'Bạn', amount: BigInt(mine) }, ...(others > 0 ? [{ id: 2, name: 'Người khác', amount: BigInt(others) }] : [])],
    })
  }, [l, mine, rev])
  const pool = Number(res.pool)
  const me = res.lines[0]
  const revMin = Math.round((l.target * 0.4) / 1e6)
  const revMax = Math.round((l.target * 1.6) / 1e6)
  const mineMax = Math.round(l.target / 2)
  return (
    <div className={`rd-sim ${pool > 0 ? 'is-pos' : pool < 0 ? 'is-neg' : ''}`}>
      <label className="rd-sim__row">
        <span>Bạn góp</span><b>{tr(mine)}</b>
        <input className="rd-range" type="range" min={min} max={mineMax} step={1_000_000} value={mine} onChange={(e) => setMine(Number(e.target.value))} style={{ '--p': (mine - min) / (mineMax - min) } as CSSProperties} />
      </label>
      <label className="rd-sim__row">
        <span>Doanh thu cả lô</span><b>{tr(rev * 1e6, 0)}</b>
        <input className="rd-range" type="range" min={revMin} max={revMax} step={1} value={rev} onChange={(e) => setRev(Number(e.target.value))} style={{ '--p': (rev - revMin) / (revMax - revMin) } as CSSProperties} />
      </label>
      <div className="rd-sim__out">
        <div><small>Revenue Pool</small><b className="rd-sim__pool">{pool > 0 ? '+' : ''}{tr(pool)}</b></div>
        <div><small>Người nuôi 7%</small><b>{tr(Number(res.remuneration))}</b></div>
        <div><small>Bạn nhận về</small><b className="rd-sim__me">{tr(Number(me.payout), 2)}</b></div>
      </div>
      <p className="rd-note">Ví dụ để hiểu cách chia, không phải dự báo. Lỗ tối đa bằng số vốn đã góp.</p>
    </div>
  )
}

export function SettlementCard() {
  const s = SETTLE_2611
  return (
    <div className="rd-settle">
      <dl>
        <dt>Doanh thu thực thu</dt><dd>{vnd(126_000_000)}</dd>
        <dt>Standard Cost đã khoá</dt><dd>− {vnd(Number(s.costDeducted))}</dd>
        <dt className="rd-settle__pool">Revenue Pool</dt><dd className="rd-settle__pool">+{vnd(Number(s.pool))}</dd>
        <dt>Người nuôi 7%</dt><dd>− {vnd(Number(s.remuneration))}</dd>
        <dt className="rd-settle__me">Bạn nhận về (góp 50 triệu)</dt><dd className="rd-settle__me">{vnd(myPayout2611)}</dd>
      </dl>
      <div className="rd-settle__actions">
        <button type="button" className="rd-btn rd-btn--primary">Đồng ý</button>
        <button type="button" className="rd-btn rd-btn--ghost">Có thắc mắc</button>
      </div>
      <p className="rd-note">Tiền chi từ tài khoản lô: thuế → thù lao người nuôi → phần chia, tới từng đồng.</p>
    </div>
  )
}

/** Góp vốn 4 bước: số tiền → xem lại → ký → chuyển tiền. */
export function ContributeModal({ l, onClose, initial }: { l: Lot; onClose: () => void; initial?: number }) {
  useModalLock(onClose)
  const min = minContribution(l)
  const room = Math.max(min, maxCapital(l) - l.confirmed)
  const [amount, setAmount] = useState(clamp(initial ?? 10_000_000, min, room))
  const [step, setStep] = useState(initial ? 1 : 0)
  const [agree, setAgree] = useState(false)
  const [signed, setSigned] = useState(false)
  const [until] = useState(() => Date.now() + HOLD_MIN * 60000)
  const cd = useCountdown(until)
  const steps = ['Số tiền', 'Xem lại', 'Ký', 'Chuyển tiền']
  const quick = [min, 5_000_000, 10_000_000, 20_000_000].filter((v, i, a) => v <= room && a.indexOf(v) === i)
  return (
    <div className="rd-modal" role="dialog" aria-modal="true" aria-label={`Góp vốn vào ${l.code}`}>
      <div className="rd-modal__scrim" onClick={onClose} />
      <div className="rd-modal__card">
        <header className="rd-modal__head">
          <div><small>Góp vốn</small><b>{l.code} · {l.crab}</b></div>
          {step < 4 && <span className="rd-hold rd-hold--pill"><Clock size={14} /> {cd.text}</span>}
          <button type="button" className="rd-iconbtn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>
        {step < 4 && (
          <ol className="rd-steps">
            {steps.map((s, i) => (
              <li key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''}><span>{i < step ? <Check size={12} /> : i + 1}</span>{s}</li>
            ))}
          </ol>
        )}
        <div className="rd-modal__body">
          {step === 0 && (
            <>
              <p className="rd-amount">{vnd(amount)}</p>
              <input className="rd-range" type="range" min={min} max={room} step={500_000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ '--p': (amount - min) / Math.max(1, room - min) } as CSSProperties} aria-label="Số tiền góp" />
              <div className="rd-range__ends"><span>Tối thiểu {tr(min)}</span><span>Còn nhận {tr(room)}</span></div>
              <div className="rd-pills rd-pills--center">
                {quick.map((q) => <button key={q} type="button" className={amount === q ? 'is-on' : ''} onClick={() => setAmount(q)}>{tr(q)}</button>)}
              </div>
              <div className="rd-facts">
                <div><small>Phần của bạn</small><b>≈ {pct(amount, l.confirmed + amount)}% của lô</b></div>
                <div><small>Lỗ tối đa</small><b>{tr(amount)}</b></div>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <dl className="rd-review">
                <dt>Số tiền</dt><dd>{vnd(amount)}</dd>
                <dt>Chi phí đã khoá</dt><dd>{vnd(l.target)}, không phát sinh thêm</dd>
                <dt>Hợp đồng</dt><dd>Giữa bạn và {OPERATOR}. CrabShare không là một bên.</dd>
                <dt>Tiền đi đâu</dt><dd>Tài khoản riêng của lô tại trung gian thanh toán</dd>
                <dt>Nếu thiếu vốn</dt><dd>Chưa đủ 80% đúng hạn thì hoàn tiền nguyên vẹn</dd>
                <dt>Rủi ro</dt><dd>Có thể lỗ, tối đa bằng số tiền góp</dd>
              </dl>
              <label className="rd-check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>Tôi đã đọc bản xác nhận rủi ro 9 ý</span>
              </label>
            </>
          )}
          {step === 2 && (
            <div className="rd-sign">
              <div className="rd-sign__row is-done"><span className="rd-sign__dot"><Check size={14} /></span><div><b>{OPERATOR}</b><small>Đã ký trước bằng chữ ký số</small></div></div>
              <div className={`rd-sign__row${signed ? ' is-done' : ''}`}>
                <span className="rd-sign__dot">{signed ? <Check size={14} /> : <Signature size={14} />}</span>
                <div><b>Bạn</b><small>{signed ? 'Đã ký' : 'Ký điện tử qua nhà cung cấp chữ ký số'}</small></div>
                {!signed && <button type="button" className="rd-btn rd-btn--ghost rd-btn--sm" onClick={() => setSigned(true)}>Ký ngay</button>}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="rd-pay">
              <QrMock size={168} />
              <dl className="rd-review">
                <dt>Tài khoản</dt><dd>Lô {l.code} · trung gian thanh toán</dd>
                <dt>Số tiền</dt><dd>{vnd(amount)}</dd>
                <dt>Nội dung</dt><dd>CS {l.code} MA</dd>
              </dl>
            </div>
          )}
          {step === 4 && (
            <div className="rd-done">
              <span className="rd-done__icon"><Check size={28} /></span>
              <h3>Đã ghi nhận</h3>
              <p>{vnd(amount)} vào lô {l.code}. Hệ thống xác nhận khi tiền về tài khoản lô.</p>
            </div>
          )}
        </div>
        <footer className="rd-modal__foot">
          {step > 0 && step < 4 && <button type="button" className="rd-btn rd-btn--ghost" onClick={() => setStep(step - 1)}>Quay lại</button>}
          {step === 0 && <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={() => setStep(1)}>Tiếp tục</button>}
          {step === 1 && <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" disabled={!agree} onClick={() => setStep(2)}>Tiếp tục</button>}
          {step === 2 && <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" disabled={!signed} onClick={() => setStep(3)}>Tiếp tục</button>}
          {step === 3 && <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={() => setStep(4)}>Tôi đã chuyển tiền</button>}
          {step === 4 && <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={onClose}>Xong</button>}
        </footer>
      </div>
    </div>
  )
}

/** Thanh góp vốn dính cuối màn hình (dùng ở trang chi tiết lô). */
export function StickyInvest({ l, onInvest }: { l: Lot; onInvest: () => void }) {
  if (l.stage !== 'funding') return null
  return (
    <div className="rd-sticky">
      <div><b>{l.code}</b><small>{pct(l.confirmed, l.target)}% · tối thiểu {tr(minContribution(l))} · {l.when}</small></div>
      <button type="button" className="rd-btn rd-btn--primary rd-btn--lg" onClick={onInvest}>Góp vốn</button>
    </div>
  )
}

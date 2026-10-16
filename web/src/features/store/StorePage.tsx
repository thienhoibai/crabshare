/* Cửa hàng (bản 1, nền sáng): lưới ảnh lớn, xem sản phẩm toàn màn hình, giỏ hàng trượt từ bên phải.
   UC25: dữ liệu lấy từ GET /api/listings (lọc loại cua / hạng / bảo quản / lô nguồn / khoảng giá, sắp xếp, phân trang) và GET /api/listings/{id}.
   Giỏ hàng lưu trên máy (shared/cart); bấm "Thanh toán" sang /thanh-toan để đặt đơn thật (UC26). */
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ChevronLeft, ChevronRight, Flag, Plus, X } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { small, vnd, type Product } from '../../shared/ui/kit/mock-data'
import { CartButton, CartDrawer, CartProvider, ProductView, Shell, Tabs, TopBar, isSoldOut, maxQty, useCart, useModalLock } from '../../shared/ui/kit/kit'
import { REASON_LABELS, type StorageType } from '../operator/listingsApi'
import {
  GRADES, formatDate, formatKg, toProduct, useStoreListing, useStoreListings,
  type CrabType, type PublicPriceRevision, type StoreSort,
} from './storeApi'
import './store.css'
import { useAuthStore } from '../../shared/auth/authStore'
import { useCartStore } from '../../shared/cart/cartStore'

function CustomerNavLinks() {
  const isCustomer = useAuthStore(s => s.user?.roles.some(r => r === 'Customer' || r === 'Investor'))
  if (!isCustomer) return null
  return (
    <>
      <a className="rd-btn rd-btn--ghost rd-btn--sm" href="/lich-su-don-hang">Đơn hàng của tôi</a>
      <a className="rd-btn rd-btn--ghost rd-btn--sm" href="/tai-khoan/dia-chi">Sổ địa chỉ</a>
    </>
  )
}
const PAGE_SIZE = 12

const KINDS = ['Tất cả', 'Cua thịt', 'Cua gạch', 'Cua lột'] as const
type Kind = (typeof KINDS)[number]
const KIND_TO_TYPE: Record<Kind, CrabType | undefined> = {
  'Tất cả': undefined,
  'Cua thịt': 'FatteningMudCrab',
  'Cua gạch': 'RoeCrab',
  'Cua lột': 'SoftShellCrab',
}

function Select<T extends string>({ label, value, onChange, options }: {
  label: string
  value: T
  onChange: (v: T) => void
  options: readonly { value: T; label: string }[]
}) {
  return (
    <label className="st-sort">
      <span className="st-sort__label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

const SORTS: { value: StoreSort; label: string }[] = [
  { value: 'Newest', label: 'Mới đăng' },
  { value: 'PriceAsc', label: 'Giá thấp trước' },
  { value: 'PriceDesc', label: 'Giá cao trước' },
]
const GRADE_OPTIONS = [{ value: '', label: 'Mọi hạng' }, ...GRADES.map((g) => ({ value: g.code, label: g.label }))]
const STORAGE_OPTIONS: { value: '' | StorageType; label: string }[] = [
  { value: '', label: 'Tươi và cấp đông' },
  { value: 'Fresh', label: 'Tươi' },
  { value: 'Frozen', label: 'Cấp đông' },
]

type RangeFilter = { batch: string; minPrice?: number; maxPrice?: number }
const NO_RANGE: RangeFilter = { batch: '' }
const MAX_PRICE = 100_000_000

const toPrice = (raw: string) => (raw.trim() === '' ? undefined : Number(raw))

/** Lọc theo lô nguồn và khoảng giá: gõ xong bấm Lọc (hoặc Enter) mới gọi API. */
function BatchPriceFilter({ value, onApply }: { value: RangeFilter; onApply: (v: RangeFilter) => void }) {
  const [batch, setBatch] = useState(value.batch)
  const [min, setMin] = useState(value.minPrice?.toString() ?? '')
  const [max, setMax] = useState(value.maxPrice?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const active = value.batch !== '' || value.minPrice !== undefined || value.maxPrice !== undefined

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const minPrice = toPrice(min)
    const maxPrice = toPrice(max)
    const invalid = (p?: number) => p !== undefined && (!Number.isInteger(p) || p < 1 || p > MAX_PRICE)
    if (invalid(minPrice) || invalid(maxPrice)) return setError('Giá phải là số nguyên từ 1 đến 100.000.000 đ/kg.')
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) return setError('Giá từ không được lớn hơn giá đến.')
    setError(null)
    onApply({ batch: batch.trim(), minPrice, maxPrice })
  }

  const clear = () => {
    setBatch(''); setMin(''); setMax(''); setError(null)
    onApply(NO_RANGE)
  }

  return (
    <form className="s1-range" onSubmit={submit} noValidate>
      <label className="s1-range__field">
        <span>Mã lô</span>
        <input value={batch} onChange={(e) => setBatch(e.target.value)} maxLength={20} placeholder="VD: L2701-01" autoComplete="off" />
      </label>
      <label className="s1-range__field">
        <span>Giá từ</span>
        <input type="number" inputMode="numeric" min={1} max={MAX_PRICE} step={1000} value={min} onChange={(e) => setMin(e.target.value)} placeholder="đ/kg" />
      </label>
      <label className="s1-range__field">
        <span>đến</span>
        <input type="number" inputMode="numeric" min={1} max={MAX_PRICE} step={1000} value={max} onChange={(e) => setMax(e.target.value)} placeholder="đ/kg" />
      </label>
      <button type="submit" className="rd-btn rd-btn--dark rd-btn--sm">Lọc</button>
      {active && <button type="button" className="rd-btn rd-btn--ghost rd-btn--sm" onClick={clear}>Bỏ lọc lô và giá</button>}
      {error && <p className="s1-range__error" role="alert">{error}</p>}
    </form>
  )
}

/** Khung chứa trang sản phẩm: toàn màn hình, tấm trượt từ dưới hoặc từ phải. */
function Panel({ kind, onClose, children }: { kind: 'full' | 'sheet' | 'side'; onClose: () => void; children: ReactNode }) {
  useModalLock(onClose)
  return (
    <div className={`st-panel st-panel--${kind}`} role="dialog" aria-modal="true" aria-label="Chi tiết sản phẩm">
      <div className="st-panel__scrim" onClick={onClose} />
      <div className="st-panel__box">
        <button type="button" className="rd-iconbtn st-panel__close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        <div className="st-panel__scroll">{children}</div>
      </div>
    </div>
  )
}

function CardV1({ p, onOpen }: { p: Product; onOpen: () => void }) {
  const cart = useCart()
  const max = maxQty(p)
  const soldOut = isSoldOut(p)
  return (
    <article className={`s1-card${soldOut ? ' is-soldout' : ''}`}>
      <div className="s1-card__frame">
        <button type="button" className="s1-card__media" onClick={onOpen} aria-label={`Xem ${p.name}`}>
          <img src={small(p.img)} alt="" loading="lazy" />
          <span className="s1-card__top">
            <span className="rd-chip rd-chip--solid">Lô {p.lot}</span>
            {soldOut ? <span className="rd-tag s1-out">Hết hàng</span> : p.stock < 10 ? <span className="rd-tag s1-low">Còn {formatKg(p.stock)} {p.unit}</span> : null}
          </span>
        </button>
        {max >= 1 && (
          <button type="button" className="rd-round s1-card__add" onClick={() => cart.add(p.id, 0, 1, p)} aria-label={`Thêm ${p.name} vào giỏ`}><Plus size={20} /></button>
        )}
      </div>
      <div className="s1-card__meta">
        <div>
          <h3>{p.name}</h3>
          {(p.ratingCount ?? 0) > 0 && (
            <span className="s1-rating">{p.averageStars?.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} sao · {p.ratingCount} đánh giá</span>
          )}
          <small>{p.sizes[0].label}</small>
        </div>
        <b>{vnd(p.sizes[0].price)}<small>/{p.unit}</small></b>
      </div>
    </article>
  )
}

function PriceHistory({ items }: { items: PublicPriceRevision[] }) {
  if (items.length === 0) return null
  return (
    <section className="s1-history">
      <h3>Lịch sử giá</h3>
      <p className="s1-history__hint">Người nuôi tự đặt giá. Mọi lần đổi giá đều được ghi lại và công khai.</p>
      <ul>
        {items.map((h) => (
          <li key={`${h.effectiveFrom}-${h.pricePerKg}`}>
            <span>{formatDate(h.effectiveFrom)}</span>
            <span>{REASON_LABELS[h.reason]}</span>
            <b>
              {h.previousPricePerKg !== null && <s>{vnd(h.previousPricePerKg)}</s>} {vnd(h.pricePerKg)}/kg
              {h.flaggedAbnormal && <span className="s1-history__flag" title="Giá lệch nhiều so với giao dịch tương đồng"><Flag size={12} /> Lệch thị trường</span>}
            </b>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ListingDetail({ id }: { id: number }) {
  const { data, isPending, error } = useStoreListing(id)
  if (isPending) return <p className="s1-state">Đang tải sản phẩm…</p>
  if (error) return <p className="s1-state">{errorMessage(error)}</p>
  const p = toProduct(data.listing, data)
  return (
    <div className="s1-detail">
      <ProductView key={id} p={p} />
      {data.sellUntil && <p className="s1-state">Hàng cấp đông, bán đến hết ngày {formatDate(data.sellUntil)}.</p>}
      <PriceHistory items={data.priceHistory} />
    </div>
  )
}

function StoreV1Inner() {
  const navigate = useNavigate()
  const { listingId } = useParams()
  const openId = listingId && /^\d+$/.test(listingId) ? Number(listingId) : null

  const [kind, setKind] = useState<Kind>('Tất cả')
  const [grade, setGrade] = useState('')
  const [storage, setStorage] = useState<'' | StorageType>('')
  const [range, setRange] = useState<RangeFilter>(NO_RANGE)
  const [sort, setSort] = useState<StoreSort>('Newest')
  const [page, setPage] = useState(1)

  const { data, isPending, isFetching, error } = useStoreListings({
    crabType: KIND_TO_TYPE[kind],
    grade: grade || undefined,
    storage: storage || undefined,
    batch: range.batch || undefined,
    minPrice: range.minPrice,
    maxPrice: range.maxPrice,
    sort,
    page,
    pageSize: PAGE_SIZE,
  })
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1) }

  return (
    <>
      <TopBar area="store" right={<><CustomerNavLinks /><CartButton /></>} />
      <main className="s1">
        <section className="s1-head">
          <p className="rd-eyebrow">Cửa hàng · hàng từ các lô đang bán</p>
          <h1 className="rd-display">Cua tươi,<br /><em>biết rõ từ lô nào.</em></h1>
          <div className="s1-bar">
            <Tabs items={KINDS} value={kind} onChange={filter(setKind)} />
            <div className="s1-filters">
              <Select label="Hạng" value={grade} onChange={filter(setGrade)} options={GRADE_OPTIONS} />
              <Select label="Bảo quản" value={storage} onChange={filter(setStorage)} options={STORAGE_OPTIONS} />
              <Select label="Sắp xếp" value={sort} onChange={filter(setSort)} options={SORTS} />
            </div>
          </div>
          <BatchPriceFilter value={range} onApply={filter(setRange)} />
        </section>

        {isPending ? <p className="s1-state">Đang tải sản phẩm…</p>
          : error ? <p className="s1-state">{errorMessage(error)}</p>
          : data.items.length === 0 ? <p className="s1-state">Chưa có sản phẩm phù hợp. Thử bỏ bớt bộ lọc.</p>
          : (
            <section className={`s1-grid${isFetching ? ' is-loading' : ''}`} aria-label="Sản phẩm">
              {data.items.map((l) => (
                <CardV1 key={l.listingId} p={toProduct(l)} onOpen={() => navigate(`/cua-hang/${l.listingId}`)} />
              ))}
            </section>
          )}

        {data && pages > 1 && (
          <nav className="s1-pager" aria-label="Phân trang">
            <button type="button" className="rd-btn rd-btn--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /> Trang trước</button>
            <span>Trang {page} / {pages}</span>
            <button type="button" className="rd-btn rd-btn--ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Trang sau <ChevronRight size={16} /></button>
          </nav>
        )}
      </main>
      {openId !== null && <Panel kind="full" onClose={() => navigate('/cua-hang')}><ListingDetail id={openId} /></Panel>}
      <CartDrawer onCheckout={() => navigate('/thanh-toan')} />
    </>
  )
}

export default function StorePage() {
  const lines = useCartStore((s) => s.lines)
  const setLines = useCartStore((s) => s.setLines)
  return (
    <Shell theme="light">
      <CartProvider store={{ lines, setLines }}><StoreV1Inner /></CartProvider>
    </Shell>
  )
}

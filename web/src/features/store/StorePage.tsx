/* Cửa hàng (bản 1, nền sáng): lưới ảnh lớn, xem sản phẩm toàn màn hình, giỏ hàng trượt từ bên phải.
   Dữ liệu đang lấy từ shared/ui/kit/mock-data.ts — task Catalog/Orders sẽ thay bằng API. */
import { Fragment, useState, type ReactNode } from 'react'
import { ArrowUpRight, Plus, X } from 'lucide-react'
import { IMG, KINDS, filterProducts, product, small, vnd, type KindFilter, type Product } from '../../shared/ui/kit/mock-data'
import { CartButton, CartDrawer, CartProvider, ProductView, Shell, Tabs, TopBar, useCart, useModalLock } from '../../shared/ui/kit/kit'
import './store.css'
import { useAuthStore } from '../../shared/auth/authStore'

type Sort = 'new' | 'asc' | 'desc'
function AddressBookLink() {
  const isCustomer = useAuthStore(s => s.user?.roles.includes('Customer'))
  return isCustomer ? <a className="rd-btn rd-btn--ghost rd-btn--sm" href="/tai-khoan/dia-chi">Sổ địa chỉ</a> : null
}
const sortProducts = (list: Product[], s: Sort) =>
  s === 'new' ? list : [...list].sort((a, b) => (s === 'asc' ? 1 : -1) * (a.sizes[0].price - b.sizes[0].price))

function SortSelect({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  return (
    <label className="st-sort">
      <span className="st-sort__label">Sắp xếp</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Sort)}>
        <option value="new">Mới thu</option>
        <option value="asc">Giá thấp trước</option>
        <option value="desc">Giá cao trước</option>
      </select>
    </label>
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
  return (
    <article className="s1-card">
      <div className="s1-card__frame">
      <button type="button" className="s1-card__media" onClick={onOpen} aria-label={`Xem ${p.name}`}>
        <img src={small(p.img)} alt="" loading="lazy" />
        <span className="s1-card__top">
          <span className="rd-chip rd-chip--solid">Lô {p.lot}</span>
          {p.preorder ? <span className="rd-tag rd-tag--accent">Đặt trước</span> : p.stock < 10 ? <span className="rd-tag s1-low">Còn {p.stock}</span> : null}
        </span>
      </button>
      <button type="button" className="rd-round s1-card__add" onClick={() => cart.add(p.id, 0)} aria-label={`Thêm ${p.name} vào giỏ`}><Plus size={20} /></button>
      </div>
      <div className="s1-card__meta">
        <div><h3>{p.name}</h3><small>{p.sizes[0].label}</small></div>
        <b>{vnd(p.sizes[0].price)}<small>/{p.unit}</small></b>
      </div>
    </article>
  )
}

function StoreV1Inner() {
  const [kind, setKind] = useState<KindFilter>('Tất cả')
  const [sort, setSort] = useState<Sort>('new')
  const [open, setOpen] = useState<string | null>(null)
  const list = sortProducts(filterProducts(kind), sort)
  return (
    <>
      <TopBar area="store" right={<><AddressBookLink /><CartButton /></>} />
      <main className="s1">
        <section className="s1-head">
          <p className="rd-eyebrow">Cửa hàng · hàng từ các lô đang bán</p>
          <h1 className="rd-display">Cua tươi,<br /><em>biết rõ từ lô nào.</em></h1>
          <div className="s1-bar">
            <Tabs items={KINDS} value={kind} onChange={setKind} />
            <SortSelect value={sort} onChange={setSort} />
          </div>
        </section>
        <section className="s1-grid" aria-label="Sản phẩm">
          {list.map((p, i) => (
            <Fragment key={p.id}>
              {i === 4 && kind === 'Tất cả' && (
                <button type="button" className="s1-band" onClick={() => setOpen('pre')}>
                  <img src={small(IMG.bound, 1200)} alt="" loading="lazy" />
                  <span className="s1-band__text">
                    <span className="rd-eyebrow">Lô L2612-02 · thu hoạch 20/12</span>
                    <b>Đặt trước, chỉ cọc 15%.</b>
                  </span>
                  <span className="rd-round"><ArrowUpRight size={20} /></span>
                </button>
              )}
              <CardV1 p={p} onOpen={() => setOpen(p.id)} />
            </Fragment>
          ))}
        </section>
      </main>
      {open && <Panel kind="full" onClose={() => setOpen(null)}><ProductView p={product(open)} /></Panel>}
      <CartDrawer />
    </>
  )
}

export default function StorePage() {
  return (
    <Shell theme="light">
      <CartProvider><StoreV1Inner /></CartProvider>
    </Shell>
  )
}

/* UC26 — Thanh toán: chọn địa chỉ giao hàng (sổ địa chỉ KH-03), xem giỏ theo lô, đặt hàng (POST /api/orders/checkout).
   Đặt thành công thì hàng được giữ 15 phút và sang trang xác nhận để chuyển khoản. */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, AlertTriangle, Clock, Landmark, MapPin, ShoppingBag, Trash2, Truck } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { useCartStore } from '../../shared/cart/cartStore'
import { small, vnd } from '../../shared/ui/kit/mock-data'
import { Qty, Shell, TopBar, cartTotals, lineProduct, maxQty } from '../../shared/ui/kit/kit'
import { useAddresses, type DeliveryAddress } from '../accounts/paymentProfilesApi'
import { orderableLines, toCheckoutLines, useCheckout, useLastCheckout } from './ordersApi'
import './checkout.css'

function AddressPicker({ value, onChange }: { value: number | null; onChange: (id: number) => void }) {
  const query = useAddresses()
  if (query.isPending) return <p role="status" className="rd-muted">Đang tải sổ địa chỉ…</p>
  if (query.isError) return <p role="alert" className="co-error">{errorMessage(query.error)}</p>
  if (query.data.length === 0) {
    return (
      <div className="co-empty-address">
        <MapPin size={22} />
        <p>Bạn chưa có địa chỉ giao hàng.</p>
        <Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/tai-khoan/dia-chi">Thêm địa chỉ</Link>
      </div>
    )
  }
  return (
    <div className="co-addresses" role="radiogroup" aria-label="Địa chỉ giao hàng">
      {query.data.map((a: DeliveryAddress) => (
        <button key={a.addressId} type="button" role="radio" aria-checked={value === a.addressId}
          className={`rd-option${value === a.addressId ? ' is-on' : ''}`} onClick={() => onChange(a.addressId)}>
          <span className="rd-option__dot" />
          <span>
            <b>{a.recipientName} · {a.recipientPhone}{a.isDefault && <em className="co-default">Mặc định</em>}</b>
            <small>{a.addressLine}, {a.province}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

/** Địa chỉ đang chọn: khách chọn tay, nếu không thì địa chỉ mặc định, nếu không thì địa chỉ đầu tiên. */
function useChosenAddress() {
  const { data } = useAddresses()
  const [picked, setPicked] = useState<number | null>(null)
  const chosen = data?.find((a) => a.addressId === picked) ?? data?.find((a) => a.isDefault) ?? data?.[0]
  return [chosen?.addressId ?? null, setPicked] as const
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.userId)
  const allLines = useCartStore((s) => s.lines)
  const setQty = useCartStore((s) => s.setQty)
  const clearCart = useCartStore((s) => s.clear)
  const lines = useMemo(() => orderableLines(allLines), [allLines])
  const totals = useMemo(() => cartTotals(lines), [lines])
  const [addressId, setAddressId] = useChosenAddress()
  const checkout = useCheckout()
  const saveResult = useLastCheckout((s) => s.save)
  const hasLastOrder = useLastCheckout((s) => s.userId === userId && !!s.result)

  const place = () => {
    if (!addressId || !userId || checkout.isPending) return
    checkout.mutate({ lines: toCheckoutLines(lines), addressId }, {
      onSuccess: (result) => {
        saveResult(userId, result)
        clearCart()
        navigate('/xac-nhan-don-hang', { replace: true })
      },
    })
  }

  return (
    <Shell theme="light">
      <TopBar area="store" right={<Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/cua-hang"><ArrowLeft size={16} />Tiếp tục mua</Link>} />
      <main className="co">
        <header className="co-head">
          <p className="rd-eyebrow">Đặt hàng</p>
          <h1 className="rd-h2">Thanh toán</h1>
        </header>

        {lines.length === 0 ? (
          <section className="co-card rd-empty">
            <ShoppingBag size={32} />
            <p>Giỏ hàng đang trống.</p>
            <Link className="rd-btn rd-btn--primary" to="/cua-hang">Xem hàng đang bán</Link>
            {hasLastOrder && <Link className="rd-btn rd-btn--ghost" to="/xac-nhan-don-hang">Xem đơn vừa đặt</Link>}
          </section>
        ) : (
          <div className="co-layout">
            <div className="co-main">
              <section className="co-card" aria-labelledby="co-address">
                <div className="co-card__head">
                  <h2 id="co-address" className="rd-h3">Giao đến</h2>
                  <Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/tai-khoan/dia-chi">Sổ địa chỉ</Link>
                </div>
                <AddressPicker value={addressId} onChange={setAddressId} />
              </section>

              <section className="co-card" aria-labelledby="co-items">
                <div className="co-card__head">
                  <h2 id="co-items" className="rd-h3">Hàng trong giỏ</h2>
                  {totals.groups.length > 1 && <span className="rd-muted">{totals.groups.length} lô · {totals.groups.length} đơn</span>}
                </div>
                {totals.groups.map((g) => (
                  <section key={g.lot} className="rd-cartgroup" aria-label={`Lô ${g.lot}`}>
                    <p className="rd-cartgroup__head"><span>Lô {g.lot}</span><span>{lineProduct(g.lines[0]).farm}</span></p>
                    {g.lines.map((l) => {
                      const p = lineProduct(l)
                      return (
                        <div key={`${l.id}-${l.size}`} className="rd-cartline co-line">
                          <img src={small(p.img, 200)} alt="" />
                          <div className="rd-cartline__info">
                            <b>{p.name}</b>
                            <small>{p.sizes[l.size].label} · {vnd(p.sizes[l.size].price)}/{p.unit}</small>
                            <Qty small value={l.qty} max={Math.max(l.qty, maxQty(p))} onChange={(v) => setQty(l.id, l.size, v)} />
                          </div>
                          <div className="co-line__end">
                            <span className="rd-cartline__price">{vnd(p.sizes[l.size].price * l.qty)}</span>
                            <button type="button" className="rd-iconbtn" onClick={() => setQty(l.id, l.size, 0)} aria-label={`Bỏ ${p.name} khỏi giỏ`}><Trash2 size={16} /></button>
                          </div>
                        </div>
                      )
                    })}
                  </section>
                ))}
              </section>
            </div>

            <aside className="co-card co-summary" aria-label="Tóm tắt đơn hàng">
              <h2 className="rd-h3">Tóm tắt</h2>
              <dl className="rd-sum">
                <dt>Tạm tính ({totals.count} kg)</dt><dd>{vnd(totals.subtotal)}</dd>
                <dt className="rd-sum__total">Tổng thanh toán</dt><dd className="rd-sum__total">{vnd(totals.subtotal)}</dd>
              </dl>
              <p className="rd-note"><Landmark size={14} /> Chuyển khoản VietQR vào tài khoản riêng của từng lô. Không thu tiền khi nhận hàng.</p>
              <p className="rd-note"><Clock size={14} /> Đặt xong, hàng được giữ 15 phút để bạn chuyển khoản.</p>
              {totals.groups.length > 1 && <p className="rd-note"><Truck size={14} /> Hàng từ {totals.groups.length} lô sẽ tạo {totals.groups.length} đơn, mỗi đơn một mã QR.</p>}
              {checkout.isError && (
                <div role="alert" className="p-3.5 my-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-xs sm:text-sm font-medium flex items-start gap-2.5">
                  <AlertTriangle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Không thể hoàn tất đặt hàng</p>
                    <p className="mt-0.5 text-rose-700">{errorMessage(checkout.error)}</p>
                  </div>
                </div>
              )}
              <button type="button" className="rd-btn rd-btn--primary rd-btn--block rd-btn--lg" disabled={!addressId || checkout.isPending} onClick={place}>
                {checkout.isPending ? 'Đang đặt hàng…' : `Đặt hàng · ${vnd(totals.subtotal)}`}
              </button>
            </aside>
          </div>
        )}
      </main>
    </Shell>
  )
}

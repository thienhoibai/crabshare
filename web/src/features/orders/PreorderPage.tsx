import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, MapPin } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { vnd } from '../../shared/ui/kit/mock-data'
import { Qty, Shell, TopBar } from '../../shared/ui/kit/kit'
import { useAddresses, type DeliveryAddress } from '../accounts/paymentProfilesApi'
import { formatKg, useStoreListing } from '../store/storeApi'
import { useLastPreorder, usePlacePreorder } from './preordersApi'
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

function useChosenAddress() {
  const { data } = useAddresses()
  const [picked, setPicked] = useState<number | null>(null)
  const chosen = data?.find((a) => a.addressId === picked) ?? data?.find((a) => a.isDefault) ?? data?.[0]
  return [chosen?.addressId ?? null, setPicked] as const
}

export default function PreorderPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.userId)
  const listingId = Number(useParams().listingId)
  const validId = Number.isInteger(listingId) && listingId > 0 ? listingId : null
  const { data, isPending, error } = useStoreListing(validId)
  const [qty, setQty] = useState(1)
  const [addressId, setAddressId] = useChosenAddress()
  const place = usePlacePreorder()
  const save = useLastPreorder((s) => s.save)

  const listing = data?.listing
  const pct = listing?.depositPct ?? 15
  const remaining = listing?.remainingPreorderKg ?? 0
  const max = Math.max(0, Math.floor(remaining))
  const total = listing ? listing.pricePerKg * qty : 0
  const deposit = Math.round(total * pct / 100)

  const submit = () => {
    if (!validId || !addressId || !userId || place.isPending || max < 1) return
    place.mutate({ listingId: validId, quantityKg: qty, addressId }, {
      onSuccess: (result) => {
        save(userId, result)
        navigate('/xac-nhan-dat-truoc')
      },
    })
  }

  const blocked = listing && !listing.isPreorder

  return (
    <Shell theme="light">
      <TopBar area="store" right={<Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/cua-hang">Về cửa hàng</Link>} />
      <main className="co">
        <header className="co-head">
          <Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/cua-hang"><ArrowLeft size={16} /> Cửa hàng</Link>
          <p className="rd-eyebrow">Đặt trước · cọc {pct}%</p>
          <h1 className="rd-h2">Đặt trước cua đang nuôi</h1>
        </header>

        {!validId ? <p className="co-error" role="alert">Thiếu mã niêm yết.</p>
          : isPending ? <p className="rd-muted">Đang tải…</p>
          : error ? <p className="co-error" role="alert">{errorMessage(error)}</p>
          : !listing ? <p className="co-error" role="alert">Không tìm thấy sản phẩm.</p>
          : blocked ? (
            <section className="co-card">
              <p>Niêm yết này đang bán lẻ, không đặt trước. Thêm vào giỏ trên cửa hàng.</p>
              <Link className="rd-btn rd-btn--primary" to={`/cua-hang/${listing.listingId}`}>Mở cửa hàng</Link>
            </section>
          ) : (
            <div className="co-grid">
              <section className="co-card">
                <h2 className="rd-h3">{listing.title}</h2>
                <p className="rd-muted">Lô {listing.batchCode} · {listing.farmName} · còn {formatKg(remaining)} kg theo trần cam kết</p>
                <label className="po-qty">
                  Số kg
                  <Qty value={qty} max={Math.max(1, max)} onChange={(v) => setQty(Math.min(Math.max(1, v), Math.max(1, max)))} />
                </label>
                <h3 className="rd-h3">Giao đến</h3>
                <AddressPicker value={addressId} onChange={setAddressId} />
              </section>
              <aside className="co-card">
                <dl className="rd-sum">
                  <dt>Tạm tính ({qty} kg)</dt><dd>{vnd(total)}</dd>
                  <dt>Cọc {pct}%</dt><dd>{vnd(deposit)}</dd>
                  <dt className="rd-sum__total">Thanh toán hôm nay</dt><dd className="rd-sum__total">{vnd(deposit)}</dd>
                </dl>
                <p className="rd-muted">Phần còn lại {vnd(total - deposit)} thu khi lô thu hoạch.</p>
                {place.isError && <p className="co-error" role="alert">{errorMessage(place.error)}</p>}
                <button type="button" className="rd-btn rd-btn--primary rd-btn--block rd-btn--lg"
                  disabled={!addressId || place.isPending || max < 1} onClick={submit}>
                  {place.isPending ? 'Đang đặt trước…' : max < 1 ? 'Hết suất đặt trước' : `Đặt trước · cọc ${vnd(deposit)}`}
                </button>
              </aside>
            </div>
          )}
      </main>
    </Shell>
  )
}

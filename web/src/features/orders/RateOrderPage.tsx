/* UC34 — Đánh giá một lần cho cả đơn đã hoàn tất (NH-12). */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PackageSearch, Star } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import { vnd } from '../../shared/ui/kit/mock-data'
import { Shell, TopBar } from '../../shared/ui/kit/kit'
import { formatKg } from '../store/storeApi'
import { useOrderTracking } from './orderTrackingApi'
import { useOrderRating, useSubmitRating } from './rateOrderApi'
import './checkout.css'
import './rate.css'

function Lookup() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const go = (e: FormEvent) => {
    e.preventDefault()
    const code = value.trim().toUpperCase()
    if (code) navigate(`/danh-gia-don-hang/${code}`)
  }
  return (
    <section className="co-card">
      <h2 className="rd-h3">Nhập mã đơn</h2>
      <p className="rd-muted">Nhập mã đơn đã hoàn tất để gửi đánh giá chất lượng.</p>
      <form className="ot-lookup" onSubmit={go}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="VD: OD7K2M9QX4R1T" aria-label="Mã đơn hàng" autoCapitalize="characters" />
        <button type="submit" className="rd-btn rd-btn--primary" disabled={!value.trim()}>Mở đơn</button>
      </form>
      <p className="rd-muted">Hoặc mở <Link to="/lich-su-don-hang">lịch sử đơn hàng</Link> rồi chọn đơn.</p>
    </section>
  )
}

function RateOrderDetail({ code }: { code: string }) {
  const orderQuery = useOrderTracking(code)
  const ratingQuery = useOrderRating(code)
  const submit = useSubmitRating(code)
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')

  if (orderQuery.isPending || ratingQuery.isPending) {
    return <p role="status" className="rd-muted">Đang tải đơn…</p>
  }

  if (orderQuery.isError) {
    return (
      <section className="co-card rd-empty">
        <PackageSearch size={32} />
        <p role="alert">{errorMessage(orderQuery.error)}</p>
        <Link className="rd-btn rd-btn--ghost" to="/lich-su-don-hang">Về lịch sử đơn</Link>
      </section>
    )
  }

  if (ratingQuery.isError) {
    return (
      <section className="co-card rd-empty">
        <PackageSearch size={32} />
        <p role="alert">{errorMessage(ratingQuery.error)}</p>
        <Link className="rd-btn rd-btn--ghost" to={`/theo-doi-don-hang/${code}`}>Về đơn hàng</Link>
      </section>
    )
  }

  const order = orderQuery.data
  const ratingView = ratingQuery.data

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (submit.isPending) return
    submit.mutate({ stars, comment })
  }

  return (
    <article className="co-card rv-card" aria-label={`Đánh giá đơn ${order.orderNo}`}>
      <header className="co-card__head">
        <div>
          <p className="rd-eyebrow">Lô {order.batchCode} · {order.farmName}</p>
          <h2 className="rd-h3">Đơn {order.orderNo}</h2>
          <p className="rd-muted">Đặt lúc {formatDateTime(order.placedAt)}</p>
        </div>
        <Link className="rd-btn rd-btn--ghost rd-btn--sm" to={`/theo-doi-don-hang/${code}`}>Về đơn hàng</Link>
      </header>

      <ul className="co-order__lines">
        {order.lines.map((l) => (
          <li key={l.listingId}>
            <span>{l.title}<small>{l.gradeName} · {formatKg(l.quantityKg)} kg × {vnd(l.unitPrice)}</small></span>
            <b>{vnd(l.amount)}</b>
          </li>
        ))}
      </ul>

      {ratingView.rating ? (
        <section className="rv-done" role="status">
          <p className="rv-done__title">Bạn đã đánh giá {ratingView.rating.stars} sao</p>
          {ratingView.rating.comment && <p className="rv-done__comment">{ratingView.rating.comment}</p>}
          <p className="rd-muted">{formatDateTime(ratingView.rating.createdAt)}</p>
        </section>
      ) : ratingView.canRate ? (
        <form className="rv-form" onSubmit={onSubmit}>
          <div className="rv-stars" role="group" aria-label="Chọn số sao">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} sao`}
                aria-pressed={stars === n}
                className={`rv-star ${n <= stars ? 'is-on' : ''}`}
                onClick={() => setStars(n)}
              >
                <Star size={22} />
                <span>{n}</span>
              </button>
            ))}
          </div>
          <label className="rv-field">
            <span>Nhận xét (tuỳ chọn, tối đa 500 ký tự)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Chia sẻ trải nghiệm về chất lượng cua và quy cách đóng gói…"
            />
          </label>
          {submit.isError && <p className="co-error" role="alert">{errorMessage(submit.error)}</p>}
          <div className="rv-actions">
            <button type="submit" className="rd-btn rd-btn--primary" disabled={submit.isPending}>
              {submit.isPending ? 'Đang gửi…' : 'Gửi đánh giá'}
            </button>
          </div>
        </form>
      ) : (
        <p className="rd-note" role="status">
          {order.status !== 'Completed' ? 'Chỉ đánh giá được khi đơn đã hoàn tất.' : 'Đơn này không đánh giá được.'}
        </p>
      )}
    </article>
  )
}

export default function RateOrderPage() {
  const { orderNo } = useParams()
  const code = orderNo?.trim().toUpperCase()
  return (
    <Shell theme="light">
      <TopBar area="store" right={<Link className="rd-btn rd-btn--ghost rd-btn--sm" to="/lich-su-don-hang">Lịch sử đơn</Link>} />
      <main className="co">
        <header className="co-head">
          <p className="rd-eyebrow">Đánh giá mua hàng</p>
          <h1 className="rd-h2">{code ? `Đánh giá đơn ${code}` : 'Đánh giá đơn hàng'}</h1>
        </header>
        {code ? <RateOrderDetail code={code} /> : <Lookup />}
      </main>
    </Shell>
  )
}

/* Chào giá cua, kiểu "lịch có cua": mỗi lô một hàng. Bên trái là lô và trại nuôi, giữa là thanh thời gian
   từ lúc thả nuôi tới ngày dự kiến có cua (vạch cam là hôm nay), bên phải là giá từng quy cách và nút đặt mua.
   Số còn đặt chỉ lấy từ availability; thiếu dữ liệu thì để trống, không đoán. */
import { useState } from 'react'
import { ArrowRight, Star } from 'lucide-react'
import type { LandingBatch, LandingWholesaleRow } from './LandingBatches'
import { Avatar } from './LandingFarmProfiles'
import { formatDate, formatVnd } from '../../shared/lib/format'
import './wholesale-board.css'

const TYPES: Record<string, string> = {
  FatteningMudCrab: 'Cua thịt vỗ béo', RoeCrab: 'Cua gạch',
  YoungFemaleCrab: 'Cua cái non', OilRoeCrab: 'Cua gạch dầu',
}
const SHOWN = 6
const DAY = 86_400_000
const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
const decimal = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)
const href = (code: string) => `/lo/${encodeURIComponent(code)}`
const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY)
const dayMonth = (ms: number) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'numeric' }).format(new Date(ms))

interface SaleLot {
  batch: LandingBatch
  rows: LandingWholesaleRow[]
  accepting: boolean
  /** Còn nhận đặt và chưa hết mọi quy cách. */
  orderable: boolean
  depositRatePct: number | null
  daysRaised: number | null
  readyDate: string | null
}
/** Khoảng nuôi trên trục thời gian: từ lúc thả nuôi (thật hoặc dự kiến) tới ngày có cua. */
interface Span { start: number; end: number; raised: number | null }

function toLots(rows: LandingWholesaleRow[]): SaleLot[] {
  const byLot = new Map<string, LandingWholesaleRow[]>()
  for (const row of rows) {
    const lot = byLot.get(row.batch.batchCode)
    if (lot) lot.push(row)
    else byLot.set(row.batch.batchCode, [row])
  }
  return [...byLot.values()]
    .map((lotRows): SaleLot => {
      const [{ batch, acceptingPreorders, depositRatePct, daysRaised, readyDate }] = lotRows
      return {
        batch, rows: lotRows, accepting: acceptingPreorders, depositRatePct, daysRaised, readyDate,
        orderable: acceptingPreorders && lotRows.some((r) => r.remaining !== 0),
      }
    })
    .sort((a, b) => time(a.readyDate) - time(b.readyDate) || Number(b.orderable) - Number(a.orderable) || a.batch.batchCode.localeCompare(b.batch.batchCode))
}

function spanOf(lot: SaleLot, now: number): Span | null {
  const { batch, daysRaised, readyDate } = lot
  if (batch.status === 'Selling') return null
  const end = readyDate ? Date.parse(readyDate) : null
  if (daysRaised !== null) {
    const start = now - daysRaised * DAY
    return { start, end: end ?? (batch.holdingDays !== null ? start + batch.holdingDays * DAY : now), raised: daysRaised }
  }
  if (batch.expectedReceiptDate && end !== null) return { start: Date.parse(batch.expectedReceiptDate), end, raised: null }
  return null
}

/** Dòng chữ dưới thanh thời gian: đã nuôi bao nhiêu ngày, hoặc ngày dự kiến có cua. */
function timingText(lot: SaleLot) {
  const { batch, daysRaised, readyDate } = lot
  const total = batch.holdingDays
  if (daysRaised !== null) {
    const done = total !== null && daysRaised >= total
    const rest = [done ? 'Đã đủ ngày nuôi' : readyDate && `Dự kiến có cua ${formatDate(readyDate)}`, batch.status === 'Harvesting' && 'đang thu hoạch'].filter(Boolean)
    return <>Đã nuôi <b>{number(daysRaised)}</b>{total !== null ? ` / ${number(total)} ngày` : ' ngày'}{rest.map((part) => <span key={String(part)}> · {part}</span>)}</>
  }
  if (batch.status === 'Selling') return <>Đã thu hoạch · <b>đang bán</b></>
  if (readyDate) return <>Chưa thả nuôi · Dự kiến có cua <b>{formatDate(readyDate)}</b></>
  return <>Chưa chốt ngày có cua</>
}

function Who({ lot }: { lot: SaleLot }) {
  const { batch, accepting, orderable } = lot
  const farm = batch.publicFarm
  const farmName = farm?.name ?? batch.publicOperatorName
  const type = batch.crabType ? TYPES[batch.crabType] : undefined
  const state = !accepting ? 'Đã đóng đặt trước' : orderable ? 'Nhận đặt trước' : 'Hết cua đặt trước'
  const rated = farm?.ratingAverage !== undefined && !!farm.ratingCount
  return <div className="wb-who">
    <Avatar name={farm?.ownerName} photo={farm?.ownerPhotoUrl} size="sm" />
    <div className="wb-who__text">
      <p className="wb-who__meta">{type && <span className="wb-type">{type}</span>}<span className={orderable ? 'wb-state is-open' : 'wb-state'}>{state}</span></p>
      <h3><a href={href(batch.batchCode)}>{batch.title}</a></h3>
      {farmName && <p className="wb-who__farm">
        <span>{farmName}{farm?.ownerName && ` · ${farm.ownerName}`}</span>
        {rated && <span className="wb-rate" aria-label={`Khách mua đánh giá ${decimal(farm!.ratingAverage!)} sao`}><Star aria-hidden="true" />{decimal(farm!.ratingAverage!)}</span>}
      </p>}
    </div>
  </div>
}

function LotRow({ lot, span, pos, now, ticks }: { lot: SaleLot; span: Span | null; pos: ((t: number) => number) | null; now: number; ticks: number[] }) {
  const { batch, rows, accepting, orderable, depositRatePct } = lot
  const action = orderable ? 'Đặt mua' : 'Xem lô'
  const left = span && pos ? pos(span.start) : 0
  const right = span && pos ? pos(span.end) : 0
  const filled = span && span.raised !== null && span.end > span.start ? Math.min(100, Math.max(0, ((now - span.start) / (span.end - span.start)) * 100)) : 0
  return <article className="wb-card" data-batch-code={batch.batchCode} aria-label={`Giá cua lô ${batch.batchCode}`}>
    <Who lot={lot} />
    <div className="wb-plan">
      {span && pos && <div className="wb-track" aria-hidden="true">
        {ticks.map((t) => <span key={t} className="wb-track__tick" style={{ left: `${pos(t)}%` }} />)}
        <span className="wb-track__today" style={{ left: `${pos(now)}%` }} />
        <span className={span.raised === null ? 'wb-bar is-planned' : 'wb-bar'} style={{ left: `${left}%`, width: `${Math.max(1.5, right - left)}%` }}>
          {span.raised !== null && <i style={{ width: `${filled}%` }} />}
        </span>
        <span className={right > 78 ? 'wb-track__end is-flip' : 'wb-track__end'} style={{ left: `${right}%` }}>Có cua {dayMonth(span.end)}</span>
      </div>}
      <p className="wb-time">{timingText(lot)}</p>
    </div>
    <div className="wb-offer">
      <ul className="wb-specs">
        {rows.map(({ offer, remaining }) => <li key={offer.specCode} data-spec-code={offer.specCode}>
          {offer.sizeCode && <span className="wb-size" aria-label={`Cỡ ${offer.sizeCode}`}>{offer.sizeCode}</span>}
          <span className="wb-spec">
            <b>{offer.specName}</b>
            {accepting && <small className={remaining === 0 ? 'is-out' : undefined}>
              {remaining === 0 ? 'Hết quy cách này' : remaining !== null ? `Còn ${number(remaining)} con` : 'Chưa công bố số còn'}
            </small>}
          </span>
          <span className="wb-price"><b>{formatVnd(offer.pricePerKg)}</b><small>/ kg</small></span>
        </li>)}
      </ul>
      <div className="wb-card__foot">
        {/* P preorders close at FundingDeadline in PreorderService. */}
        {accepting && <p>
          {depositRatePct !== null && <span>Cọc {number(depositRatePct)}%</span>}
          {batch.fundingDeadline && <span>Đặt trước đến {formatDate(batch.fundingDeadline)}</span>}
        </p>}
        <a className={orderable ? 'wb-buy' : 'wb-buy is-quiet'} href={href(batch.batchCode)} aria-label={`${action}: ${batch.title}`}>
          {action}<ArrowRight aria-hidden="true" />
        </a>
      </div>
    </div>
  </article>
}

/** Mốc đầu tháng nằm trong trục, để kẻ vạch và ghi "Th12", "Th1". */
function monthTicks(from: number, to: number) {
  const ticks: number[] = []
  const d = new Date(from)
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  while (t < to && ticks.length < 12) {
    ticks.push(t)
    const n = new Date(t)
    t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)
  }
  return ticks
}

export default function WholesaleBoard({ rows }: { rows: LandingWholesaleRow[] }) {
  const [type, setType] = useState('all')
  const [now] = useState(() => Date.now())
  if (!rows.length) return null
  const types = [...new Set(rows.map(({ batch }) => batch.crabType).filter((value): value is string => !!value && !!TYPES[value]))]
  const selected = types.includes(type) ? type : 'all'
  const allLots = toLots(selected === 'all' ? rows : rows.filter(({ batch }) => batch.crabType === selected))
  const lots = allLots.slice(0, SHOWN)
  const spans = lots.map((lot) => spanOf(lot, now))
  const known = spans.filter((s): s is Span => !!s)
  const from = known.length ? Math.min(now, ...known.map((s) => s.start)) - 4 * DAY : 0
  const to = known.length ? Math.max(now, ...known.map((s) => s.end)) + 6 * DAY : 0
  const pos = known.length ? (t: number) => ((t - from) / (to - from)) * 100 : null
  const ticks = pos ? monthTicks(from, to) : []
  return <section className="wb" id="gia-si" aria-labelledby="wb-title">
    <div className="ld-wrap">
      <header className="wb-heading">
        <div>
          <p className="wb-eyebrow">Chào giá cua</p>
          <h2 id="wb-title">Cua nào <em>sắp tới ngày?</em></h2>
        </div>
        <ul className="wb-legend" aria-label="Chú thích">
          <li><i className="is-raised" />Đã nuôi</li>
          <li><i className="is-left" />Còn lại</li>
          <li><i className="is-plan" />Chưa thả nuôi</li>
          <li><i className="is-today" />Hôm nay</li>
        </ul>
      </header>
      {types.length > 1 && <div className="wb-filters" role="group" aria-label="Lọc loại cua">
        <button type="button" aria-pressed={selected === 'all'} onClick={() => setType('all')}>Tất cả</button>
        {types.map((value) => <button type="button" key={value} aria-pressed={selected === value} onClick={() => setType(value)}>{TYPES[value]}</button>)}
      </div>}
      <div className="wb-board">
        {pos && <div className="wb-axis" aria-hidden="true">
          <span>Lô và trại nuôi</span>
          <div className="wb-axis__scale">
            {ticks.filter((t) => Math.abs(pos(t) - pos(now)) > 7).map((t) => <span key={t} style={{ left: `${pos(t)}%` }}>Th{new Date(t).getUTCMonth() + 1}</span>)}
            <b style={{ left: `${pos(now)}%` }}>Hôm nay</b>
          </div>
          <span>Giá mỗi kg</span>
        </div>}
        {lots.map((lot, i) => <LotRow key={lot.batch.batchCode} lot={lot} span={spans[i]} pos={pos} now={now} ticks={ticks} />)}
      </div>
      <footer className="wb-foot">
        <p>Giá do người nuôi chào, khóa khi lô được duyệt. Các quy cách trong một lô dùng chung số cua còn lại.</p>
        {allLots.length > SHOWN && <a href="/lo">Xem cả {number(allLots.length)} lô <ArrowRight aria-hidden="true" /></a>}
      </footer>
    </div>
  </section>
}

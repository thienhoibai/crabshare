/* Giới thiệu hộ nuôi trên trang chủ: bản đồ vệ tinh có ghim từng trại (rê chuột hoặc chạm vào ghim để xem thông tin)
   và mục thành tích của từng trại. Chỉ dùng hồ sơ trại mà backend công bố (publicFarm, trại đã đồng ý công khai);
   tên pháp nhân không bao giờ bị biến thành tên hay vị trí trại. Thiếu số nào thì ẩn số đó.
   Bản đồ tự dựng từ ô ảnh vệ tinh (không thêm thư viện, không iframe); ô ảnh là ảnh nền nên lỗi mạng chỉ làm mất nền,
   ghim và thông tin vẫn dùng được. */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, MapPin, Sprout, Star } from 'lucide-react'
import type { LandingBatch, LandingBatchesData, LandingProductionGroup, LandingPublicFarm } from './LandingBatches'
import './farm-profiles.css'

/* ---------- hình đại diện chủ trại ---------- */
/** Chữ cái đầu của hai chữ cuối trong tên, như hình đại diện người dùng trong web (ConsoleLayout). */
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase()
const TONES = ['#4a6440', '#a43514', '#2f6f7a', '#8a5a1f', '#5b4a8a', '#3d7a52']
const toneOf = (seed: string) => TONES[[...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length]

/**
 * Ảnh đại diện của chủ trại nếu trại đã công bố; nếu không thì vòng tròn chữ cái đầu của họ tên.
 * Trại chưa công bố chủ trại thì hiện biểu tượng trại, không dựng mặt người.
 */
export function Avatar({ name, photo, size = 'md' }: { name?: string; photo?: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  const cls = `lfp-avatar lfp-avatar--${size}`
  if (photo && !failed) return <img className={cls} src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
  if (!name) return <span className={`${cls} is-farm`} aria-hidden="true"><Sprout /></span>
  return <span className={cls} style={{ '--tone': toneOf(name) } as CSSProperties} aria-hidden="true">{initials(name)}</span>
}

const fmt = (value: number, digits = 1) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value)
const href = (code: string) => `/lo/${encodeURIComponent(code)}`
const place = (f: LandingPublicFarm) => [f.commune, f.district, f.province].filter(Boolean).join(', ')
/** Khối lượng: từ 1.000 kg trở lên ghi theo tấn. */
const weight = (kg: number) => (kg >= 1000 ? `${fmt(kg / 1000)} tấn` : `${fmt(kg)} kg`)

/** Năm ngôi sao tô theo điểm, cùng điểm số và số lượt. Không ghi dạng "x / 5". */
function Stars({ average, count }: { average: number; count: number }) {
  return (
    <span className="lfp-stars">
      <span className="lfp-stars__icons" aria-hidden="true">
        <span className="lfp-stars__base">{[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}</span>
        <span className="lfp-stars__fill" style={{ width: `${(average / 5) * 100}%` }}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}</span>
      </span>
      <b>{fmt(average)}</b>
      <small>{fmt(count, 0)} lượt đánh giá</small>
    </span>
  )
}

/* ---------- bản đồ ---------- */
const TILE = 256
const TILE_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
function project(lat: number, lng: number, z: number) {
  const size = TILE * 2 ** z
  const rad = (lat * Math.PI) / 180
  return { x: ((lng + 180) / 360) * size, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * size }
}
type Located = { farm: LandingPublicFarm & { latitude: number; longitude: number }; batches: LandingBatch[] }

/** Chọn mức phóng to lớn nhất mà mọi ghim vẫn nằm gọn trong khung, rồi tính ô ảnh và vị trí ghim. */
function useMapLayout(farms: Located[], width: number, height: number) {
  return useMemo(() => {
    if (!width || !height || !farms.length) return null
    const pad = 70
    let zoom = 6
    for (let z = farms.length === 1 ? 11 : 13; z >= 6; z--) {
      const ps = farms.map((f) => project(f.farm.latitude, f.farm.longitude, z))
      const spanX = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x))
      const spanY = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y))
      if (spanX <= width - pad * 2 && spanY <= height - pad * 2) { zoom = z; break }
    }
    const ps = farms.map((f) => project(f.farm.latitude, f.farm.longitude, zoom))
    const cx = (Math.max(...ps.map((p) => p.x)) + Math.min(...ps.map((p) => p.x))) / 2
    const cy = (Math.max(...ps.map((p) => p.y)) + Math.min(...ps.map((p) => p.y))) / 2
    const left = cx - width / 2
    const top = cy - height / 2
    const tiles: { key: string; url: string; x: number; y: number }[] = []
    const max = 2 ** zoom
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++)
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++)
        if (ty >= 0 && ty < max) tiles.push({ key: `${zoom}/${tx}/${ty}`, url: TILE_URL(zoom, ((tx % max) + max) % max, ty), x: tx * TILE - left, y: ty * TILE - top })
    const pins = farms.map((f, i) => ({ id: f.farm.id, x: ps[i].x - left, y: ps[i].y - top }))
    return { tiles, pins }
  }, [farms, width, height])
}

function FarmPopover({ item, x, y, width, height }: { item: Located; x: number; y: number; width: number; height: number }) {
  const { farm, batches } = item
  // Thẻ mở về phía còn nhiều chỗ; lớp ghim không cắt mép nên thẻ có thể tràn ra ngoài khung bản đồ.
  const below = y < height / 2
  const side = x < 160 ? 'is-left' : x > width - 160 ? 'is-right' : ''
  return (
    <div className={`lfp-pop ${below ? 'is-below' : ''} ${side}`} style={{ left: x, top: y } as CSSProperties} role="group" aria-label={`Thông tin ${farm.name}`}>
      <div className="lfp-pop__head">
        <Avatar name={farm.ownerName} photo={farm.ownerPhotoUrl} />
        <div>
          <b>{farm.name}</b>
          {farm.ownerName && <small>Chủ trại {farm.ownerName}</small>}
        </div>
      </div>
      <div className="lfp-pop__body">
        {place(farm) && <small className="lfp-pop__place"><MapPin aria-hidden="true" />{place(farm)}</small>}
        {farm.ratingAverage !== undefined && farm.ratingCount !== undefined && <Stars average={farm.ratingAverage} count={farm.ratingCount} />}
        <ul>
          {farm.deliveredKg !== undefined && farm.deliveredKg > 0 && <li>Đã giao <b>{weight(farm.deliveredKg)}</b></li>}
          <li>Đang chạy <b>{fmt(batches.length, 0)} lô</b></li>
        </ul>
        {batches[0] && <a href={href(batches[0].batchCode)}>Xem lô của trại <ArrowRight aria-hidden="true" /></a>}
      </div>
    </div>
  )
}

function FarmMap({ farms, active, setActive }: { farms: Located[]; active: string | null; setActive: (id: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const layout = useMapLayout(farms, size.w, size.h)
  const activePin = layout?.pins.find((p) => p.id === active)
  const activeFarm = farms.find((f) => f.farm.id === active)
  return (
    <div className="lfp-map" ref={box} onMouseLeave={() => setActive(null)}>
      <span className="lfp-map__tiles" aria-hidden="true">
        {layout?.tiles.map((t) => (
          <span key={t.key} className="lfp-map__tile" style={{ left: t.x, top: t.y, backgroundImage: `url("${t.url}")` }} />
        ))}
      </span>
      {layout?.pins.map((p) => {
        const item = farms.find((f) => f.farm.id === p.id)!
        return (
          <button
            key={p.id}
            type="button"
            className={`lfp-pin${active === p.id ? ' is-active' : ''}`}
            style={{ left: p.x, top: p.y }}
            aria-label={`${item.farm.name}${place(item.farm) ? `, ${place(item.farm)}` : ''}`}
            aria-expanded={active === p.id}
            onMouseEnter={() => setActive(p.id)}
            onFocus={() => setActive(p.id)}
            onClick={() => setActive(active === p.id ? null : p.id)}
          >
            <MapPin aria-hidden="true" />
          </button>
        )
      })}
      {activePin && activeFarm && <FarmPopover item={activeFarm} x={activePin.x} y={activePin.y} width={size.w} height={size.h} />}
      <span className="lfp-map__hint" aria-hidden="true">Rê chuột hoặc chạm vào ghim để xem trại</span>
      <span className="lfp-map__credit">Ảnh vệ tinh: Esri, Maxar, Earthstar Geographics</span>
    </div>
  )
}

/** Mục "Hộ nuôi": bản đồ và danh sách trại đã công bố. */
function FarmsSection({ data }: { data: LandingBatchesData }) {
  const [active, setActive] = useState<string | null>(null)
  const located = useMemo(
    () => data.farms.filter((f): f is Located => f.farm.latitude !== undefined && f.farm.longitude !== undefined),
    [data.farms],
  )
  if (!data.farms.length) return null
  return (
    <section className="lfp-farms" id="trai-nuoi" aria-labelledby="lfp-farms-title">
      <div className="ld-wrap">
        <header className="lfp-head">
          <p className="lfp-kicker">Hộ nuôi</p>
          <h2 id="lfp-farms-title">Những trại nuôi <em>đứng sau mỗi lô.</em></h2>
        </header>
        <div className={`lfp-farms__grid${located.length ? '' : ' is-list-only'}`}>
          {located.length > 0 && <FarmMap farms={located} active={active} setActive={setActive} />}
          <ul className="lfp-list">
            {data.farms.map(({ farm }) => (
              <li
                key={farm.id}
                className={active === farm.id ? 'is-active' : ''}
                onMouseEnter={() => setActive(farm.id)}
                onMouseLeave={() => setActive(null)}
              >
                <Avatar name={farm.ownerName} photo={farm.ownerPhotoUrl} />
                <div>
                  <b>{farm.name}</b>
                  {farm.ownerName && <small>Chủ trại {farm.ownerName}</small>}
                  {place(farm) && <small>{place(farm)}</small>}
                  {farm.ratingAverage !== undefined && farm.ratingCount !== undefined && <Stars average={farm.ratingAverage} count={farm.ratingCount} />}
                </div>
                {farm.deliveredKg !== undefined && farm.deliveredKg > 0 && (
                  <span className="lfp-list__kg"><b>{weight(farm.deliveredKg)}</b><small>đã giao</small></span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* ---------- thành tích ---------- */
function groupTitle(group: LandingProductionGroup) {
  return group.farm?.name ?? group.operatorName ?? group.batches[0]?.title ?? ''
}

function AchievementCard({ group }: { group: LandingProductionGroup }) {
  const { farm, batches, plannedQuantity, projectedKg, liveCrabCount } = group
  const title = groupTitle(group)
  const named = !!(farm || group.operatorName)
  const live = liveCrabCount ?? farm?.liveCrabCount
  return (
    <article className="lfp-card" aria-label={title}>
      {farm?.photoUrl && <div className="lfp-card__photo"><img src={farm.photoUrl} alt={`Trại ${farm.name}`} loading="lazy" decoding="async" /></div>}
      <div className="lfp-card__body">
        <div className="lfp-card__who">
          <Avatar name={farm?.ownerName} photo={farm?.ownerPhotoUrl} size="lg" />
          <div>
            <h3>{title}</h3>
            {farm?.ownerName && <p className="lfp-card__owner">Chủ trại {farm.ownerName}</p>}
            {farm && place(farm) && <p className="lfp-card__place"><MapPin aria-hidden="true" />{place(farm)}</p>}
          </div>
        </div>
        {farm && farm.deliveredKg !== undefined && farm.deliveredKg > 0 && (
          <p className="lfp-card__delivered"><small>Đã giao cho khách</small><b>{weight(farm.deliveredKg)}</b></p>
        )}
        {farm?.ratingAverage !== undefined && farm.ratingCount !== undefined && (
          <div className="lfp-card__rating"><small>Khách mua đánh giá</small><Stars average={farm.ratingAverage} count={farm.ratingCount} /></div>
        )}
        <dl className="lfp-card__facts">
          {projectedKg !== null && projectedKg > 0 && <div><dt>Sản lượng dự kiến</dt><dd>{weight(projectedKg)}</dd></div>}
          {live !== undefined && live !== null && live > 0 && <div><dt>Cua đang nuôi</dt><dd>{fmt(live, 0)} con</dd></div>}
          {plannedQuantity !== null && plannedQuantity > 0 && <div><dt>Cua theo kế hoạch</dt><dd>{fmt(plannedQuantity, 0)} con</dd></div>}
          {farm?.boxCount !== undefined && farm.boxCount > 0 && <div><dt>Hộp nuôi</dt><dd>{fmt(farm.boxCount, 0)}{farm.rackCount ? ` · ${fmt(farm.rackCount, 0)} dàn` : ''}</dd></div>}
          {farm?.completedBatchCount !== undefined && farm.completedBatchCount > 0 && <div><dt>Lô đã hoàn thành</dt><dd>{fmt(farm.completedBatchCount, 0)}</dd></div>}
        </dl>
        {named ? (
          <details className="lfp-card__lots">
            <summary>{fmt(batches.length, 0)} lô đang nuôi và thu hoạch</summary>
            <ul>{batches.map((b) => <li key={b.batchCode}><a href={href(b.batchCode)}>{b.title} <ArrowRight aria-hidden="true" /></a></li>)}</ul>
          </details>
        ) : (
          <a className="lfp-card__go" href={href(batches[0].batchCode)}>Xem tiến độ lô <ArrowRight aria-hidden="true" /></a>
        )}
      </div>
    </article>
  )
}

function AchievementsSection({ data }: { data: LandingBatchesData }) {
  const groups = data.productionGroups
  if (!groups.length) return null
  // Số tổng chỉ tính khi đủ dữ liệu: trại nào chưa công bố số kg đã giao hay điểm thì không cộng.
  const farms = data.farms.map((f) => f.farm)
  const delivered = farms.length && farms.every((f) => f.deliveredKg !== undefined) ? farms.reduce((s, f) => s + f.deliveredKg!, 0) : null
  const rated = farms.filter((f) => f.ratingAverage !== undefined && f.ratingCount)
  const ratingCount = rated.reduce((s, f) => s + f.ratingCount!, 0)
  const ratingAverage = ratingCount ? rated.reduce((s, f) => s + f.ratingAverage! * f.ratingCount!, 0) / ratingCount : null
  return (
    <section className="lfp-achieve" id="san-luong" aria-labelledby="lfp-achieve-title">
      <div className="ld-wrap">
        <header className="lfp-head">
          <p className="lfp-kicker">Thành tích</p>
          <h2 id="lfp-achieve-title">Trại nuôi <em>và sản lượng.</em></h2>
        </header>
        <dl className="lfp-tiles">
          {delivered !== null && delivered > 0 && <div className="is-main"><dt>Khách đã nhận</dt><dd>{weight(delivered)}</dd></div>}
          {data.productionProjectionKg !== null && data.productionProjectionKg > 0 && <div><dt>Đang nuôi theo kế hoạch</dt><dd>{weight(data.productionProjectionKg)}</dd></div>}
          {data.productionLiveCount !== null && data.productionLiveCount > 0 && <div><dt>Cua đang nuôi</dt><dd>{fmt(data.productionLiveCount, 0)}<small> con</small></dd></div>}
          {ratingAverage !== null && <div><dt>Khách mua đánh giá</dt><dd>{fmt(ratingAverage)}<small> sao · {fmt(ratingCount, 0)} lượt</small></dd></div>}
        </dl>
        <div className="lfp-cards">{groups.map((g) => <AchievementCard key={g.key} group={g} />)}</div>
        <p className="lfp-note">Sản lượng dự kiến tính từ số con trong kế hoạch nhân khối lượng bình quân mỗi con. Điểm đánh giá lấy từ khách đã nhận hàng.</p>
      </div>
    </section>
  )
}

export function LandingFarmProfiles({ data }: { data: LandingBatchesData }) {
  return (
    <>
      <FarmsSection data={data} />
      <AchievementsSection data={data} />
    </>
  )
}

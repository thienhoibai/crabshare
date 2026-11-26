import { useEffect, useRef, useState } from 'react'
import { LANDING_MEDIA, type LandingMediaContent, type ProjectCapture } from './landingMediaContent'
import './media.css'

export type { LandingMediaContent, ProjectCapture } from './landingMediaContent'
type MediaProps = { media?: LandingMediaContent }

// The user confirmed this authentic v3 rack photograph and the right to reuse it.
// Keep it as the requested hero fallback; the technology grid uses project captures.
const V3_HERO = '/minhbach/crab-ras.webp'
function configured(item: ProjectCapture | undefined): item is ProjectCapture {
  return !!item && /^\/(?!\/)[^?#]+$/.test(item.src) && !item.src.includes('..') && !!item.alt.trim()
}

function useReducedMotion() {
  // Begin paused, including on the initial render before the media query is available.
  const [reduce, setReduce] = useState(true)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduce(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduce
}

export function HeroSection({ media = LANDING_MEDIA }: MediaProps) {
  const reduceMotion = useReducedMotion()
  const loop = configured(media.heroLoop) ? media.heroLoop : undefined
  const film = configured(media.film) ? media.film : undefined
  const loopRef = useRef<HTMLVideoElement>(null)
  const filmRef = useRef<HTMLVideoElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [loopReady, setLoopReady] = useState(false)
  const [loopFailed, setLoopFailed] = useState(false)
  const [loopPlaying, setLoopPlaying] = useState(false)
  const [pausedByUser, setPausedByUser] = useState(false)
  const [filmReady, setFilmReady] = useState(false)
  const [filmFailed, setFilmFailed] = useState(false)

  useEffect(() => {
    setLoopReady(false); setLoopFailed(false); setLoopPlaying(false); setPausedByUser(false)
  }, [loop?.src])
  useEffect(() => { setFilmReady(false); setFilmFailed(false) }, [film?.src])
  useEffect(() => {
    const video = loopRef.current
    if (!video || !loopReady || loopFailed) return
    if (reduceMotion || pausedByUser) video.pause()
    else void video.play().catch(() => setLoopPlaying(false))
  }, [loopReady, loopFailed, reduceMotion, pausedByUser])

  function toggleLoop() {
    const video = loopRef.current
    if (!video) return
    if (loopPlaying) { setPausedByUser(true); video.pause() }
    else { setPausedByUser(false); void video.play().catch(() => setLoopPlaying(false)) }
  }
  function openFilm() {
    if (!filmReady || filmFailed || !dialogRef.current || !filmRef.current) return
    loopRef.current?.pause()
    dialogRef.current.showModal()
    filmRef.current.muted = false
    void filmRef.current.play().catch(() => { /* Native controls remain available after a user gesture. */ })
  }
  function closeFilm() {
    filmRef.current?.pause()
    dialogRef.current?.close()
    if (!reduceMotion && !pausedByUser && loopReady && !loopFailed)
      void loopRef.current?.play().catch(() => setLoopPlaying(false))
  }

  return (
    <section id="top" className="ldm-hero" aria-labelledby="ld-title">
      {!photoFailed && <img className="ldm-hero__background" src={V3_HERO} width={1122} height={1402} alt="" fetchPriority="high" onError={() => setPhotoFailed(true)} />}
      {loop && !loopFailed && <video key={loop.src} ref={loopRef} className={`ldm-hero__background ldm-hero__loop${loopPlaying ? ' is-playing' : ''}`}
        src={loop.src} muted loop playsInline preload="metadata" aria-label={loop.alt}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (Number.isFinite(video.duration) && video.duration >= 8 && video.duration <= 12) setLoopReady(true)
          else setLoopFailed(true)
        }} onPlaying={() => setLoopPlaying(true)} onPause={() => setLoopPlaying(false)} onError={() => setLoopFailed(true)} />}
      <div className="ldm-hero__veil" />
      <div className="ld-wrap ldm-hero__content">
        <h1 id="ld-title">Góp vốn nuôi cua hộp.{' '}<br /><em>Thấy từng hộp,{' '}<br />rõ từng đồng.</em></h1>
        <p className="ldm-hero__lead">Theo dõi lô cua từ ngày thả giống đến thu hoạch và quyết toán.</p>
        <div className="ldm-actions">
          <a className="ld-btn ld-btn--lg ld-btn--solid" href="/lo">Góp vốn</a>
          <a className="ld-btn ld-btn--lg ld-btn--ghost" href="/lo">Đặt trước cua</a>
        </div>
        <div className="ldm-hero__media-controls">
          {filmReady && !filmFailed && <button type="button" className="ldm-film-button" onClick={openFilm}>Xem phim 1 phút</button>}
          {loopReady && !loopFailed && <button type="button" className="ldm-loop-button" onClick={toggleLoop}>{loopPlaying ? 'Tạm dừng video nền' : 'Phát video nền'}</button>}
        </div>
      </div>
      {film && <dialog ref={dialogRef} className="ldm-film" aria-label="Phim giới thiệu CrabShare" onCancel={(event) => { event.preventDefault(); closeFilm() }}>
        <button type="button" className="ldm-film__close" onClick={closeFilm}>Đóng phim</button>
        <video key={film.src} ref={filmRef} src={film.src} controls={filmReady && !filmFailed} playsInline preload="metadata" aria-label={film.alt}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget
            // Metadata enables the user's play action even when a mobile browser
            // defers loading frames until that gesture. Runtime errors hide the CTA.
            if (Number.isFinite(video.duration) && video.duration > 0) setFilmReady(true)
            else setFilmFailed(true)
          }} onError={() => { setFilmFailed(true); closeFilm() }} />
      </dialog>}
    </section>
  )
}

type EvidenceCard = { title: string; description: string; captures: ProjectCapture[] }
function CaptureCard({ card, onError }: { card: EvidenceCard; onError: () => void }) {
  return <figure className="ldm-evidence">
    <div className={`ldm-evidence__images${card.captures.length > 1 ? ' ldm-evidence__images--set' : ''}`}>
      {card.captures.map((capture) => <img key={capture.src} src={capture.src} alt={capture.alt} loading="lazy" onError={onError} />)}
    </div>
    <figcaption><h3>{card.title}</h3><p>{card.description}</p></figcaption>
  </figure>
}
export function TechnologySection({ media = LANDING_MEDIA }: MediaProps) {
  const [failedCards, setFailedCards] = useState<string[]>([])
  const cards: EvidenceCard[] = []
  if (configured(media.rack)) cards.push({ title: 'Dàn hộp nuôi', description: 'Ảnh tại trại, nhìn rõ cách bố trí hộp và hệ thống nước.', captures: [media.rack] })
  if (configured(media.box)) cards.push({ title: 'Một hộp, một lần quan sát', description: 'Ảnh từ camera quan sát hộp nuôi.', captures: [media.box] })
  if (configured(media.water)) cards.push({ title: 'Theo dõi môi trường', description: 'Bản ghi nhiệt độ, độ mặn và pH tại trại.', captures: [media.water] })
  const grade = media.grading
  if (grade && configured(grade.white) && configured(grade.red) && configured(grade.result))
    cards.push({ title: 'Quan sát khi phân hạng', description: 'Ảnh ánh sáng trắng, ánh sáng đỏ và kết quả của cùng một lần đánh giá.', captures: [grade.white, grade.red, grade.result] })
  const visibleCards = cards.filter((card) => !failedCards.includes(card.captures.map((capture) => capture.src).join('|')))
  if (visibleCards.length === 0) return null
  return <section id="thiet-bi" className="ldm-section ldm-technology" aria-labelledby="ldm-tech-title">
    <div className="ld-wrap">
      <div className="ldm-section__heading"><p className="ld-kicker">Từ trại nuôi</p><h2 id="ldm-tech-title">Nhìn thấy cách cua được chăm sóc.</h2></div>
      <div className="ldm-evidence-grid">{visibleCards.map((card) => {
        const key = card.captures.map((capture) => capture.src).join('|')
        return <CaptureCard key={key} card={card} onError={() => setFailedCards((previous) => previous.includes(key) ? previous : [...previous, key])} />
      })}</div>
    </div>
  </section>
}

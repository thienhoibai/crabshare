/* Trang chủ: một trang landing tĩnh, tông xanh rừng đước. Không gọi máy chủ, không WebGL.
   Mọi liên kết trỏ tới đường dẫn có trong app/router.tsx. Không ghi lời hứa về kết quả tài chính.

   Ba tệp sau thả vào web/public/landing là trang tự dùng, không cần sửa mã. Thiếu tệp nào thì chỗ đó hiện ảnh bìa hoặc ô chờ:
     gioi-thieu.mp4        video giới thiệu ở mục trên cùng (ngang 16:9)
     camera-chay-dan.jpg   ảnh thật của camera chạy dàn (ngang 4:3)
     hop-can-cua.jpg       ảnh thật của hộp cân cua (ngang 4:3) */
import { useCallback, useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { ArrowRight, Camera, Check, Clapperboard, HandCoins, Play, Scale, Sprout, Store, X } from 'lucide-react'
import { homePathFor, useAuthStore } from '../../shared/auth/authStore'
import MangroveScene from './MangroveScene'
import './landing.css'

const VIDEO = '/landing/gioi-thieu.mp4'

const PROBLEMS = [
  { before: 'Mỗi bên giữ một bộ số.', after: 'Chi phí và giá được khoá trước khi góp vốn.' },
  { before: 'Góp vốn rồi không thấy cua.', after: 'Camera chụp từng hộp, nhà đầu tư tự mở xem.' },
  { before: 'Doanh thu, hạng cua tự khai.', after: 'Đơn có cọc. Máy cân đo, kiểm phẩm độc lập duyệt.' },
  { before: 'Chia tiền dễ tranh cãi.', after: 'Một bảng quyết toán chung, tính tới từng đồng.' },
]

/* Bước 4 giữ id "chia": chân trang của các trang công khai có liên kết /#chia. */
const STEPS = [
  { title: 'Mở lô', text: 'Người nuôi lập lô, chi phí và giá được khoá.' },
  { title: 'Góp vốn, đặt trước', text: 'Nhà đầu tư góp vốn, khách sỉ đặt cọc.' },
  { title: 'Nuôi có giám sát', text: 'Camera chụp từng hộp, tiền giải ngân theo mốc.' },
  { id: 'chia', title: 'Giao hàng, quyết toán', text: 'Cân phân hạng, giao theo đợt, chia tiền theo bảng công khai.' },
]

const DEVICES = [
  { src: '/landing/camera-chay-dan.jpg', icon: <Camera size={30} strokeWidth={1.6} />, name: 'Camera chạy dàn', text: 'Chạy dọc dàn hộp, chụp từng con cua rồi gửi ảnh về hệ thống.' },
  { src: '/landing/hop-can-cua.jpg', icon: <Scale size={30} strokeWidth={1.6} />, name: 'Hộp cân cua', text: 'Cân, chụp và đề xuất hạng. Nhân viên kiểm phẩm quyết định.' },
]

const ROLES = [
  { icon: <Sprout size={24} />, name: 'Người nuôi', text: 'Mở lô, gọi vốn, nhận tiền theo mốc.', href: '/dang-ky-ho-nuoi', go: 'Đăng ký hộ nuôi' },
  { icon: <HandCoins size={24} />, name: 'Nhà đầu tư', text: 'Góp vốn theo lô, tự mở xem từng hộp cua.', href: '/dang-ky', go: 'Tạo tài khoản' },
  { icon: <Store size={24} />, name: 'Khách mua sỉ', text: 'Đặt trước theo lô, nhận cua đã phân hạng.', href: '/lo', go: 'Xem lô đang mở' },
]

function Logo({ href }: { href: string }) {
  return <a className="ld-logo" href={href} aria-label="CrabShare, về đầu trang"><span className="ld-logo__mark" aria-hidden="true" />crabshare</a>
}

function Nav() {
  const user = useAuthStore((s) => s.user)
  return (
    <header className="ld-nav">
      <div className="ld-nav__in">
        <Logo href="#top" />
        <nav className="ld-nav__links" aria-label="Điều hướng chính">
          <a href="#cach-hoat-dong">Cách hoạt động</a>
          <a href="#thiet-bi">Thiết bị</a>
          <a href="/lo">Lô đang mở</a>
          <a href="/chuan-phan-hang">Chuẩn phân hạng</a>
        </nav>
        <div className="ld-nav__acts">
          {user ? (
            <a className="ld-btn ld-btn--solid" href={homePathFor(user)}>Vào trang của tôi</a>
          ) : (
            <>
              <a className="ld-btn ld-btn--ghost" href="/dang-nhap">Đăng nhập</a>
              <a className="ld-btn ld-btn--solid" href="/dang-ky">Đăng ký</a>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

const clock = (seconds: number) =>
  Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}` : ''

/**
 * Mục trên cùng: video giới thiệu. Chưa có tệp video thì chỉ hiện ảnh bìa và nhãn "sắp có".
 * Bấm nút phát thì video chiếm cả mục; Esc, nút đóng hoặc hết video thì trở về ảnh bìa.
 */
function Hero() {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'unknown' | 'ready' | 'missing'>('unknown')
  const [length, setLength] = useState('')
  const [playing, setPlaying] = useState(false)

  const onMeta = (event: SyntheticEvent<HTMLVideoElement>) => {
    setState('ready')
    setLength(clock(event.currentTarget.duration))
  }
  const stop = useCallback(() => {
    const el = video.current
    if (el) {
      el.pause()
      if (el.readyState > 0) el.currentTime = 0
    }
    setPlaying(false)
  }, [])
  const play = () => {
    const el = video.current
    if (!el) return
    setPlaying(true)
    el.play().catch(() => setPlaying(false))
  }

  // Sự kiện có thể đã xảy ra trước khi React gắn bộ nghe: đọc lại trạng thái của thẻ video một lần.
  useEffect(() => {
    const el = video.current
    if (!el) return
    if (el.error) setState('missing')
    else if (el.readyState > 0) {
      setState('ready')
      setLength(clock(el.duration))
    }
  }, [])
  useEffect(() => {
    if (!playing) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') stop() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, stop])

  return (
    <section id="top" className={`ld-hero${playing ? ' is-playing' : ''}`} aria-labelledby="ld-title">
      <MangroveScene />
      <div className="ld-hero__veil" aria-hidden="true" />
      <video
        ref={video}
        className="ld-hero__video"
        src={VIDEO}
        preload="metadata"
        playsInline
        controls={playing}
        aria-label="Video giới thiệu CrabShare"
        onLoadedMetadata={onMeta}
        onError={() => { setState('missing'); setPlaying(false) }}
        onEnded={stop}
      />
      {playing && <button type="button" className="ld-hero__close" onClick={stop}><X size={18} aria-hidden="true" /> Đóng video</button>}

      <div className="ld-hero__in">
        <div className="ld-hero__copy">
          <p className="ld-kicker">Cua nuôi hộp · Cà Mau</p>
          <h1 id="ld-title">Góp vốn nuôi cua hộp. <em>Thấy từng hộp, rõ từng đồng.</em></h1>
          <p className="ld-hero__sub">Một nền tảng cho người nuôi, nhà đầu tư và khách mua sỉ.</p>
          <div className="ld-hero__cta">
            <a className="ld-btn ld-btn--solid ld-btn--lg" href="/lo">Xem lô đang mở <ArrowRight size={18} aria-hidden="true" /></a>
            <a className="ld-btn ld-btn--ghost ld-btn--lg" href="#cach-hoat-dong">Cách hoạt động</a>
          </div>
        </div>

        {state === 'missing' ? (
          <p className="ld-play ld-play--soon">
            <span className="ld-play__disc"><Clapperboard size={28} strokeWidth={1.6} aria-hidden="true" /></span>
            <span className="ld-play__text"><b>Video giới thiệu</b><small>Sắp có</small></span>
          </p>
        ) : (
          <button type="button" className="ld-play" onClick={play}>
            <span className="ld-play__disc"><Play size={32} fill="currentColor" strokeWidth={0} aria-hidden="true" /></span>
            <span className="ld-play__text"><b>Xem video giới thiệu</b>{length && <small>{length}</small>}</span>
          </button>
        )}
      </div>
    </section>
  )
}

function Head({ kicker, title, id }: { kicker: string; title: string; id: string }) {
  return (
    <div className="ld-head">
      <p className="ld-kicker">{kicker}</p>
      <h2 id={id}>{title}</h2>
    </div>
  )
}

/** Ô ảnh thiết bị: có tệp ảnh thì hiện ảnh, chưa có thì hiện ô chờ có nhãn. */
function Shot({ src, name, icon }: { src: string; name: string; icon: ReactNode }) {
  const [missing, setMissing] = useState(false)
  return (
    <div className="ld-shot">
      {missing ? (
        <div className="ld-shot__empty">{icon}<b>Ảnh {name.toLowerCase()}</b><small>Sẽ bổ sung ảnh thật</small></div>
      ) : (
        <img src={src} alt={`${name} tại trại`} onError={() => setMissing(true)} />
      )}
    </div>
  )
}

export default function Landing() {
  useEffect(() => {
    const title = document.title
    const background = document.body.style.background
    document.title = 'CrabShare · Góp vốn nuôi cua hộp'
    document.body.style.background = '#101810'
    // Trang được tải lười nên trình duyệt chưa kịp cuộn tới #mục trong đường dẫn (ví dụ /#chia).
    const anchor = window.location.hash.slice(1)
    if (anchor) document.getElementById(anchor)?.scrollIntoView()
    return () => {
      document.title = title
      document.body.style.background = background
    }
  }, [])

  return (
    <div className="ld">
      <a className="ld-skip" href="#noi-dung">Bỏ qua, đến nội dung chính</a>
      <Nav />
      <Hero />

      <main id="noi-dung">
        <section className="ld-sec ld-why" aria-labelledby="ld-why">
          <div className="ld-wrap">
            <Head id="ld-why" kicker="Vì sao có CrabShare" title="Bốn chỗ dễ mất lòng tin" />
            <ul className="ld-why__grid">
              {PROBLEMS.map((p) => (
                <li key={p.before} className="ld-fix">
                  <div className="ld-fix__before"><small>Trước đây</small><p>{p.before}</p></div>
                  <div className="ld-fix__after"><small><Check size={14} strokeWidth={3} aria-hidden="true" /> Với CrabShare</small><p>{p.after}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="cach-hoat-dong" className="ld-sec ld-how" aria-labelledby="ld-how">
          <div className="ld-wrap">
            <Head id="ld-how" kicker="Cách hoạt động" title="Một lô cua đi qua bốn bước" />
            <ol className="ld-how__steps">
              {STEPS.map((s, i) => (
                <li key={s.title} id={s.id} className="ld-step">
                  <span className="ld-step__n" aria-hidden="true">{i + 1}</span>
                  <div><h3>{s.title}</h3><p>{s.text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="thiet-bi" className="ld-sec ld-gear" aria-labelledby="ld-gear">
          <div className="ld-wrap">
            <Head id="ld-gear" kicker="Thiết bị tại trại" title="Máy đo thay cho lời khai" />
            <div className="ld-gear__grid">
              <figure className="ld-farm">
                <img src="/minhbach/crab-ras.webp" width={1122} height={1402} alt="Dàn hộp nuôi cua xếp tầng trong trại" loading="lazy" decoding="async" />
                <figcaption>Dàn hộp nuôi cua · ảnh minh hoạ</figcaption>
              </figure>
              {DEVICES.map((d) => (
                <article key={d.name} className="ld-device">
                  <Shot src={d.src} name={d.name} icon={d.icon} />
                  <div className="ld-device__body"><h3>{d.name}</h3><p>{d.text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="bat-dau" className="ld-sec ld-join" aria-labelledby="ld-join">
          <div className="ld-wrap">
            <Head id="ld-join" kicker="Bắt đầu" title="Bạn tham gia với vai nào?" />
            <div className="ld-join__grid">
              {ROLES.map((r) => (
                <a key={r.name} className="ld-role" href={r.href}>
                  <span className="ld-role__icon" aria-hidden="true">{r.icon}</span>
                  <div className="ld-role__body">
                    <h3>{r.name}</h3>
                    <p>{r.text}</p>
                    <span className="ld-role__go">{r.go} <ArrowRight size={17} aria-hidden="true" /></span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="ld-foot">
        <div className="ld-wrap">
          <div className="ld-foot__row">
            <Logo href="#top" />
            <nav aria-label="Liên kết cuối trang">
              <a href="/lo">Lô đang mở</a>
              <a href="/chuan-phan-hang">Chuẩn phân hạng</a>
              <a href="/dang-nhap">Đăng nhập</a>
              <a href="/dang-ky">Đăng ký</a>
            </nav>
          </div>
          <p className="ld-foot__bar">© 2026 CrabShare · Đồ án tốt nghiệp FA26SE229. Góp vốn có rủi ro, nền tảng không cam kết kết quả tài chính.</p>
        </div>
      </footer>
    </div>
  )
}

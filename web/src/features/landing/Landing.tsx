import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, BookOpen, ChevronDown, HandCoins, Search, Sprout, Store } from 'lucide-react'
import { homePathFor, useAuthStore } from '../../shared/auth/authStore'
import { LandingBatchSections, useLandingBatches } from './LandingBatches'
import { HeroSection, TechnologySection } from './LandingMedia'
import { TwinSection } from './LandingTwin'
import { LANDING_MEDIA, type LandingMediaContent } from './landingMediaContent'
import './landing.css'
import './landing-parts.css'

/** Mục Công nghệ có mô hình 3D (LandingTwin.tsx) đang tạm ẩn theo ý trưởng nhóm ngày 26/11; đổi thành true để bật lại. */
const SHOW_TWIN = false

type RoleKey = 'farmer' | 'investor' | 'buyer'
const roles: { key: RoleKey; icon: ReactNode; name: string; description: string; action: string; href: string }[] = [
  { key: 'farmer', icon: <Sprout />, name: 'Người nuôi', description: 'Mở lô, kết nối vốn và ghi nhận quá trình nuôi.', action: 'Đăng ký hộ nuôi', href: '/dang-ky-ho-nuoi' },
  { key: 'investor', icon: <HandCoins />, name: 'Nhà đầu tư', description: 'Chọn lô, góp vốn và theo dõi quyết toán.', action: 'Tạo tài khoản', href: '/dang-ky' },
  { key: 'buyer', icon: <Store />, name: 'Khách mua sỉ', description: 'Chọn quy cách cua và đặt trước theo lô.', action: 'Xem các lô', href: '/lo' },
]

function Logo() {
  return <a className="ld-logo" href="#top" aria-label="CrabShare, về đầu trang">
    <span className="ld-logo__mark" aria-hidden="true"><Sprout /></span>crabshare<span className="ld-logo__dot" aria-hidden="true">.</span>
  </a>
}

/** Mục nào đang hiện trên màn hình, để tô đậm đúng liên kết ở thanh trên. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join('|')
  useEffect(() => {
    const ids = key.split('|')
    let frame = 0
    // Mục chứa đường ngang ở 40% chiều cao màn hình là mục đang xem; ở ảnh đầu trang thì không tô mục nào.
    const update = () => {
      frame = 0
      const line = window.innerHeight * 0.4
      const current = ids.find((id) => {
        const box = document.getElementById(id)?.getBoundingClientRect()
        return !!box && box.top <= line && box.bottom > line
      })
      setActive(current ?? null)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [key])
  return active
}

function Header({ links }: { links: { id: string; label: string }[] }) {
  const user = useAuthStore((state) => state.user)
  const active = useActiveSection(links.map((link) => link.id))
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return (
    <header className={scrolled ? 'ld-nav is-scrolled' : 'ld-nav'}>
      <div className="ld-nav__in">
        <Logo />
        <nav className="ld-nav__links" aria-label="Điều hướng chính">
          {links.map((link) => <a key={link.id} href={`#${link.id}`} aria-current={active === link.id ? 'true' : undefined}>{link.label}</a>)}
          <a href="/lo">Lô nuôi</a>
        </nav>
        <div className="ld-nav__acts">
          {user ? <a className="ld-btn ld-btn--solid" href={homePathFor(user)}>Vào trang của tôi</a> : <>
            <a className="ld-nav__login" href="/dang-nhap">Đăng nhập</a>
            <a className="ld-btn ld-btn--solid" href="/dang-ky">Đăng ký</a>
          </>}
        </div>
      </div>
    </header>
  )
}

/** Hai nút cẩm nang. Bấm mở vài câu hỏi; sau này trợ lý AI dạy nuôi cua và giải đáp góp vốn, hợp đồng sẽ gắn vào đây. */
function Handbooks({ minimum }: { minimum: string | null }) {
  const books = [
    { key: 'nuoi', title: 'Cẩm nang nuôi cua', faq: [
      ['Một hộp nuôi mấy con cua?', 'Mỗi hộp nuôi một con. Nước chảy qua từng hộp rồi về bể lọc, nên cua không cắn nhau và dễ theo dõi từng con.'],
      ['Cua chết thì sao?', 'Người nuôi ghi nhận vào nhật trình của lô. Cua chết được loại khỏi hàng bán.'],
    ] },
    { key: 'dau-tu', title: 'Cẩm nang đầu tư', faq: [
      ['Góp tối thiểu bao nhiêu?', minimum ?? 'Mỗi lô công bố mức góp tối thiểu trong điều khoản mở lô.'],
      ['Lô bị lỗ thì sao?', 'Lỗ chia theo tỷ lệ vốn góp. Mỗi người chịu lỗ tối đa bằng phần vốn đã góp.'],
    ] },
  ]
  // Liên kết "Cách chia tiền" (/#chia) ở các trang khác mở sẵn cẩm nang đầu tư.
  const [open, setOpen] = useState<string | null>(() => (window.location.hash === '#chia' ? 'dau-tu' : null))
  useEffect(() => {
    const onHash = () => { if (window.location.hash === '#chia') setOpen('dau-tu') }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return (
    <section className="ld-sec ld-books" id="hoi-dap" aria-label="Cẩm nang">
      <div className="ld-wrap">
        <div className="ld-books__buttons">{books.map((book) => (
          <button key={book.key} type="button" className="ld-book-btn" aria-expanded={open === book.key} aria-controls={`ld-book-${book.key}`}
            onClick={() => setOpen(open === book.key ? null : book.key)}>
            <BookOpen aria-hidden="true" />{book.title}<ChevronDown className="ld-book-btn__chev" aria-hidden="true" />
          </button>
        ))}</div>
        {books.map((book) => (
          <div key={book.key} id={`ld-book-${book.key}`} className="ld-book-panel" role="region" aria-label={book.title} hidden={open !== book.key}>
            {book.faq.map(([question, answer]) => (
              <details key={question} id={question === 'Lô bị lỗ thì sao?' ? 'chia' : undefined} open={question === 'Lô bị lỗ thì sao?' && window.location.hash === '#chia' ? true : undefined}>
                <summary>{question}<span aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
            <p className="ld-book-panel__note">Trợ lý AI cho cẩm nang này đang được làm.</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Join({ art }: { art: LandingMediaContent['roles'] }) {
  const [failed, setFailed] = useState<RoleKey[]>([])
  return (
    <section className="ld-sec ld-join" id="bat-dau" aria-labelledby="ld-join-title">
      <div className="ld-wrap">
        <div className="ld-head"><h2 id="ld-join-title">Bạn tham gia với vai nào?</h2></div>
        <div className="ld-join__grid">{roles.map((role) => {
          const src = art?.[role.key]
          const picture = src && /^\/(?!\/)[^?#]+$/.test(src) && !failed.includes(role.key) ? src : null
          return <a className={`ld-role ld-role--${role.key}`} key={role.href} href={role.href}>
            <span className={picture ? 'ld-role__stage has-art' : 'ld-role__stage'} aria-hidden="true">
              {picture
                ? <img src={picture} alt="" loading="lazy" decoding="async" onError={() => setFailed((list) => [...list, role.key])} />
                : <span className="ld-role__mascot">{role.icon}</span>}
            </span>
            <div className="ld-role__body">
              <h3>{role.name}</h3>
              <p>{role.description}</p>
              <span className="ld-role__go">{role.action}<ArrowRight aria-hidden="true" /></span>
            </div>
          </a>
        })}</div>
      </div>
    </section>
  )
}

/** Ô tra mã nhỏ ở chân trang. Mã in trên đơn hàng mở thẳng trang truy xuất; trang chủ không hiện QR mẫu. */
function TraceLookup() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) { setError('Nhập mã in trên đơn hàng để tra cứu.'); return }
    navigate(`/truy-xuat/${encodeURIComponent(trimmed)}`)
  }
  return (
    <form className="ld-trace" id="truy-xuat" onSubmit={submit} noValidate>
      <label htmlFor="ld-trace-code">Mã truy xuất</label>
      <div className="ld-trace__row">
        <input id="ld-trace-code" name="traceCode" value={code} onChange={(event) => { setCode(event.target.value); setError('') }}
          placeholder="Mã in trên đơn hàng" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          aria-invalid={!!error} aria-describedby={error ? 'ld-trace-error' : undefined} />
        <button type="submit"><Search aria-hidden="true" />Tra cứu</button>
      </div>
      {error && <p id="ld-trace-error" className="ld-trace__error" role="alert">{error}</p>}
    </form>
  )
}

function Footer() {
  const address = import.meta.env.VITE_TEAM_CONTACT_EMAIL?.trim()
  const contact = address && /^[^\s@<>?&#]+@[^\s@<>?&#]+\.[^\s@<>?&#]+$/.test(address) ? address : null
  return (
    <footer className="ld-foot"><div className="ld-wrap">
      <div className="ld-foot__row">
        <div className="ld-foot__brand">
          <Logo />
          <nav aria-label="Liên kết cuối trang"><a href="/lo">Danh sách lô</a><a href="/chuan-phan-hang">Chuẩn phân hạng</a><a href="#hoi-dap">Cẩm nang</a></nav>
        </div>
        <TraceLookup />
      </div>
      <div className="ld-foot__bar"><span>CrabShare · Đồ án tốt nghiệp FA26SE229</span>{contact && <a href={`mailto:${contact}`}>Liên hệ nhóm · {contact}</a>}</div>
      <p className="ld-foot__credit">
        Ảnh minh hoạ loại cua từ Wikimedia Commons: Wibowo Djatmiko (giấy phép CC BY-SA 4.0, đã cắt và thu nhỏ), Judgefloro (CC0).
      </p>
    </div></footer>
  )
}

export default function Landing() {
  const data = useLandingBatches()
  const initialAnchor = useRef(window.location.hash.slice(1))
  useEffect(() => {
    const previous = document.title
    document.title = 'CrabShare · Góp vốn nuôi cua hộp'
    return () => { document.title = previous }
  }, [])
  useEffect(() => {
    const id = initialAnchor.current
    if (!id || window.location.hash.slice(1) !== id) return
    const target = document.getElementById(id)
    if (target) {
      target.scrollIntoView({ behavior: 'instant' })
      initialAnchor.current = ''
    }
  }, [data.loading, data.farms.length, data.production.length, data.wholesale.length])

  // Chỉ đưa lên thanh trên những mục đang có trên trang; mục cần dữ liệu thì ẩn khi chưa có dữ liệu.
  const links = [
    { id: 'gop-von', label: 'Góp vốn' },
    ...(data.farms.length ? [{ id: 'trai-nuoi', label: 'Hộ nuôi' }] : []),
    ...(data.wholesale.length ? [{ id: 'gia-si', label: 'Chào giá' }] : []),
    ...(SHOW_TWIN ? [{ id: 'cong-nghe', label: 'Công nghệ' }] : []),
    { id: 'hoi-dap', label: 'Cẩm nang' },
  ]
  return (
    <div className="ld">
      <a className="ld-skip" href="#noi-dung">Đến nội dung chính</a>
      <Header links={links} />
      <main id="noi-dung">
        <HeroSection />
        <LandingBatchSections data={data} />
        {SHOW_TWIN && <TwinSection />}
        <TechnologySection />
        <Handbooks minimum={data.minimumContributionFaq} />
        <Join art={LANDING_MEDIA.roles} />
      </main>
      <Footer />
    </div>
  )
}

/* Mục Công nghệ: xem một trại cua vận hành thế nào qua mô hình 3D của CrabShare Twin.
   Mô hình là bản mô phỏng theo thiết kế, số liệu bên trong là dữ liệu mẫu; trang ghi rõ điều đó.
   Khung 3D chỉ nhận chuột sau khi người xem bấm, để cuộn trang không bị kẹt trong mô hình. */
import { useEffect, useState } from 'react'
import { ArrowUpRight, Boxes, Camera, Droplets, LayoutGrid, MousePointerClick, Scale } from 'lucide-react'
import './twin.css'

const TWIN_URL = (import.meta.env.VITE_TWIN_URL?.trim() || 'https://crabshare-twin.vercel.app').replace(/\/+$/, '')

const VIEWS = [
  { view: 'quy-trinh', icon: <Boxes />, title: 'Toàn cảnh quanh một hộp cua', text: 'Hộp nuôi, nước tuần hoàn, camera, trạm cân và dữ liệu về nền tảng.' },
  { view: 'camera-dan', icon: <Camera />, title: 'Camera chạy dàn', text: 'Xe chạy dọc dàn, dừng trước từng hộp để chụp.' },
  { view: 'tram-do', icon: <Scale />, title: 'Trạm cân đo', text: 'Cân, chụp dưới đèn. Máy đề xuất hạng, người kiểm phẩm duyệt.' },
  { view: '', icon: <LayoutGrid />, title: 'Dàn hộp của một lô', text: 'Mỗi hộp một màu theo tình trạng con cua trong lô mẫu.' },
]
const SENSORS = [
  { icon: <Camera />, label: 'Ảnh từng hộp' },
  { icon: <Droplets />, label: 'Nhiệt độ, độ mặn, pH' },
  { icon: <Scale />, label: 'Cân và phân hạng' },
]
const twinHref =(view: string) => `${TWIN_URL}/${view ? `?view=${view}` : ''}`

function useWideScreen() {
  const query = '(min-width: 760px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return wide
}

export function TwinSection() {
  const [active, setActive] = useState(0)
  const [live, setLive] = useState(false)
  const wide = useWideScreen()
  const current = VIEWS[active]
  return (
    <section className="lt" id="cong-nghe" aria-labelledby="lt-title">
      <div className="ld-wrap">
        <header className="lt-head">
          <div>
            <p className="ld-kicker">Công nghệ trong trại</p>
            <h2 id="lt-title">Xem một trại cua <em>vận hành thế nào.</em></h2>
          </div>
          <ul className="lt-sensors" aria-label="Dữ liệu máy ghi lại">
            {SENSORS.map((s) => <li key={s.label}><span aria-hidden="true">{s.icon}</span>{s.label}</li>)}
          </ul>
        </header>
        <div className="lt-body">
          <div className="lt-tabs" role="tablist" aria-label="Chọn phần mô hình">
            {VIEWS.map((v, i) => (
              <button key={v.title} type="button" role="tab" id={`lt-tab-${i}`} aria-selected={i === active} aria-controls="lt-stage"
                className="lt-tab" onClick={() => { setActive(i); setLive(false) }}>
                <span className="lt-tab__icon" aria-hidden="true">{v.icon}</span>
                <span className="lt-tab__text"><b>{v.title}</b><small>{v.text}</small></span>
              </button>
            ))}
          </div>
          <div className="lt-stage" id="lt-stage" role="tabpanel" aria-labelledby={`lt-tab-${active}`}>
            <div className="lt-window">
              <div className="lt-window__bar">
                <span className="lt-dots" aria-hidden="true"><i /><i /><i /></span>
                <span className="lt-window__name">Mô hình 3D · {current.title}</span>
                {wide && <a href={twinHref(current.view)} target="_blank" rel="noopener noreferrer">Mở toàn màn hình<ArrowUpRight aria-hidden="true" /></a>}
              </div>
              {wide ? <div className="lt-frame">
                <iframe key={current.view || 'lo'} src={twinHref(current.view)} title={`Mô hình 3D: ${current.title}`} loading="lazy"
                  referrerPolicy="no-referrer" allow="fullscreen" />
                {!live && <button type="button" className="lt-cover" onClick={() => setLive(true)}>
                  <span><MousePointerClick aria-hidden="true" />Bấm để xoay, phóng to mô hình</span>
                </button>}
              </div> : <a className="lt-open" href={twinHref(current.view)} target="_blank" rel="noopener noreferrer">
                <Boxes aria-hidden="true" />
                <b>Mở mô hình 3D</b>
                <small>Mô hình chạy mượt hơn khi mở toàn màn hình trên điện thoại.</small>
              </a>}
            </div>
            <p className="lt-note">Mô hình mô phỏng theo thiết kế thiết bị của nhóm. Số liệu trong mô hình là dữ liệu mẫu.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

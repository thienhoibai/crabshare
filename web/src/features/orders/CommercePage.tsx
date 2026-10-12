import { useState } from 'react'
import { SiteFooter, SiteHeader } from '../../shared/layout/SiteChrome'
import { useDemoSession } from '../../shared/auth/session'

const asset = (name: string) => `/assets/${name}`
const pageData: Record<string, { title: string; subtitle: string }> = {
  '/theo-doi-don-hang': { title: 'Theo dõi đơn hàng', subtitle: 'Đơn hàng #CS-240826 đang được chuẩn bị' },
  '/lich-su-don-hang': { title: 'Lịch sử đơn hàng', subtitle: 'Các đơn hàng gần đây của bạn' },
  '/huy-tra-hang': { title: 'Yêu cầu huỷ / trả hàng', subtitle: 'Đơn hàng #CS-240826 · Cua Gạch Son Cà Mau' },
  '/danh-gia-don-hang': { title: 'Đánh giá đơn hàng', subtitle: 'Hãy chia sẻ trải nghiệm mua hàng của bạn' },
  '/san-pham': { title: 'Cua Gạch Son Cà Mau — Chuẩn RAS Thượng Hạng', subtitle: 'Sản phẩm thu hoạch từ Batch #CR-0142' },
}

function ProductRow() { return <div className="commerce-product"><img src={asset('storeCrab.png')} alt="Cua Gạch Son Cà Mau" /><div><strong>Cua Gạch Son Cà Mau — Chuẩn RAS Thượng Hạng</strong><p>Loại 1 · Vừa (450g) · Batch #CR-0142</p></div><b>490.000 đ</b></div> }

function Rating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="review-stars" aria-label={`${value} trên 5 sao`}>{[1, 2, 3, 4, 5].map((star) => <button type="button" key={star} onClick={() => onChange(star)} aria-label={`${star} sao`} className={star <= value ? 'active' : ''}>★</button>)}</div>
}

function ReviewOrder() {
  const [ratings, setRatings] = useState([5, 4, 5])
  const [sent, setSent] = useState(false)
  const items = [['Cua Gạch Son Cà Mau', 'Loại 1 (400g - 450g) · Số lượng: 1'], ['Cua Yếm Vuông Dây Rơm', 'Loại 1 (400g) · Số lượng: 2'], ['Thịt Càng & Đùi Cua Tươi Bóc Sẵn', 'Hộp 500g · Số lượng: 1']]
  return <main className="commerce-page review-page"><section className="review-wrap"><p className="review-breadcrumb"><a href="/">Trang chủ</a> / <a href="/lich-su-don-hang">Đơn hàng của tôi</a> / #CS-20260909-014 / <b>Đánh giá đơn hàng</b></p><h1>Đánh giá đơn hàng</h1><p className="review-order">Đơn hàng #CS-20260909-014 · Đã giao 09/09/2026</p><div className="review-products">{items.map(([name, detail], index) => <div className="review-product" key={name}><div className="review-thumb"><img src={asset('storeCrab.png')} alt="" /></div><div><h2>{name}</h2><p>{detail}</p></div><Rating value={ratings[index]} onChange={(rating) => setRatings((all) => all.map((value, itemIndex) => itemIndex === index ? rating : value))} /></div>)}</div><label className="review-comment">Chia sẻ thêm về đơn hàng của bạn<textarea placeholder="Sản phẩm có tươi ngon, đóng gói cẩn thận và giao đúng hẹn không?" /></label><div className="review-bottom"><span>{sent ? 'Cảm ơn bạn đã gửi đánh giá.' : 'Đánh giá của bạn giúp CrabShare phục vụ tốt hơn.'}</span><button onClick={() => setSent(true)}>GỬI ĐÁNH GIÁ</button></div></section></main>
}

function OrderHistory() {
  const [tab, setTab] = useState('Tất cả')
  const orders = [
    ['#CS-20260909-014', '09/09/2026, 10:15', 'Đang giao hàng', 'shipping', '3 sản phẩm', '1.660.000 đ'],
    ['#CS-20260908-089', '08/09/2026, 15:30', 'Đang xử lý', 'processing', '2 sản phẩm', '875.000 đ'],
    ['#CS-20260906-052', '06/09/2026, 09:45', 'Hoàn tất', 'complete', '1 sản phẩm', '490.000 đ'],
    ['#CS-20260904-031', '04/09/2026, 18:20', 'Hoàn tất', 'complete', '2 sản phẩm', '1.015.000 đ'],
    ['#CS-20260901-018', '01/09/2026, 11:00', 'Đã huỷ', 'cancelled', '1 sản phẩm', '385.000 đ'],
  ]
  const tabs = [['Tất cả', 5], ['Đang xử lý', 1], ['Đang giao', 1], ['Hoàn tất', 2], ['Đã huỷ', 1]] as const
  const visible = orders.filter(([, , status]) => tab === 'Tất cả' || (tab === 'Đang giao' ? status === 'Đang giao hàng' : status === tab))
  return <main className="commerce-page history-page"><section className="history-wrap"><h1>Lịch sử đơn hàng</h1><div className="history-tabs">{tabs.map(([name, count]) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name} ({count})</button>)}</div><div className="history-list">{visible.map(([code, date, status, type, quantity, total]) => <article className="history-row" key={code}><div className="history-info"><b>{code}</b><span>{date}</span><strong className={type}>• {status}</strong><span>{quantity}</span></div><div className="history-action"><b>{total}</b>{status === 'Hoàn tất' && <a href="/huy-tra-hang">Yêu cầu trả hàng</a>}<a href={status === 'Hoàn tất' ? '/danh-gia-don-hang' : '/theo-doi-don-hang'}>Xem chi tiết ›</a></div></article>)}</div></section></main>
}

function ReturnRequest() {
  const [kind, setKind] = useState('return')
  const [selected, setSelected] = useState([true, false, false])
  const [sent, setSent] = useState(false)
  const products = [['Cua Gạch Son Cà Mau', 'Loại 1 (400g - 450g) · Số lượng: 1'], ['Cua Yếm Vuông Dây Rơm', 'Loại 1 (400g) · Số lượng: 2'], ['Thịt Càng & Đùi Cua Tươi Bóc Sẵn', 'Hộp 500g · Số lượng: 1']]
  return <main className="commerce-page return-page"><section className="return-wrap"><h1>Yêu cầu huỷ / trả hàng</h1><p className="return-order">Đơn hàng <b>#CS-20260909-014</b> · 3 sản phẩm · <strong>1.455.000đ</strong></p><div className="return-form"><div><h2>1. CHỌN LOẠI YÊU CẦU</h2><div className="return-kind"><label><input type="radio" name="kind" checked={kind === 'cancel'} onChange={() => setKind('cancel')} /> Huỷ đơn hàng</label><label><input type="radio" name="kind" checked={kind === 'return'} onChange={() => setKind('return')} /> Trả hàng / hoàn tiền</label></div></div>{kind === 'return' && <div><div className="return-section-title"><h2>2. CHỌN SẢN PHẨM CẦN TRẢ</h2><span>Chọn ít nhất 1 sản phẩm</span></div><div className="return-products">{products.map(([name, detail], index) => <label key={name}><input type="checkbox" checked={selected[index]} onChange={() => setSelected((items) => items.map((value, itemIndex) => itemIndex === index ? !value : value))} /><img src={asset('storeCrab.png')} alt="" /><span><b>{name}</b><small>{detail}</small></span></label>)}</div></div>}<div><h2>{kind === 'return' ? '3. LÝ DO TRẢ HÀNG' : '2. LÝ DO HUỶ ĐƠN'}</h2><select defaultValue="Sản phẩm không đúng mô tả"><option>Sản phẩm không đúng mô tả</option><option>Sản phẩm bị hư hỏng</option><option>Đổi ý không muốn mua nữa</option><option>Lý do khác</option></select><textarea placeholder="Mô tả thêm về yêu cầu của bạn (không bắt buộc)" /></div><div className="return-actions"><span>{sent ? 'Yêu cầu đã được gửi.' : 'CrabShare sẽ phản hồi yêu cầu trong vòng 24 giờ.'}</span><button onClick={() => setSent(true)}>GỬI YÊU CẦU</button></div></div></section></main>
}

function OrderTracking() {
  const [details, setDetails] = useState(false)
  const steps = [['Đã đặt hàng', '09/09, 10:15'], ['Đang đóng gói', '09/09, 11:30'], ['Đang giao hàng', '09/09, 13:45'], ['Đã giao thành công', 'Dự kiến']]
  return <main className="commerce-page tracking-page"><section className="tracking-wrap"><header className="tracking-header"><div><h1>Đơn hàng #CS-20260909-014 <span>· Đang giao hàng</span></h1></div><p>Thời gian đặt: 09/09/2026, 10:15</p></header><section className="tracking-timeline"><div className="tracking-line"><i /></div><div className="tracking-steps">{steps.map(([name, time], index) => <div className={index < 3 ? `done ${index === 2 ? 'current' : ''}` : ''} key={name}><b /><strong>{name}</strong><span>{time}</span></div>)}</div><p>Dự kiến giao: <b>Hôm nay, 14:00 – 16:00 (Giao tươi sống 2h)</b></p></section><section className="tracking-card"><button onClick={() => setDetails(!details)}><span><b>3 sản phẩm</b> · Mẻ thu hoạch #CR-0142</span><em>Xem chi tiết {details ? '⌃' : '⌄'}</em></button>{details && <div className="tracking-items"><ProductRow /><ProductRow /><ProductRow /></div>}<div className="tracking-meta"><p><span>Địa chỉ giao hàng</span><b>Số 28 Đường Số 6, P. Tăng Nhơn Phú B, TP. Thủ Đức</b></p><p><span>Phương thức thanh toán</span><b>Thẻ / Chuyển khoản (Đã thanh toán)</b></p><p><span>Tổng thanh toán</span><b>1.455.000 đ</b></p></div></section></section></main>
}

function ProductDetail() {
  const { addToCart } = useDemoSession()
  const [size, setSize] = useState('Vừa (400g - 450g)')
  const [quantity, setQuantity] = useState(1)
  const [photo, setPhoto] = useState(0)
  const photos = ['storeCrab.png', 'storeCrab.png', 'storeCrab.png']
  return <main className="commerce-page product-page"><section className="product-detail-wrap"><div className="product-gallery"><div className="product-main-image"><img src={asset(photos[photo])} alt="Cua Gạch Son Cà Mau" /><span>Loại 1</span></div><div className="product-thumbnails">{photos.map((image, index) => <button className={photo === index ? 'active' : ''} onClick={() => setPhoto(index)} key={index}><img src={asset(image)} alt={`Góc chụp ${index + 1}`} /></button>)}</div></div><section className="product-info"><h1>Cua Gạch Son Cà Mau — Chuẩn RAS</h1><div className="product-detail-price">490.000 đ <span>/ con (khoảng 400g - 450g)</span></div><div className="product-choice"><b>CHỌN KÍCH CỠ</b><div>{['Vừa (400g - 450g)', 'Lớn (500g - 550g)', 'Đại (>600g)'].map((option) => <button key={option} onClick={() => setSize(option)} className={size === option ? 'active' : ''}>{option}</button>)}</div></div><div className="product-choice"><b>SỐ LƯỢNG</b><div className="product-quantity"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><strong>{quantity}</strong><button onClick={() => setQuantity((value) => value + 1)}>+</button></div></div><button className="product-add" onClick={() => { for (let i = 0; i < quantity; i += 1) addToCart() }}>🛒 THÊM VÀO GIỎ</button><p className="product-stock">● Còn hàng · Mẻ thu hoạch #CR-0142</p><div className="product-note"><b>Cam kết CrabShare</b><p>Nuôi tuần hoàn RAS, theo dõi nguồn gốc rõ ràng và giao tươi sống trong ngày.</p></div></section></section></main>
}

export default function CommercePage() {
  const path = window.location.pathname
  const { title, subtitle } = pageData[path] ?? pageData['/san-pham']
  const { addToCart, signedIn } = useDemoSession()
  const [submitted, setSubmitted] = useState(false)
  const isProduct = path === '/san-pham'
  const isTracking = path === '/theo-doi-don-hang'; const isHistory = path === '/lich-su-don-hang'
  if (path === '/danh-gia-don-hang') return <><SiteHeader /><ReviewOrder /><SiteFooter /></>
  if (path === '/lich-su-don-hang') return <><SiteHeader /><OrderHistory /><SiteFooter /></>
  if (path === '/huy-tra-hang') return <><SiteHeader /><ReturnRequest /><SiteFooter /></>
  if (path === '/theo-doi-don-hang') return <><SiteHeader /><OrderTracking /><SiteFooter /></>
  if (path === '/san-pham') return <><SiteHeader /><ProductDetail /><SiteFooter /></>
  return <><SiteHeader /><main className="commerce-page"><div className="commerce-wrap"><p className="commerce-breadcrumb"><a href="/">TRANG CHỦ</a> / <span>{title.toUpperCase()}</span></p><h1>{title}</h1><p className="commerce-subtitle">{subtitle}</p>
    {isProduct ? <section className="commerce-detail"><img src={asset('storeCrab.png')} alt="Cua Gạch Son Cà Mau" /><div><span className="commerce-badge">LOẠI 1 · 450G</span><h2>Cua gạch tươi sống, nuôi tuần hoàn RAS</h2><p>Minh bạch nguồn gốc, giao trong ngày tại TP. Hồ Chí Minh.</p><strong className="commerce-price">490.000 đ</strong><button className="commerce-button" onClick={addToCart}>THÊM VÀO GIỎ</button></div></section> : isTracking ? <section className="commerce-card commerce-centered"><div className="commerce-status">✓</div><h2>Đơn hàng đang được giao đến bạn</h2><p>{subtitle}</p><div className="commerce-steps"><b>Đã xác nhận</b><b>Đang chuẩn bị</b><b>Đang giao</b><b>Hoàn thành</b></div><a className="commerce-button" href="/theo-doi-don-hang">THEO DÕI ĐƠN HÀNG</a></section> : isHistory ? <section className="commerce-card"><div className="commerce-tabs"><b>TẤT CẢ</b><span>ĐANG XỬ LÝ</span><span>HOÀN THÀNH</span></div><ProductRow /><div className="commerce-actions"><span>Đã giao thành công</span><a href="/danh-gia-don-hang">ĐÁNH GIÁ</a><a href="/huy-tra-hang">YÊU CẦU TRẢ HÀNG</a></div></section> : <section className="commerce-card commerce-centered"><h2>{submitted ? 'Cảm ơn đánh giá của bạn!' : title}</h2><p>{subtitle}</p><div className="commerce-stars">★★★★★</div><textarea placeholder="Viết nhận xét của bạn" /><button className="commerce-button" onClick={() => setSubmitted(true)}>{path === '/huy-tra-hang' ? 'GỬI YÊU CẦU' : 'GỬI ĐÁNH GIÁ'}</button></section>}
    {!signedIn && !isProduct && <p className="commerce-login-note">Đăng nhập demo để xem hồ sơ và giỏ hàng trên header.</p>}
  </div></main><SiteFooter /></>
}

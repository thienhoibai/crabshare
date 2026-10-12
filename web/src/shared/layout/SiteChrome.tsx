import { useState } from 'react'
import { useDemoSession } from '../auth/session'

const asset = (name: string) => `/assets/${name}`

const navItems = [
  { label: 'CÁCH HOẠT ĐỘNG', href: '/#cach-hoat-dong' },
  { label: 'LÔ ĐẦU TƯ', href: '/#lo-goi-von' },
  { label: 'CỬA HÀNG', href: '/cua-hang' },
  { label: 'TRUY XUẤT', href: '/#tra-cuu' },
  { label: 'NGƯỜI NUÔI', href: '/operator/register' },
]

type SiteHeaderProps = { variant?: 'overlay' | 'solid' }

export function SiteHeader({ variant = 'solid' }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { signedIn, role, cartCount, signOut } = useDemoSession()
  const isOverlay = variant === 'overlay'

  return (
    <header className={`relative z-30 ${isOverlay ? 'text-white' : 'bg-[#171717] text-white'}`}>
      <nav className="page-container flex items-center justify-between gap-6 py-5" aria-label="Điều hướng chính">
        <a className="flex shrink-0 items-center gap-3" href="/" aria-label="CrabShare, về trang chủ">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-white/80 bg-black/20"><img src={asset('imgSvg.svg')} alt="" /></span>
          <span className="flex flex-col leading-none"><strong className="text-xs tracking-[0.1em]">CRAB</strong><strong className="mt-1 text-sm tracking-[0.05em]">SHARE</strong><small className="mt-1 text-[8px] tracking-tight text-amber-100">NUÔI CUA · ĐẦU TƯ · LỢI NHUẬN</small></span>
        </a>
        <div className="hidden items-center gap-7 lg:flex">
          {navItems.map((item) => <a key={item.label} className="nav-link" href={item.href}>{item.label}</a>)}
        </div>
        <div className="hidden items-center gap-3 lg:flex">{signedIn ? <><a className="pill-button border border-white/50 px-4 py-2 text-[11px]" href="/gio-hang">GIỎ HÀNG ({cartCount})</a><details className="relative"><summary className="cursor-pointer list-none rounded-full bg-white px-4 py-2 text-[11px] font-bold text-black">👤 {role === 'customer' ? 'NGUYỄN AN' : 'MINH ANH'}</summary><div className="absolute right-0 mt-2 w-40 rounded-xl bg-white p-3 text-xs text-[#171717] shadow-xl">{role !== 'customer' && <a className="block py-2 font-semibold" href="/investor">Không gian Investor</a>}<a className="block py-2" href="/lich-su-don-hang">Đơn hàng của tôi</a><button className="pt-2 text-[#8b5023]" onClick={signOut}>Đăng xuất</button></div></details></> : <><a className="pill-button border border-white/50 px-5 py-2 text-[11px]" href="/dang-nhap">ĐĂNG NHẬP</a><a className="pill-button bg-white px-5 py-2 text-[11px] text-black" href="/dang-ky">ĐĂNG KÝ</a></>}</div>
        <button className="rounded-full border border-white/50 px-4 py-2 text-xs font-bold lg:hidden" onClick={() => setMenuOpen((current) => !current)} aria-expanded={menuOpen} aria-controls="mobile-menu">{menuOpen ? 'ĐÓNG' : 'MENU'}</button>
      </nav>
      {menuOpen && <div id="mobile-menu" className="page-container absolute inset-x-0 top-full z-40"><div className="flex flex-col gap-2 rounded-2xl border border-white/20 bg-[#171717] p-5 shadow-2xl">{navItems.map((item) => <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="py-2 text-xs font-semibold tracking-wider">{item.label}</a>)}<div className="mt-2 flex flex-wrap gap-2">{signedIn ? <>{role !== 'customer' && <a className="pill-button bg-[#8b5023] px-4 py-2 text-xs" href="/investor">KHÔNG GIAN INVESTOR</a>}<a className="pill-button border border-white/40 px-4 py-2 text-xs" href="/gio-hang">GIỎ HÀNG ({cartCount})</a><a className="pill-button bg-white px-4 py-2 text-xs text-black" href="/lich-su-don-hang">ĐƠN HÀNG CỦA TÔI</a><button className="pill-button border border-white/40 px-4 py-2 text-xs" onClick={signOut}>ĐĂNG XUẤT</button></> : <><a className="pill-button border border-white/40 px-4 py-2 text-xs" href="/dang-nhap">ĐĂNG NHẬP</a><a className="pill-button bg-white px-4 py-2 text-xs text-black" href="/dang-ky">ĐĂNG KÝ</a></>}</div></div></div>}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer id="lien-he" className="bg-[#f9f8f6] text-[12px] text-gray-600">
      <div className="page-container grid gap-10 pb-14 pt-16 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3"><h3 className="footer-title">Thông Tin Liên Hệ</h3><p>Hotline: <a href="tel:1900888626">1900 888 626</a></p><p>Email: <a href="mailto:invest@crabshare.vn">invest@crabshare.vn</a></p><p><strong className="text-gray-800">Trụ sở chính:</strong><br />Khu Công Nghệ Cao,<br />TP. Thủ Đức, TP. Hồ Chí Minh,<br />Việt Nam</p></div>
        <div><h3 className="footer-title">Liên Kết Nhanh</h3><ul className="mt-4 space-y-2"><li><a href="/">Trang chủ</a></li><li><a href="/#lo-goi-von">Lô đầu tư</a></li><li><a href="/#cach-hoat-dong">Cách hoạt động</a></li><li><a href="/cua-hang">Cửa hàng hải sản</a></li><li><a href="/#tra-cuu">Truy xuất nguồn gốc</a></li><li><a href="/#nguoi-nuoi">Người nuôi</a></li><li><a href="mailto:invest@crabshare.vn">Liên hệ đối tác</a></li></ul></div>
        <div className="space-y-4"><h3 className="footer-title">Chứng Nhận Pháp Lý</h3><p>Công ty Cổ phần Công nghệ CrabShare<br /><strong className="text-gray-900">Mã số DN:</strong> 0318928419</p><p>Chứng nhận Tiêu chuẩn Cơ sở Nuôi tuần hoàn<br />Hệ thống RAS & VietGAP Nuôi trồng thuỷ sản<br /><a href="/#lien-he" className="font-semibold underline">Xem Chứng Nhận</a></p><p>Hợp tác chuỗi bao tiêu HACCP & ISO 22000<br /><a href="/#lien-he" className="font-semibold underline">Xem Chứng Nhận</a></p></div>
        <div><h3 className="footer-title">Ứng Dụng</h3><div className="mt-4 flex flex-col items-start gap-2"><a href="/dang-nhap" className="pill-button w-28 bg-black py-2 text-[11px] text-white">ĐĂNG NHẬP</a><a href="/dang-ky" className="pill-button w-28 bg-black py-2 text-[11px] text-white">ĐĂNG KÝ</a></div></div>
      </div>
      <div className="page-container flex flex-col items-center justify-between gap-5 border-t border-gray-200 py-7 text-[11px] sm:flex-row"><p>© 2024-2026 CrabShare Vietnam. Bản quyền được bảo hộ.</p><div className="flex items-center gap-5">{['imgLinkTwitter.svg', 'imgLinkFacebook.svg', 'imgLinkedIn.svg', 'imgLinkYouTube.svg'].map((icon) => <a key={icon} href="/" aria-label={icon.replace('imgLink', '').replace('.svg', '')}><img src={asset(icon)} alt="" /></a>)}<a href="tel:1900888626" aria-label="Gọi CrabShare"><img src={asset('imgLinkPhone.svg')} alt="" /></a><a href="mailto:invest@crabshare.vn" aria-label="Email CrabShare"><img src={asset('imgLinkEmail.svg')} alt="" /></a></div></div>
    </footer>
  )
}

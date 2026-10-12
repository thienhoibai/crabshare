/* Dữ liệu mô phỏng dùng chung cho các bản thiết kế lại cửa hàng và cổng nhà đầu tư.
   Bám luật nghiệp vụ: mỗi đơn thuộc đúng một lô, giữ hàng/giữ chỗ 15 phút, đặt trước cọc 15%,
   góp tối thiểu max(1 triệu; 1% mục tiêu), dải vốn 80/100/120%, thù lao người nuôi 7% chỉ khi Pool dương,
   không hiển thị lợi suất kỳ vọng. */
import { settle } from '../../../features/landing/settlement'

const px = (id: string, w = 1200, file?: string) =>
  `https://images.pexels.com/photos/${id}/${file ?? `pexels-photo-${id}.jpeg`}?auto=compress&cs=tinysrgb&w=${w}`

export const IMG = {
  gach: '/minhbach/cua-gach-card.jpg',
  thit: '/minhbach/cua-thit-card.jpg',
  hop: '/minhbach/cua-hop-card.jpg',
  com: '/minhbach/cua-com-card.jpg',
  qr: '/minhbach/truy-xuat.png',
  tied: px('38549558', 1600),
  steamer: px('34618081'),
  sauce: px('20943894'),
  claws: px('12918202'),
  pot: px('24186313', 1200, 'pexels-photo-24186313/free-photo-of-crab-served-on-pan.jpeg'),
  handPick: px('8940060'),
  bound: px('10432611'),
  monoBox: px('3947295'),
  mangroveBoat: px('14021567'),
  mangroveWater: px('29865226', 1200, 'pexels-photo-29865226/free-photo-of-lush-mangrove-forest-with-serene-waterway.jpeg'),
  sorter: px('23938824', 1200, 'pexels-photo-23938824/free-photo-of-woman-in-hat-working.jpeg'),
}
export const small = (src: string, w = 720) => (src.startsWith('http') ? src.replace(/w=\d+/, `w=${w}`) : src)

/* ---------- định dạng ---------- */
const nf = new Intl.NumberFormat('vi-VN')
export const vnd = (v: number) => `${nf.format(Math.round(v))} đ`
export const tr = (v: number, digits = 1) => `${(v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: digits })} triệu`
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

/* ---------- cửa hàng ---------- */
export type Size = { label: string; price: number }
export type Product = {
  id: string
  name: string
  kind: 'Cua thịt' | 'Cua gạch' | 'Cua cốm' | 'Cua lột' | 'Chế biến'
  unit: string
  sizes: Size[]
  lot: string
  img: string
  stock: number
  preorder?: boolean
  harvest: string
  /** Các trường dưới chỉ có ở sản phẩm lấy từ API cửa hàng; sản phẩm mẫu bỏ trống. */
  soldOut?: boolean
  farm?: string
  crab?: string
  traceTag?: string | null
  gallery?: string[]
}

export const OPERATOR = 'HTX Nuôi cua Cà Mau'

export const PRODUCTS: Product[] = [
  { id: 'gach', name: 'Cua gạch son', kind: 'Cua gạch', unit: 'kg', sizes: [{ label: '350–400 g', price: 690_000 }, { label: '400–500 g', price: 790_000 }], lot: 'L2610-05', img: IMG.gach, stock: 18, harvest: '24/09/2026' },
  { id: 'thit', name: 'Cua thịt chắc', kind: 'Cua thịt', unit: 'kg', sizes: [{ label: '400–500 g', price: 520_000 }, { label: '500–600 g', price: 590_000 }], lot: 'L2701-01', img: IMG.thit, stock: 42, harvest: '27/09/2026' },
  { id: 'com', name: 'Cua cốm', kind: 'Cua cốm', unit: 'kg', sizes: [{ label: '250–300 g', price: 610_000 }], lot: 'L2610-06', img: IMG.com, stock: 9, harvest: '22/09/2026' },
  { id: 'combo', name: 'Combo cua thịt 2 kg', kind: 'Cua thịt', unit: 'combo', sizes: [{ label: '2 kg · 4–5 con', price: 990_000 }], lot: 'L2701-01', img: IMG.hop, stock: 12, harvest: '27/09/2026' },
  { id: 'tuyen', name: 'Cua gạch tuyển', kind: 'Cua gạch', unit: 'kg', sizes: [{ label: 'trên 500 g', price: 890_000 }], lot: 'L2610-05', img: IMG.handPick, stock: 6, harvest: '24/09/2026' },
  { id: 'pre', name: 'Cua thịt đặt trước', kind: 'Cua thịt', unit: 'kg', sizes: [{ label: '400–500 g', price: 500_000 }], lot: 'L2612-02', img: IMG.bound, stock: 60, preorder: true, harvest: 'dự kiến 20/12/2026' },
  { id: 'hap', name: 'Cua hấp sẵn', kind: 'Chế biến', unit: 'con', sizes: [{ label: '1 con · ~450 g', price: 285_000 }], lot: 'L2701-01', img: IMG.steamer, stock: 20, harvest: '27/09/2026' },
  { id: 'lau', name: 'Set lẩu cua 4 người', kind: 'Chế biến', unit: 'set', sizes: [{ label: 'Set 4 người', price: 1_150_000 }], lot: 'L2610-06', img: IMG.pot, stock: 5, harvest: '22/09/2026' },
]
export const KINDS = ['Tất cả', 'Cua thịt', 'Cua gạch', 'Cua cốm', 'Chế biến', 'Đặt trước'] as const
export type KindFilter = (typeof KINDS)[number]
export const filterProducts = (k: KindFilter) =>
  PRODUCTS.filter((p) => (k === 'Tất cả' ? true : k === 'Đặt trước' ? p.preorder : p.kind === k && !p.preorder))
export const product = (id: string) => PRODUCTS.find((p) => p.id === id)!
export const DEPOSIT = 0.15
export const HOLD_MIN = 15

/* ---------- lô nuôi ---------- */
export type Stage = 'soon' | 'funding' | 'growing' | 'harvest' | 'settle' | 'closed'
export const STAGES: { key: Stage; label: string; tone: string }[] = [
  { key: 'funding', label: 'Đang gọi vốn', tone: '#3fcf8e' },
  { key: 'growing', label: 'Đang nuôi', tone: '#4fb3ff' },
  { key: 'harvest', label: 'Thu hoạch & bán', tone: '#f5b93b' },
  { key: 'settle', label: 'Quyết toán', tone: '#ff7a3d' },
  { key: 'soon', label: 'Sắp mở', tone: '#a8a296' },
  { key: 'closed', label: 'Đã chia xong', tone: '#7d786e' },
]
export const stage = (s: Stage) => STAGES.find((x) => x.key === s)!
export const LIFE = ['Gọi vốn', 'Nuôi', 'Thu hoạch & bán', 'Quyết toán'] as const
export const lifeIndex = (s: Stage) => ({ soon: -1, funding: 0, growing: 1, harvest: 2, settle: 3, closed: 4 })[s]

export type CostLine = { label: string; value: number; reserve?: boolean }
export type Lot = {
  code: string
  crab: string
  boxes: number
  img: string
  stage: Stage
  target: number
  confirmed: number
  cycleDays: number
  day?: number
  when: string
  note: string
  pool?: number
}
const COST_SHARE: [string, number, boolean?][] = [
  ['Cua giống', 0.52],
  ['Thức ăn', 0.18],
  ['Điện, nước, lọc', 0.07],
  ['Khấu hao hộp nuôi', 0.04],
  ['Nhân công', 0.04],
  ['Dự phòng hao hụt', 0.15, true],
]
export const costOf = (l: Lot): CostLine[] => COST_SHARE.map(([label, s, reserve]) => ({ label, value: Math.round(l.target * s), reserve }))
export const minContribution = (l: Lot) => Math.max(1_000_000, Math.round(l.target / 100))
export const maxCapital = (l: Lot) => Math.round(l.target * 1.2)
export const minCapital = (l: Lot) => Math.round(l.target * 0.8)

export const LOTS: Lot[] = [
  { code: 'L2612-01', crab: 'Cua thịt', boxes: 500, img: IMG.thit, stage: 'funding', target: 100_000_000, confirmed: 84_000_000, cycleDays: 60, when: 'còn 5 ngày gọi vốn', note: 'Đủ 80% thì lô chạy. Không đủ, tiền hoàn nguyên vẹn.' },
  { code: 'L2611-02', crab: 'Cua lột', boxes: 300, img: IMG.hop, stage: 'funding', target: 60_000_000, confirmed: 38_000_000, cycleDays: 45, when: 'còn 12 ngày gọi vốn', note: 'Cua lột nuôi ngắn ngày, bán trong 4 tháng sau thu.' },
  { code: 'L2612-03', crab: 'Cua cốm', boxes: 400, img: IMG.mangroveWater, stage: 'soon', target: 120_000_000, confirmed: 0, cycleDays: 55, when: 'mở sau 20 ngày', note: 'Standard Cost đang chờ duyệt.' },
  { code: 'L2612-02', crab: 'Cua gạch', boxes: 400, img: IMG.com, stage: 'growing', target: 80_000_000, confirmed: 80_000_000, cycleDays: 60, day: 34, when: 'ngày 34 / 60', note: 'Đã giải ngân đợt 1 và 2. Đang nhận đặt trước.' },
  { code: 'L2701-01', crab: 'Cua thịt', boxes: 500, img: IMG.handPick, stage: 'harvest', target: 100_000_000, confirmed: 100_000_000, cycleDays: 60, when: '412 / 500 con đã thu', note: 'Đang bán trên cửa hàng. Tiền bán về tài khoản lô.' },
  { code: 'L2610-05', crab: 'Cua gạch', boxes: 360, img: IMG.gach, stage: 'harvest', target: 90_000_000, confirmed: 96_000_000, cycleDays: 60, when: 'bán tháng 1 / 4', note: 'Lô vượt mục tiêu, dừng ở 107% vốn.' },
  { code: 'L2610-06', crab: 'Cua cốm', boxes: 320, img: IMG.sorter, stage: 'harvest', target: 64_000_000, confirmed: 64_000_000, cycleDays: 55, when: 'bán tháng 2 / 4', note: 'Còn ít hàng trên cửa hàng.' },
  { code: 'L2611-01', crab: 'Cua thịt', boxes: 500, img: IMG.tied, stage: 'settle', target: 100_000_000, confirmed: 100_000_000, cycleDays: 60, when: 'còn 5 ngày để soát', note: 'Bảng quyết toán đã gửi. Bạn có 7 ngày để phản hồi.', pool: 26_000_000 },
  { code: 'L2610-03', crab: 'Cua gạch', boxes: 300, img: IMG.monoBox, stage: 'closed', target: 70_000_000, confirmed: 70_000_000, cycleDays: 60, when: 'đã chia 100%', note: 'Đã chi trả cho mọi nhà đầu tư.' },
]
export const lot = (code: string) => LOTS.find((l) => l.code === code)!

/* ---------- danh mục của nhà đầu tư mẫu ---------- */
export const INVESTOR = { name: 'Minh Anh', initials: 'MA' }
export type Holding = { code: string; amount: number }
export const HOLDINGS: Holding[] = [
  { code: 'L2612-02', amount: 20_000_000 },
  { code: 'L2701-01', amount: 30_000_000 },
  { code: 'L2611-01', amount: 50_000_000 },
  { code: 'L2610-03', amount: 15_000_000 },
]
export const activeHoldings = HOLDINGS.filter((h) => lot(h.code).stage !== 'closed')
export const activeTotal = activeHoldings.reduce((s, h) => s + h.amount, 0)

/** Quyết toán lô L2611-01 (ví dụ do-an.md 4.4: doanh thu 126 triệu, chi phí khoá 100 triệu). */
export const SETTLE_2611 = settle({
  revenue: 126_000_000n,
  lockedStandardCost: 100_000_000n,
  reserveTotal: 15_000_000n,
  reserveUsed: 15_000_000n,
  operatorPct: 7,
  contributions: [
    { id: 1, name: 'Bạn', amount: 50_000_000n },
    { id: 2, name: 'Nhà đầu tư B', amount: 30_000_000n },
    { id: 3, name: 'Nhà đầu tư C', amount: 20_000_000n },
  ],
})
export const myPayout2611 = Number(SETTLE_2611.lines[0].payout)
export const closedPayout2610 = 16_240_000

export const NOTICES = [
  { t: 'Bảng quyết toán L2611-01 đã sẵn sàng', s: 'Còn 5 ngày để soát' },
  { t: 'L2612-02 nộp bằng chứng đợt 2', s: 'Ảnh và nhật ký ngày 34' },
  { t: 'L2701-01 bán được 412 con', s: 'Tiền về tài khoản lô' },
]

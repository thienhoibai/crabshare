/* Menu của từng cổng. Thêm trang mới: thêm một dòng ở đây và một route trong features/<cổng>/routes.tsx.
   Mục đang chọn được tính từ đường dẫn (href dài nhất khớp với đầu đường dẫn hiện tại). */
import {
  BadgeCheck, BellRing, Boxes, Building2, Camera, ClipboardCheck, ClipboardList, Coins, Cpu, FileSignature, Flag, Gavel, HandCoins, Handshake, Home,
  LayoutGrid, MapPin, MessageSquareWarning, NotebookPen, Package, Receipt, Ruler, ScanEye, ScrollText, Settings, ShieldCheck, ShoppingBag, Sprout, Truck,
  Users, Vote, Wallet, type LucideIcon,
} from 'lucide-react'
import type { Role } from '../../auth/authStore'

export type Area = 'operator' | 'qc' | 'admin' | 'investor' | 'customer'

export interface NavItem {
  href: string
  icon: LucideIcon
  label: string
  /** Hiện ở thanh dưới trên di động (tối đa 4 mục mỗi cổng). */
  tab?: boolean
  /** Nhãn ngắn cho thanh dưới trên di động. */
  short?: string
  /** Chỉ hiện với một trong các vai trò này. */
  roles?: Role[]
}

export interface AreaConfig {
  /** Trang gốc của cổng. */
  home: string
  /** Tên cổng hiện trong thẻ đầu menu. */
  title: string
  /** Vai trò được vào cổng. */
  roles: Role[]
  /** Chuông ở thanh trên trỏ tới đâu. */
  bell?: string
  /** Trang hồ sơ của người dùng, mở từ menu khi bấm avatar ở góc phải (không lặp lại ở menu trái). */
  profile?: { href: string; label: string }
  groups: { label: string; items: NavItem[] }[]
}

export const AREAS: Record<Area, AreaConfig> = {
  operator: {
    home: '/operator',
    title: 'Người nuôi',
    roles: ['OperatorMember'],
    bell: '/operator/alerts',
    groups: [
      {
        label: 'Vận hành',
        items: [
          { href: '/operator', icon: Home, label: 'Tổng quan', tab: true },
          { href: '/operator/batches', icon: LayoutGrid, label: 'Lô của tôi', short: 'Lô', tab: true },
          { href: '/operator/boxes', icon: Boxes, label: 'Hộp nuôi' },
          { href: '/operator/log', icon: NotebookPen, label: 'Nhật ký chăm sóc', short: 'Nhật ký', tab: true },
          { href: '/operator/devices', icon: Cpu, label: 'Thiết bị' },
          { href: '/operator/alerts', icon: BellRing, label: 'Cảnh báo' },
          { href: '/operator/evidence', icon: Flag, label: 'Bằng chứng cần giải trình' },
        ],
      },
      {
        label: 'Bán và giao',
        items: [
          { href: '/operator/preorders', icon: ShoppingBag, label: 'Đơn đặt trước' },
          { href: '/operator/deliveries', icon: Truck, label: 'Giao hàng', tab: true },
          { href: '/operator/claims', icon: MessageSquareWarning, label: 'Khiếu nại, trả hàng' },
        ],
      },
      {
        label: 'Tiền',
        items: [
          { href: '/operator/disbursements', icon: HandCoins, label: 'Giải ngân theo mốc' },
          { href: '/operator/contract', icon: FileSignature, label: 'Hợp đồng góp vốn' },
          { href: '/operator/settlement', icon: Receipt, label: 'Quyết toán' },
          { href: '/operator/payout-account', icon: Wallet, label: 'Tài khoản nhận tiền' },
        ],
      },
      {
        label: 'Hồ sơ',
        items: [
          { href: '/operator/register', icon: Building2, label: 'Hồ sơ hộ nuôi' },
          { href: '/operator/partners', icon: Handshake, label: 'Nhà cung cấp, bên thu mua' },
          { href: '/operator/members', icon: Users, label: 'Nhân viên' },
        ],
      },
    ],
  },

  qc: {
    home: '/qc',
    title: 'Nhân viên kiểm phẩm',
    roles: ['QcInspector'],
    groups: [
      {
        label: 'Việc được giao',
        items: [
          { href: '/qc', icon: ClipboardList, label: 'Tất cả việc', short: 'Việc', tab: true },
          { href: '/qc/kiem-dau-vao', icon: ClipboardCheck, label: 'Kiểm đầu vào', short: 'Đầu vào', tab: true },
          { href: '/qc/phan-hang', icon: Ruler, label: 'Duyệt phân hạng', short: 'Phân hạng', tab: true },
          { href: '/qc/tham-trai', icon: MapPin, label: 'Thăm trại giữa vụ', short: 'Thăm trại', tab: true },
        ],
      },
      {
        label: 'Tra cứu',
        items: [{ href: '/qc/chuan', icon: ScrollText, label: 'Chuẩn phân hạng' }],
      },
    ],
  },

  admin: {
    home: '/admin',
    title: 'Quản trị nền tảng',
    roles: ['PlatformAdmin', 'EvidenceReviewer'],
    bell: '/admin/alerts',
    groups: [
      {
        label: 'Tổng quan',
        items: [{ href: '/admin', icon: Home, label: 'Bảng điều khiển', short: 'Tổng quan', tab: true, roles: ['PlatformAdmin'] }],
      },
      {
        label: 'Đối tác và tài khoản',
        items: [
          { href: '/admin/parties', icon: Handshake, label: 'Đối tác', roles: ['PlatformAdmin'] },
          { href: '/admin/operators', icon: Building2, label: 'Hộ nuôi', roles: ['PlatformAdmin'] },
          { href: '/admin/users', icon: Users, label: 'Người dùng và eKYC', roles: ['PlatformAdmin'] },
          { href: '/admin/qc', icon: BadgeCheck, label: 'Nhân viên kiểm phẩm', roles: ['PlatformAdmin'] },
        ],
      },
      {
        label: 'Lô',
        items: [
          { href: '/admin/batches', icon: LayoutGrid, label: 'Duyệt và tạo Lô', short: 'Lô', tab: true, roles: ['PlatformAdmin'] },
          { href: '/admin/funding', icon: Coins, label: 'Gọi vốn', roles: ['PlatformAdmin'] },
        ],
      },
      {
        label: 'Chất lượng',
        items: [
          { href: '/admin/grading', icon: Ruler, label: 'Bộ quy tắc phân hạng', roles: ['PlatformAdmin'] },
          { href: '/admin/devices', icon: Cpu, label: 'Thiết bị', roles: ['PlatformAdmin'] },
          { href: '/admin/evidence', icon: ScanEye, label: 'Thẩm định bằng chứng', roles: ['EvidenceReviewer'] },
          { href: '/admin/alerts', icon: BellRing, label: 'Cảnh báo', roles: ['PlatformAdmin'] },
          { href: '/admin/claims', icon: Gavel, label: 'Khiếu nại chờ quyết định', roles: ['PlatformAdmin'] },
        ],
      },
      {
        label: 'Tiền',
        items: [
          { href: '/admin/tranches', icon: HandCoins, label: 'Duyệt giải ngân', short: 'Giải ngân', tab: true, roles: ['PlatformAdmin'] },
          { href: '/admin/finance', icon: Wallet, label: 'Lệnh chi và đối soát', roles: ['PlatformAdmin'] },
          { href: '/admin/settlements', icon: Receipt, label: 'Quyết toán', tab: true, roles: ['PlatformAdmin'] },
        ],
      },
      {
        label: 'Hệ thống',
        items: [
          { href: '/admin/parameters', icon: Settings, label: 'Tham số nền tảng', roles: ['PlatformAdmin'] },
          { href: '/admin/audit-log', icon: ShieldCheck, label: 'Nhật ký kiểm toán', roles: ['PlatformAdmin'] },
        ],
      },
    ],
  },

  investor: {
    home: '/nha-dau-tu',
    title: 'Nhà đầu tư',
    roles: ['Investor'],
    bell: '/nha-dau-tu/thong-bao',
    profile: { href: '/nha-dau-tu/ho-so', label: 'Hồ sơ và xác minh' },
    groups: [
      {
        label: 'Góp vốn',
        items: [
          { href: '/nha-dau-tu', icon: Home, label: 'Tổng quan', tab: true },
          { href: '/nha-dau-tu/lo', icon: Sprout, label: 'Lô đang gọi vốn', short: 'Gọi vốn', tab: true },
          { href: '/nha-dau-tu/danh-muc', icon: Package, label: 'Lô tôi đã góp', short: 'Lô đã góp', tab: true },
          { href: '/nha-dau-tu/bieu-quyet', icon: Vote, label: 'Biểu quyết' },
        ],
      },
      {
        label: 'Giấy tờ và tiền',
        items: [
          { href: '/nha-dau-tu/hop-dong', icon: FileSignature, label: 'Hợp đồng' },
          { href: '/nha-dau-tu/quyet-toan', icon: Receipt, label: 'Quyết toán', tab: true },
        ],
      },
    ],
  },

  customer: {
    home: '/khach',
    title: 'Khách hàng',
    roles: ['Customer'],
    bell: '/khach/giao-hang',
    profile: { href: '/khach/ho-so', label: 'Hồ sơ' },
    groups: [
      {
        label: 'Đặt trước',
        items: [
          { href: '/khach', icon: ShoppingBag, label: 'Đơn của tôi', short: 'Đơn', tab: true },
          { href: '/khach/lo', icon: Sprout, label: 'Lô nhận đặt trước', short: 'Đặt trước', tab: true },
          { href: '/khach/giao-hang', icon: Truck, label: 'Giao hàng và nghiệm thu', short: 'Giao hàng', tab: true },
        ],
      },
      {
        label: 'Tài khoản',
        items: [
          { href: '/khach/dia-diem', icon: MapPin, label: 'Địa điểm nhận hàng' },
        ],
      },
    ],
  },
}

/** Icon dùng lại ở các trang (để khỏi nhập lẻ tẻ). */
export const NavIcons = { Camera, Truck, Package, Receipt, Ruler }

/** Các cổng mà một người dùng được vào, theo vai trò. */
export const areasFor = (roles: readonly string[]): Area[] =>
  (Object.keys(AREAS) as Area[]).filter((a) => AREAS[a].roles.some((r) => roles.includes(r)))

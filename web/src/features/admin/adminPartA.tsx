/* Phần dùng chung của nhóm trang quản trị A: đối tác, hộ nuôi, người dùng, kiểm phẩm, Lô, gọi vốn, tham số, nhật ký kiểm toán.
   Nhãn ở đây là các mã chưa có trong shared/ui/console/status.ts. */
import { useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AdminBatchResponse } from '../../shared/api/api.gen'
import { Field, OpBadge, TextArea, type Tone } from '../../shared/ui/console'

/** Bộ lọc và số trang giữ trên thanh địa chỉ để liên kết từ bảng điều khiển mở đúng hàng việc. Đổi bộ lọc thì về trang 1. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams()
  const get = (key: string) => params.get(key) ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const set = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params)
    if (!('page' in patch)) next.delete('page')
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '' || (key === 'page' && value === 1)) next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, { replace: true })
  }
  return { get, page, set }
}

/** Phân trang theo PagedResult của backend (page bắt đầu từ 1, pageSize tối đa 100). */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize && page <= 1) return null
  return (
    <div className="op-pager">
      <span>Trang {page} / {pages} · {total} dòng</span>
      <div>
        <button type="button" className="rd-iconbtn" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></button>
        <button type="button" className="rd-iconbtn" aria-label="Trang sau" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={18} /></button>
      </div>
    </div>
  )
}

/** Ô lý do trong hộp xác nhận. API giới hạn 300 ký tự. */
export function ReasonField({ value, onChange, label = 'Lý do', hint, required = true }: {
  value: string
  onChange: (value: string) => void
  label?: string
  hint?: string
  required?: boolean
}) {
  return (
    <Field label={label} required={required} hint={hint ?? `${value.length} / 300 ký tự`}>
      <TextArea value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} autoFocus />
    </Field>
  )
}

/* ---------- nhãn riêng của nhóm trang này ---------- */

/** Vai trò đăng nhập của tài khoản (app_user_role), khác với vai trò đối tác. */
const USER_ROLES: Record<string, [string, Tone]> = {
  PlatformAdmin: ['Quản trị', 'danger'],
  EvidenceReviewer: ['Thẩm định bằng chứng', 'info'],
  OperatorMember: ['Người nuôi', 'ok'],
  QcInspector: ['Nhân viên kiểm phẩm', 'warn'],
  Investor: ['Nhà đầu tư', 'gold'],
  Customer: ['Khách hàng', 'info'],
}
export const userRoleLabel = (code: string) => USER_ROLES[code]?.[0] ?? code
export const UserRoleBadge = ({ code }: { code: string }) => <OpBadge tone={USER_ROLES[code]?.[1] ?? 'mute'}>{userRoleLabel(code)}</OpBadge>
/** Các vai trò mà GET /api/admin/users nhận ở bộ lọc role. */
export const USER_ROLE_FILTERS = ['Investor', 'Customer', 'OperatorMember', 'PlatformAdmin', 'EvidenceReviewer'].map((value) => ({ value, label: userRoleLabel(value) }))

const KYC_TYPES: Record<string, string> = {
  OtpDeclaration: 'Khai báo và OTP',
  EkycIdFace: 'Giấy tờ và khuôn mặt',
  BankNameMatch: 'Khớp tên tài khoản ngân hàng',
}
export const kycTypeLabel = (code: string) => KYC_TYPES[code] ?? code
export const KYC_TYPE_OPTIONS = Object.entries(KYC_TYPES).map(([value, label]) => ({ value, label }))

/** Giai đoạn gọi vốn của một Lô (AdminFundingBatch.stage). */
const FUNDING_STAGES: Record<string, [string, Tone]> = {
  Scheduled: ['Chưa tới giờ mở', 'mute'],
  Open: ['Đang nhận góp', 'gold'],
  AwaitingClose: ['Quá hạn, chờ chốt', 'warn'],
  CapitalClosed: ['Đã chốt vốn', 'ok'],
  Cancelled: ['Đã huỷ, hoàn tiền', 'danger'],
}
export const FundingStageBadge = ({ stage }: { stage: string }) => <OpBadge tone={FUNDING_STAGES[stage]?.[1] ?? 'mute'}>{FUNDING_STAGES[stage]?.[0] ?? stage}</OpBadge>

const MILESTONE_KINDS: Record<string, string> = { Receipt: 'Nhận cua xong', MidCycle: 'Giữa vụ', Settlement: 'Quyết toán', Custom: 'Mốc riêng' }
export const milestoneKindLabel = (code: string | null | undefined) => (code ? MILESTONE_KINDS[code] ?? code : '—')

const COST_BEARERS: Record<string, string> = { Batch: 'Lô chịu', Executor: 'Đơn vị thực hiện tự chịu', Supplier: 'Nhà cung cấp chịu' }
export const costBearerLabel = (code: string | null | undefined) => COST_BEARERS[code ?? 'Batch'] ?? code ?? ''
export const COST_BEARER_OPTIONS = Object.entries(COST_BEARERS).map(([value, label]) => ({ value, label }))

export const settlementBasisLabel = (code: string) => (code === 'ActualCost' ? 'Chi phí thực tế có chứng từ' : 'Chi phí chuẩn đã khoá')

/** Trạng thái của một phiên bản kế hoạch chi phí (standard_cost_version.status). */
const COST_PLAN_STATUSES: Record<string, [string, Tone]> = {
  Draft: ['Bản nháp', 'mute'],
  Submitted: ['Đã gửi duyệt', 'warn'],
  Approved: ['Đã duyệt', 'ok'],
  Locked: ['Đã khoá', 'ok'],
  Superseded: ['Bản cũ', 'mute'],
}
export const CostPlanStatusBadge = ({ status }: { status: string }) => <OpBadge tone={COST_PLAN_STATUSES[status]?.[1] ?? 'mute'}>{COST_PLAN_STATUSES[status]?.[0] ?? status}</OpBadge>

/* ---------- kiểu dữ liệu lệch với api.gen.ts ---------- */

/** Mốc giải ngân trong AdminBatchResponse. api.gen.ts gắn nhầm kiểu đợt giao (hai record cùng tên TrancheResponse ở backend). */
export interface AdminBatchTranche {
  no: number
  kind: string | null
  name: string | null
  pct: number | null
  plannedAmount: number
  status: string
  unlockCondition: string
  releasedAt: string | null
}
export type AdminBatch = Omit<AdminBatchResponse, 'tranches'> & { tranches: AdminBatchTranche[] }
export interface AdminBatchPage { items: AdminBatch[]; page: number; pageSize: number; total: number }

/* ---------- ngày giờ ---------- */

/** Giá trị của ô datetime-local (giờ máy người dùng) thành ISO để gửi API; rỗng thì null. */
export const localToIso = (value: string): string | null => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Một thời điểm thành giá trị cho ô datetime-local (giờ máy người dùng, tới phút). */
export const toLocalInput = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Ngày hôm nay theo giờ Việt Nam, dạng yyyy-MM-dd, cộng thêm số ngày. */
export const vnDate = (addDays = 0): string => new Date(Date.now() + 7 * 3_600_000 + addDays * 86_400_000).toISOString().slice(0, 10)

/** Số thập phân của backend (2.0000) hiện gọn theo kiểu Việt Nam. */
export const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(value)

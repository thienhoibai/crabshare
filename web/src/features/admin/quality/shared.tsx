/* Phần dùng chung của nhóm B cổng quản trị (chất lượng và tiền): ô bảng hai dòng, phân trang, định dạng số,
   nhãn của các mã chưa có trong status.ts. */
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import './partB.css'

/** Ô bảng hai dòng: dòng chính và dòng phụ chữ nhỏ. */
export function Cell({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return <span className="ab-cell"><span>{main}</span>{sub ? <small>{sub}</small> : null}</span>
}

/** Thanh phân trang dưới bảng. Ẩn khi chỉ có một trang. */
export function Pager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <div className="op-pager">
      <span>Trang {page} / {pages}</span>
      <div>
        <button type="button" className="rd-iconbtn" aria-label="Trang trước" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={18} /></button>
        <button type="button" className="rd-iconbtn" aria-label="Trang sau" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={18} /></button>
      </div>
    </div>
  )
}

const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })

/** Số thập phân kiểu Việt Nam, tối đa ba chữ số lẻ. */
export const formatNumber = (value: number | null | undefined) => (value === null || value === undefined ? '—' : decimal.format(value))

export const formatKg = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${decimal.format(value)} kg`)

/** Điểm rủi ro của bằng chứng: máy chủ trả 0…1, hiện theo thang 100. */
export const riskText = (score: number | null) => (score === null ? 'Chưa chấm' : `${Math.round(score * 100)} / 100`)

/** Đã quá một mốc thời gian (so với giờ của máy đang xem). */
export const isPast = (iso: string | null | undefined) => !!iso && Date.parse(iso) <= Date.now()

/** Khiếu nại đang chờ Admin quyết định (BR-174): đã chuyển lên, hoặc người nuôi quá hạn phản hồi mà việc chuyển tự động chưa chạy. */
export const needsAdmin = (claim: { status: string; responseDueAt: string }) =>
  claim.status === 'Escalated' || (claim.status === 'Open' && isPast(claim.responseDueAt))

/* Các mã backend trả về mà status.ts chưa có nhãn. */
const EXTRA = {
  evidenceSource: { FarmApi: 'Thiết bị của trại', InAppCapture: 'Chụp trong ứng dụng', DocumentUpload: 'Tải chứng từ lên' },
  mediaType: { Photo: 'Ảnh', Video: 'Video', Invoice: 'Chứng từ' },
  verdict: { Pass: 'Chấp nhận', Fail: 'Không chấp nhận', NeedMoreEvidence: 'Yêu cầu bổ sung' },
  scopeType: { Box: 'Hộp', Rack: 'Dàn', Holding: 'Đợt lưu nuôi', QcStation: 'Trạm kiểm phẩm' },
  deviceSource: { Real: 'Thiết bị thật', Simulated: 'Giả lập' },
  boundary: { LowerInclusive: 'Gồm cận dưới', UpperInclusive: 'Gồm cận trên', BothInclusive: 'Gồm cả hai cận' },
  basis: { StandardCost: 'Chi phí chuẩn', ActualCost: 'Chi phí thực tế có chứng từ' },
} satisfies Record<string, Record<string, string>>

export type ExtraKind = keyof typeof EXTRA

/** Nhãn tiếng Việt cho các mã chưa có trong status.ts; mã lạ thì hiện nguyên mã. */
export const extraLabel = (kind: ExtraKind, value: string | null | undefined): string =>
  (value ? (EXTRA[kind] as Record<string, string>)[value] ?? value : '')

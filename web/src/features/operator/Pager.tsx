/* Thanh chuyển trang cho các danh sách phân trang của cổng người nuôi (lớp op-pager của bộ kit). */
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pager({ page, pageSize, total, unit, onChange }: { page: number; pageSize: number; total: number; unit: string; onChange: (page: number) => void }) {
  if (total <= pageSize) return null
  return (
    <div className="op-pager">
      <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} trong {new Intl.NumberFormat('vi-VN').format(total)} {unit}</span>
      <div>
        <button type="button" className="rd-iconbtn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước"><ChevronLeft size={18} /></button>
        Trang {page}
        <button type="button" className="rd-iconbtn" disabled={page * pageSize >= total} onClick={() => onChange(page + 1)} aria-label="Trang sau"><ChevronRight size={18} /></button>
      </div>
    </div>
  )
}

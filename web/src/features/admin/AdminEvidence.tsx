import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { RefreshCw, Search } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import AdminLayout from './AdminLayout'
import { AdminPagination, AdminStatusBadge, adminButton, adminField } from './adminAccountUi'
import { evidenceStatuses, reviewEvidence } from './evidenceReviewApi'

export default function AdminEvidence() {
  const userId = useAuthStore(s => s.user?.userId)
  const [status, setStatus] = useState('Flagged')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['review-evidence', userId, status, q, page], queryFn: ({ signal }) => reviewEvidence(status, q, page, signal), enabled: !!userId, retry: false })
  return <AdminLayout activeTab="evidence">
    <header className="mb-6"><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Thẩm định bằng chứng</h1><p className="mt-1 text-sm text-slate-500">Kiểm tra ảnh, dữ liệu chụp và giải trình trước khi ghi phán quyết. Lô bạn đã góp vốn được loại khỏi danh sách.</p></header>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50 p-4">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Tìm bằng chứng</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" placeholder="Mã bằng chứng, lô, trại hoặc hộp…" className={adminField + ' pl-9!'} maxLength={100} value={q} onChange={e => { setQ(e.target.value); setPage(1) }} /></label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">Trạng thái<select aria-label="Trạng thái bằng chứng" className={adminField} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>{Object.entries(evidenceStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className={adminButton} disabled={query.isFetching} onClick={() => { void query.refetch() }}><RefreshCw size={16} /> Làm mới</button>
      </div>
      {query.isPending ? <p role="status" className="p-8 text-sm text-slate-500">Đang tải bằng chứng…</p> : query.isError ? <div role="alert" className="p-8"><p className="text-red-700">{errorMessage(query.error)}</p><button className={adminButton + ' mt-3'} onClick={() => { void query.refetch() }}>Thử lại</button></div> : <>
        {query.data.items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Không có bằng chứng phù hợp.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr>{['Bằng chứng', 'Lô / Hộ nuôi', 'Hộp', 'Điểm rủi ro', 'Nhận tại máy chủ', 'Thao tác'].map(text => <th className="whitespace-nowrap p-4 font-bold" key={text}>{text}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{query.data.items.map(item => <tr className="hover:bg-slate-50" key={item.id}>
          <td className="p-4"><p className="mb-2 font-semibold">#{item.id}</p><AdminStatusBadge value={item.reviewStatus} label={evidenceStatuses[item.reviewStatus] ?? item.reviewStatus} /></td>
          <td className="p-4"><b>{item.batchCode}</b><p className="mt-1 text-xs text-slate-500">{item.farmName}</p></td><td className="p-4">{item.slotCode ?? '—'}</td><td className="p-4">{item.riskScore == null ? '—' : `${item.riskScore}/100`}</td><td className="whitespace-nowrap p-4 text-xs text-slate-600">{new Date(item.receivedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
          <td className="p-4"><Link className={adminButton + ' whitespace-nowrap'} to={`/admin/evidence/${item.id}`}>Xem bằng chứng<span className="sr-only"> {item.id}</span></Link></td>
        </tr>)}</tbody></table></div>}
        <AdminPagination page={page} total={query.data.total} busy={query.isFetching} onChange={setPage} />
      </>}
    </section>
  </AdminLayout>
}

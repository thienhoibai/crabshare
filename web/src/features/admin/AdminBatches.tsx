import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import AdminLayout from './AdminLayout'
import { listAdminBatches } from './adminBatchesApi'
import { batchStatuses } from '../operator/batchesApi'
import { useAuthStore } from '../../shared/auth/authStore'
import { errorMessage } from '../../shared/api/http'
import { formatVnd } from '../../shared/lib/format'

export default function AdminBatches() {
  const userId = useAuthStore(s => s.user?.userId)
  const [status, setStatus] = useState('PendingApproval')
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['admin-batches', userId, status, page], queryFn: ({ signal }) => listAdminBatches(status, page, signal), retry: false })
  return <AdminLayout activeTab="batches">
    <header className="mb-6"><h1 className="text-2xl font-extrabold text-slate-900">Kiểm duyệt Dự án / Lô nuôi</h1><p className="text-sm text-slate-500 mt-1">Xem hồ sơ, chi phí chuẩn và lịch giải ngân do hộ nuôi đề xuất.</p></header>
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50"><label htmlFor="admin-batch-status" className="text-sm font-bold mr-3">Trạng thái lô</label><select id="admin-batch-status" className="border border-slate-300 rounded-lg p-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">Tất cả</option>{Object.entries(batchStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {query.isPending && <p className="p-4" role="status">Đang tải lô…</p>}
      {query.isError && <div className="p-4" role="alert">{errorMessage(query.error)} <button className="underline" disabled={query.isFetching} onClick={() => void query.refetch()}>Thử lại</button></div>}
      {query.data && <>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 border-b text-slate-500"><tr>{['Mã lô', 'Tên dự án', 'Hộ nuôi', 'Mục tiêu gọi vốn', 'Trạng thái', 'Thao tác'].map(h => <th className="p-4 font-bold" key={h} scope="col">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
          {query.data.items.map(({ batch: b, operator }) => <tr key={b.batchCode} className="hover:bg-slate-50"><td className="p-4 font-semibold">{b.batchCode}</td><td className="p-4">{b.title}</td><td className="p-4">{operator.legalName}</td><td className="p-4 whitespace-nowrap">{formatVnd(b.targetCapital)}</td><td className="p-4">{batchStatuses[b.status]}</td><td className="p-4"><Link className="text-red-600 font-bold" to={`/admin/batches/detail?id=${encodeURIComponent(b.batchCode)}`}>{b.status === 'PendingApproval' ? 'Xét duyệt' : 'Xem chi tiết'}</Link></td></tr>)}
        </tbody></table></div>
        {query.data.items.length === 0 && <p className="p-4">Không có lô nào ở trạng thái này.</p>}
        <div className="p-4 flex items-center gap-4 text-sm"><button disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page} · {query.data.total} lô</span><button disabled={page * query.data.pageSize >= query.data.total || query.isFetching} onClick={() => setPage(page + 1)}>Trang sau</button></div>
      </>}
    </div>
  </AdminLayout>
}

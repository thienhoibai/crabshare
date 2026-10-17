import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../shared/auth/authStore'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import AdminLayout from './AdminLayout'
import { AdminPagination, adminButton, adminField } from './adminAccountUi'
import { auditLog, exportAuditLog, type AuditFilter, type AuditRow } from './adminAuditApi'

function AuditDetail({ row }: { row: AuditRow }) {
  return <details className="max-w-xl"><summary className="cursor-pointer font-semibold text-slate-700">Xem nội dung và chuỗi băm</summary><div className="mt-3 grid gap-3 text-xs">{[['Giá trị trước', row.oldValue], ['Giá trị sau', row.newValue], ['Hash trước', row.prevHash], ['Hash dòng', row.rowHash]].map(([label, value]) => <div key={label}><b>{label}</b><pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-3 font-mono">{value ?? '—'}</pre></div>)}</div></details>
}
export default function AdminAuditLog() {
  const userId = useAuthStore(s => s.user?.userId)
  return <AuditContent key={userId} userId={userId} />
}
function AuditContent({ userId }: { userId?: number }) {
  const [filter, setFilter] = useState<AuditFilter>({ entityType: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [snapshot, setSnapshot] = useState<number>()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const client = useQueryClient()
  const valid = !(filter.from && filter.to && filter.from > filter.to)
  const query = useQuery({ queryKey: ['admin-audit', userId, filter, page, snapshot], queryFn: ({ signal }) => auditLog(filter, page, snapshot, signal), enabled: !!userId && valid })
  useEffect(() => { if (snapshot === undefined && query.data && !query.isFetching) setSnapshot(query.data.throughAuditId) }, [snapshot, query.data, query.isFetching])
  function update(next: AuditFilter) { setFilter(next); setPage(1); setSnapshot(undefined); setExportError('') }
  function refresh() { setPage(1); setSnapshot(undefined); void client.invalidateQueries({ queryKey: ['admin-audit', userId] }) }
  async function download() {
    if (exporting) return
    setExporting(true); setExportError('')
    try { await exportAuditLog(filter, snapshot) } catch (error) { setExportError(errorMessage(error)) } finally { setExporting(false) }
  }
  const data = query.data
  return <AdminLayout activeTab="audit">
    <header className="mb-6"><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Nhật ký kiểm toán</h1><p className="mt-1 text-sm text-slate-500">Chỉ đọc · kiểm tra toàn bộ chuỗi đến mốc đã tải, kể cả dòng nằm ngoài bộ lọc.</p></header>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50 p-4">
        <label className="grid w-full gap-1 text-xs font-bold text-slate-600 sm:w-auto sm:min-w-48 sm:flex-1">Loại đối tượng<input className={adminField} maxLength={60} placeholder="VD: Batch, PayoutAccount…" value={filter.entityType} onChange={e => update({ ...filter, entityType: e.target.value })} /></label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">Từ ngày<input type="date" className={adminField} value={filter.from} onChange={e => update({ ...filter, from: e.target.value })} /></label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">Đến ngày<input type="date" className={adminField} value={filter.to} onChange={e => update({ ...filter, to: e.target.value })} /></label>
        <button className={adminButton} disabled={!valid || query.isFetching} onClick={refresh}><RefreshCw size={16} />Làm mới</button>
        <button className={adminButton} disabled={!valid || !data || query.isError || query.isFetching || exporting} onClick={() => { void download() }}><Download size={16} />{exporting ? 'Đang xuất…' : 'Xuất CSV + kiểm tra chuỗi'}</button>
      </div>
      {!valid && <p role="alert" className="p-5 text-sm text-red-700">Ngày bắt đầu không được sau ngày kết thúc.</p>}
      {exportError && <p role="alert" className="p-5 text-sm text-red-700">{exportError}</p>}
      {valid && (query.isPending ? <p role="status" className="p-8 text-sm text-slate-500">Đang đọc nhật ký và kiểm tra chuỗi…</p> : query.isError ? <div role="alert" className="p-8"><p className="text-red-700">{errorMessage(query.error)}</p><button className={adminButton + ' mt-3'} onClick={() => { void query.refetch() }}>Thử lại</button></div> : data && <>
        <div role={data.chain.isValid ? 'status' : 'alert'} className={`m-4 flex items-start gap-3 rounded-lg border p-4 text-sm ${data.chain.isValid ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {data.chain.isValid ? <ShieldCheck className="h-5 w-5 shrink-0" /> : <ShieldAlert className="h-5 w-5 shrink-0" />}<div><b>{data.chain.isValid ? 'Chuỗi băm hợp lệ' : `Phát hiện gãy chuỗi tại dòng #${data.chain.brokenAuditId}`}</b><p className="mt-1">Đã kiểm tra {data.chain.checkedRows.toLocaleString('vi-VN')} dòng · mốc audit #{data.throughAuditId}.</p>{data.chain.problem && <p className="mt-1">{data.chain.problem}</p>}</div>
        </div>
        {!data.items.length ? <p className="p-8 text-center text-sm text-slate-500">Không có nhật ký phù hợp.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-slate-500"><tr>{['Mã / thời gian', 'Đối tượng', 'Thao tác', 'Người thực hiện', 'Nội dung'].map(t => <th key={t} className="whitespace-nowrap p-4 font-bold">{t}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.items.map(row => <tr key={row.auditId} className={row.auditId === data.chain.brokenAuditId ? 'bg-red-50' : 'hover:bg-slate-50'}><td className="whitespace-nowrap p-4"><b>#{row.auditId}</b><p className="mt-1 text-xs text-slate-500">{formatDateTime(row.occurredAt)}</p></td><td className="p-4"><b>{row.entityType}</b><p className="text-xs text-slate-500">#{row.entityId}</p></td><td className="p-4">{row.actionType}</td><td className="p-4">{row.actorUserId == null ? 'Hệ thống' : `#${row.actorUserId}`}</td><td className="min-w-72 p-4"><AuditDetail row={row} /></td></tr>)}</tbody></table></div>}
        <AdminPagination page={page} pageSize={data.pageSize} total={data.total} busy={query.isFetching} onChange={setPage} />
      </>)}
    </section>
  </AdminLayout>
}

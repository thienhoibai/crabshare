import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, Search } from 'lucide-react'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { ActionDialog } from '../../shared/ui/ActionDialog'
import { adminAlerts, resolveAlert, alertSeverities, alertStatuses, alertTypes, type AlertItem } from '../alerts/api'
import AdminLayout from './AdminLayout'
import { AdminPagination, adminButton, adminField } from './adminAccountUi'

const date = (value: string) => new Date(value).toLocaleString('vi-VN')

function ResolveDialog({ alert, onClose, onDone }: { alert: AlertItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('')
  const mutation = useMutation({ mutationFn: () => resolveAlert(alert.id, note.trim()), onSuccess: onDone })
  return <ActionDialog title="Đóng cảnh báo" onClose={onClose} busy={mutation.isPending}>
    <p className="mb-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold">#{alert.id} · {alert.batchCode}<br />{alert.message}</p>
    {alert.responseNote && <p className="mb-4 text-sm text-slate-600">Phản hồi hộ nuôi: {alert.responseNote}</p>}
    <form onSubmit={event => { event.preventDefault(); if (note.trim()) mutation.mutate() }} className="space-y-4">
      <label className="grid gap-2 text-sm font-bold">Kết quả xử lý<textarea className={adminField} value={note} onChange={event => setNote(event.target.value)} maxLength={300} rows={4} required disabled={mutation.isPending} /></label>
      {mutation.isError && <p role="alert" className="text-sm text-red-700">{errorMessage(mutation.error)}</p>}
      <div className="flex justify-end gap-3"><button type="button" className={adminButton} onClick={onClose} disabled={mutation.isPending}>Hủy</button><button type="submit" className={adminButton + ' border-red-600! bg-red-600! text-white'} disabled={!note.trim() || mutation.isPending}>{mutation.isPending ? 'Đang xử lý…' : 'Xác nhận đóng'}</button></div>
    </form>
  </ActionDialog>
}

export default function AdminAlerts() {
  const [status, setStatus] = useState('Escalated')
  const [severity, setSeverity] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AlertItem | null>(null)
  const [notice, setNotice] = useState('')
  const client = useQueryClient()
  const userId = useAuthStore(state => state.user?.userId)
  const query = useQuery({ queryKey: ['admin-alerts', userId, status, severity, q, page], queryFn: () => adminAlerts(status, severity, q, page), enabled: !!userId })
  return <AdminLayout activeTab="alerts">
    <header className="mb-6"><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Cảnh báo Trại (Leo thang)</h1><p className="mt-1 text-sm text-slate-500">Theo dõi cảnh báo quá hạn phản hồi và ghi kết quả xử lý.</p></header>
    {notice && <p role="status" className="mb-4 text-sm text-emerald-700">{notice}</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50 p-4">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Tìm cảnh báo</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" placeholder="Tìm mã cảnh báo, lô, trại…" className={adminField + ' pl-9!'} maxLength={100} value={q} onChange={event => { setQ(event.target.value); setPage(1) }} /></label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">Trạng thái<select aria-label="Trạng thái cảnh báo" className={adminField} value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>{Object.entries(alertStatuses).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">Mức độ<select aria-label="Mức độ cảnh báo" className={adminField} value={severity} onChange={event => { setSeverity(event.target.value); setPage(1) }}><option value="">Tất cả</option>{Object.entries(alertSeverities).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label>
        <button className={adminButton} disabled={query.isFetching} onClick={() => { void query.refetch() }}><RefreshCw size={16} /> Làm mới</button>
      </div>
      {query.isPending ? <p role="status" className="p-8 text-sm text-slate-500">Đang tải cảnh báo…</p> : query.isError ? <div role="alert" className="p-8"><p className="text-red-700">{errorMessage(query.error)}</p><button className={adminButton + ' mt-3'} onClick={() => { void query.refetch() }}>Thử lại</button></div> : <>
        {!query.data.items.length ? <p className="p-8 text-center text-sm text-slate-500">Không có cảnh báo phù hợp.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr>{['Mã cảnh báo', 'Mức độ', 'Nội dung / phản hồi', 'Lô / Trại', 'Thời gian', 'Thao tác'].map(text => <th key={text} className="whitespace-nowrap p-4 font-bold">{text}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{query.data.items.map(alert => <tr key={alert.id} className="hover:bg-slate-50">
            <td className="p-4 font-semibold text-slate-900">#{alert.id}<p className="mt-1 text-xs text-slate-500">{alertStatuses[alert.status]}</p></td>
            <td className="p-4"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${alert.severity === 'High' || alert.severity === 'Critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}><AlertTriangle size={14} />{alertSeverities[alert.severity]}</span></td>
            <td className="min-w-64 max-w-96 break-words p-4"><b className="text-slate-700">{alertTypes[alert.type]}</b><p className="mt-1 text-slate-600">{alert.message}</p>{alert.responseNote && <p className="mt-2 text-xs text-slate-500">Hộ nuôi: {alert.responseNote}</p>}{alert.resolutionNote && <p className="mt-2 text-xs text-emerald-700">Kết quả: {alert.resolutionNote}</p>}</td>
            <td className="p-4"><b className="whitespace-nowrap text-slate-900">{alert.batchCode}</b><p className="mt-1 text-xs text-slate-500">{alert.farmName}</p></td>
            <td className="whitespace-nowrap p-4 text-xs text-slate-600"><p>Hạn: {date(alert.ackDeadline)}</p>{alert.escalatedAt && <p className="mt-1 text-red-700">Leo thang: {date(alert.escalatedAt)}</p>}</td>
            <td className="p-4">{alert.status !== 'Resolved' ? <button className={adminButton + ' whitespace-nowrap text-red-700'} onClick={() => { setNotice(''); setSelected(alert) }}>Đóng cảnh báo<span className="sr-only"> {alert.id}</span></button> : <span className="whitespace-nowrap text-emerald-700">Đã xử lý</span>}</td>
          </tr>)}</tbody></table></div>}
        <AdminPagination page={page} total={query.data.total} busy={query.isFetching} onChange={setPage} />
      </>}
    </section>
    {selected && <ResolveDialog alert={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); setNotice('Đã đóng cảnh báo.'); void client.invalidateQueries({ queryKey: ['admin-alerts'] }); void client.invalidateQueries({ queryKey: ['operator-alerts'] }) }} />}
  </AdminLayout>
}

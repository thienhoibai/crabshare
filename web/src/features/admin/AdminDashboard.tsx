import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, LayoutGrid, DollarSign, Wallet, Download, RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { errorMessage } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import { formatVnd, formatDateTime } from '../../shared/lib/format'
import { adminDashboard, downloadReport, initialPeriod, validPeriod, statusLabels, type StatusCount } from '../reports/dashboardApi'
import AdminLayout from './AdminLayout'
import { adminButton, adminField } from './adminAccountUi'

function StatusList({ items }: { items: StatusCount[] }) {
  return !items.length ? <p className="text-sm text-slate-500">Chưa có dữ liệu.</p> : <ul className="space-y-3">{items.map(item => <li key={item.status} className="flex justify-between gap-3 text-sm"><span className="text-slate-600">{statusLabels[item.status] ?? item.status}</span><b>{item.count.toLocaleString('vi-VN')}</b></li>)}</ul>
}
export default function AdminDashboard() {
  const [period, setPeriod] = useState(initialPeriod)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const userId = useAuthStore(s => s.user?.userId)
  const valid = validPeriod(period.from, period.to)
  const query = useQuery({ queryKey: ['admin-dashboard', userId, period], queryFn: ({ signal }) => adminDashboard(period.from, period.to, signal), enabled: !!userId && valid })
  const data = query.data
  async function exportCsv(name: string) {
    if (exporting || !valid) return
    setExporting(true); setExportError('')
    try { await downloadReport(name, period.from, period.to) } catch (error) { setExportError(errorMessage(error)) } finally { setExporting(false) }
  }
  return <AdminLayout activeTab="dashboard">
    <header className="mb-6"><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tổng quan Nền tảng</h1><p className="mt-1 text-sm text-slate-500">Số liệu thực tế từ hệ thống · ngày báo cáo theo giờ Việt Nam.</p></header>
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs font-bold text-slate-600">Từ ngày<input type="date" className={adminField} value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} /></label>
      <label className="grid gap-1 text-xs font-bold text-slate-600">Đến ngày<input type="date" className={adminField} value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} /></label>
      <button className={adminButton} disabled={!valid || query.isFetching} onClick={() => { void query.refetch() }}><RefreshCw size={16} />Làm mới</button>
      {['capital', 'batches', 'orders', 'payouts'].map((name, index) => <button key={name} className={adminButton} disabled={!valid || exporting} onClick={() => { void exportCsv(name) }}><Download size={15} />CSV {['vốn góp', 'lô nuôi', 'đơn hàng', 'chi trả'][index]}</button>)}
    </div>
    {!valid && <p role="alert" className="mb-4 text-sm text-red-700">Chọn khoảng ngày hợp lệ, tối đa 366 ngày.</p>}
    {exportError && <p role="alert" className="mb-4 text-sm text-red-700">{exportError}</p>}
    {valid && (query.isPending ? <div role="status" aria-label="Đang tải dashboard" className="grid grid-cols-1 gap-6 md:grid-cols-4">{[1, 2, 3, 4].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200" />)}</div> : query.isError ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-6"><p>{errorMessage(query.error)}</p><button className={adminButton + ' mt-3'} onClick={() => { void query.refetch() }}>Thử lại</button></div> : data && <>
      <p className="mb-4 text-xs text-slate-500">Cập nhật {formatDateTime(data.asOf)} · {data.confirmedContributions} khoản góp còn hiệu lực trong kỳ.</p>
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[{ label: 'Vốn xác nhận trong kỳ', value: formatVnd(data.confirmedCapital), Icon: DollarSign }, { label: 'Doanh thu đơn hoàn tất trong kỳ', value: formatVnd(data.completedOrderRevenue), Icon: Wallet }, { label: 'Lô nuôi hiện có', value: data.batchesByStatus.reduce((n, s) => n + s.count, 0).toLocaleString('vi-VN'), Icon: LayoutGrid }, { label: 'Tài khoản hiện có', value: data.totalUsers.toLocaleString('vi-VN'), Icon: Users }].map(({ label, value, Icon }) => <section key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><Icon className="mb-3 h-5 w-5 text-red-600" /><p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><b className="break-words text-xl text-slate-900">{value}</b></section>)}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2"><h2 className="mb-2 font-bold text-slate-900">Vốn góp xác nhận theo ngày</h2><p className="mb-4 text-xs text-slate-500">Đơn vị VND · không tính giữ chỗ hoặc khoản đã hoàn.</p>{data.confirmedContributions === 0 ? <p className="py-12 text-center text-sm text-slate-500">Chưa có khoản góp được xác nhận trong kỳ.</p> : <div className="h-72 w-full" role="img" aria-label={`Vốn xác nhận ${formatVnd(data.confirmedCapital)}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.capitalByDay} margin={{ left: 0, right: 8, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="date" tickFormatter={s => String(s).slice(5)} tick={{ fontSize: 11 }} /><YAxis width={65} tickFormatter={value => Number(value).toLocaleString('vi-VN', { notation: 'compact' })} tick={{ fontSize: 11 }} /><Tooltip formatter={value => [formatVnd(Number(value)), 'Vốn xác nhận']} /><Bar dataKey="amount" fill="#dc2626" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}</section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-5 font-bold text-slate-900">Lô theo trạng thái hiện tại</h2><StatusList items={data.batchesByStatus} /></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-5 font-bold text-slate-900">Đơn đặt trong kỳ</h2><StatusList items={data.ordersByStatus} /></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-2 font-bold text-slate-900">Lệnh chi trả tạo trong kỳ</h2><p className="mb-5 text-xs text-slate-500">Chỉ lệnh Payout; chưa gửi không được tính là đã trả.</p><StatusList items={data.payoutsByStatus} /><p className="mt-5 text-sm text-emerald-700">Chi trả thành công trong kỳ: <b>{formatVnd(data.succeededPayoutAmount)}</b></p></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-bold text-slate-900">Cảnh báo leo thang · {data.escalatedAlerts}</h2>{!data.latestEscalatedAlerts.length ? <p className="text-sm text-slate-500">Không có cảnh báo leo thang.</p> : <ul className="space-y-3">{data.latestEscalatedAlerts.map(a => <li key={a.id} className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm"><b>{a.batchCode} · {a.farmName}</b><p className="mt-1 break-words text-amber-900">{a.message}</p></li>)}</ul>}<a className="mt-4 inline-block text-sm font-bold text-red-600 hover:underline" href="/admin/alerts">Xử lý cảnh báo →</a></section>
      </div>
    </>)}
  </AdminLayout>
}

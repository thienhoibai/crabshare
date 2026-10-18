import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlusCircle, RefreshCw } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import OperatorLayout from './OperatorLayout'
import { OpBtn, OpHeading, OpPanel, OpStat, OpTodo, OpNote } from './operatorUi'
import { useAuthStore } from '../../shared/auth/authStore'
import { errorMessage } from '../../shared/api/http'
import { formatDateTime } from '../../shared/lib/format'
import { initialPeriod, operatorDashboard, validPeriod } from '../reports/dashboardApi'

const CHART = { ph: '#3b8fd9', temp: '#ec5a1f', grid: 'rgba(21, 19, 15, 0.08)', tick: '#6b655a' }
export default function OperatorDashboard() {
  const [selectedBatch, setSelectedBatch] = useState('')
  const [period, setPeriod] = useState(initialPeriod)
  const userId = useAuthStore(s => s.user?.userId)
  const valid = validPeriod(period.from, period.to)
  const query = useQuery({ queryKey: ['operator-dashboard', userId, period, selectedBatch], queryFn: ({ signal }) => operatorDashboard(period.from, period.to, selectedBatch, signal), enabled: !!userId && valid, refetchInterval: 5_000 })
  const data = query.data
  return <OperatorLayout activeTab="dashboard">
    <OpHeading eyebrow="Hôm nay" title={data && !query.isError ? `Chào ${data.farmName}` : 'Tổng quan hộ nuôi'} description="Cua đang nuôi, công việc hiện tại và nhật ký thật của hộ nuôi." action={<><select className="op-select op-select--pill" value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} aria-label="Lọc theo lô"><option value="">Tất cả lô đang nuôi</option>{data?.batches.map(b => <option key={b.batchCode} value={b.batchCode}>{b.title} · {b.batchCode}</option>)}</select><OpBtn variant="ink" onClick={() => { window.location.href = '/operator/log' }}><PlusCircle size={16} />Ghi nhật ký</OpBtn></>} />
    <div className="op-actions mb-6"><label className="grid gap-1 text-sm">Từ ngày<input type="date" className="op-input" value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} /></label><label className="grid gap-1 text-sm">Đến ngày<input type="date" className="op-input" value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} /></label><OpBtn variant="ghost" disabled={!valid || query.isFetching} onClick={() => { void query.refetch() }}><RefreshCw size={16} />Làm mới</OpBtn></div>
    {!valid && <OpNote tone="danger">Chọn khoảng ngày hợp lệ, tối đa 366 ngày.</OpNote>}
    {valid && (query.isPending ? <p role="status" className="op-panel">Đang tải tổng quan…</p> : query.isError ? <div role="alert"><OpNote tone="danger">{errorMessage(query.error)}</OpNote><OpBtn variant="ghost" onClick={() => { void query.refetch() }}>Thử lại</OpBtn></div> : data && <>
      <p className="mb-4 text-xs text-stone-500">Cập nhật {formatDateTime(data.asOf)} · Biểu đồ là trung bình các nhật ký từng ngày trong kỳ.</p>
      <div className="op-grid">
        <OpStat className="op-span-7" label="Cua đang nuôi" value={data.aliveCount.toLocaleString('vi-VN')} unit="con" sub="Đếm cá thể có trạng thái Growing trong sổ nuôi." />
        <OpPanel className="op-span-5" title="Việc cần làm"><OpTodo items={[
          ...(data.openAlerts ? [{ title: `${data.openAlerts} cảnh báo chưa xử lý`, sub: 'Cảnh báo mở hoặc leo thang', href: '/operator/alerts', tone: 'danger' as const }] : []),
          ...(data.pendingCaptureRequests ? [{ title: `${data.pendingCaptureRequests} yêu cầu chụp còn hạn`, sub: 'Mở app để chụp bằng camera và GPS', href: '/operator/evidence', tone: 'gold' as const }] : []),
          ...(data.logsDueToday ? [{ title: `${data.logsDueToday} lô chưa ghi nhật ký hôm nay`, sub: 'Lô đang sản xuất', href: '/operator/log', tone: 'gold' as const }] : []),
          ...(data.ordersToPack + data.ordersToShip ? [{ title: `${data.ordersToPack} đơn chờ đóng gói · ${data.ordersToShip} chờ giao`, sub: 'Đơn đã thanh toán hoặc đóng gói', href: '/operator/orders', tone: 'ok' as const }] : []),
        ]} />{!data.openAlerts && !data.pendingCaptureRequests && !data.logsDueToday && !data.ordersToPack && !data.ordersToShip && <p className="rd-muted">Không có công việc đang chờ.</p>}</OpPanel>
        <OpPanel className="op-span-8" title="Môi trường nước theo ngày">{!data.environmentByDay.length ? <p className="rd-muted py-12">Chưa có nhật ký trong khoảng ngày đã chọn.</p> : <div className="h-72 w-full" role="img" aria-label="Biểu đồ pH và nhiệt độ từ nhật ký"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.environmentByDay} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART.grid} /><XAxis dataKey="date" tickFormatter={s => String(s).slice(5)} tick={{ fill: CHART.tick, fontSize: 11 }} /><YAxis yAxisId="left" tick={{ fontSize: 11 }} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} /><Tooltip /><Line yAxisId="left" name="pH" type="monotone" dataKey="ph" stroke={CHART.ph} strokeWidth={2.5} connectNulls={false} /><Line yAxisId="right" name="Nhiệt độ °C" type="monotone" dataKey="waterTempC" stroke={CHART.temp} strokeWidth={2.5} connectNulls={false} /></LineChart></ResponsiveContainer></div>}</OpPanel>
        <OpPanel className="op-span-4" title="Nhật ký mới nhất">{!data.recentLogs.length ? <p className="rd-muted">Chưa có nhật ký.</p> : <ul className="op-feed">{data.recentLogs.map(log => <li key={log.id}><b>{log.batchCode} · {log.date}</b><small>pH {log.ph ?? '—'} · {log.waterTempC ?? '—'} °C · {log.salinityPpt ?? '—'} ‰ · {log.feedKg ?? '—'} kg ăn</small></li>)}</ul>}</OpPanel>
        {!data.batches.length && <div className="op-span-12"><OpNote>Hộ nuôi chưa có lô đang nuôi.</OpNote></div>}
      </div>
    </>)}
  </OperatorLayout>
}

import { useState } from 'react'
import { PlusCircle, Activity, Droplets, AlertCircle, ChevronRight, Filter } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import OperatorLayout from './OperatorLayout'
import { OpBadge, OpBtn, OpHeading, OpPanel } from './operatorUi'

const mockChartData = [
  { time: '08:00', ph: 7.2, temp: 28 },
  { time: '10:00', ph: 7.3, temp: 28.5 },
  { time: '12:00', ph: 7.4, temp: 29 },
  { time: '14:00', ph: 7.3, temp: 29.2 },
  { time: '16:00', ph: 7.2, temp: 28.8 },
  { time: '18:00', ph: 7.1, temp: 28.2 },
]

const recentLogs = [
  { id: 1, time: '10:30', action: 'Cho ăn (cám viên)', user: 'Nguyễn Văn A' },
  { id: 2, time: '09:15', action: 'Kiểm tra độ mặn (15ppt)', user: 'Trần Thị B' },
  { id: 3, time: '08:00', action: 'Xả cặn hồ sinh học', user: 'Nguyễn Văn A' },
]

export default function OperatorDashboard() {
  const [selectedBatch, setSelectedBatch] = useState('ALL')

  const metrics =
    selectedBatch === 'BATCH-2026-11A'
      ? { crabs: 1240, alerts: 2, harvest: 450 }
      : selectedBatch === 'BATCH-2026-10B'
        ? { crabs: 2260, alerts: 0, harvest: 750 }
        : { crabs: 3500, alerts: 2, harvest: 1200 }

  return (
    <OperatorLayout activeTab="dashboard">
      <OpHeading
        eyebrow="Operator · Trại Cần Giờ 01"
        title="Tổng quan trại"
        description="Theo dõi cua sống, cảnh báo và tiến độ nuôi trong ngày."
        crumb={
          <div className="op-crumb">
            <span>Operator</span>
            <ChevronRight className="w-4 h-4" />
            <strong>Trại Cần Giờ 01</strong>
          </div>
        }
        action={
          <>
            <label className="op-field" style={{ minWidth: 220 }}>
              <div className="flex items-center gap-2 op-input" style={{ padding: '8px 10px' }}>
                <Filter className="w-4 h-4 text-[#9c815f]" />
                <select
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  className="bg-transparent border-none outline-none font-bold text-[#7d4b1a] text-sm w-full"
                >
                  <option value="ALL">Tất cả lô đang nuôi</option>
                  <option value="BATCH-2026-11A">Lô cua lột · BATCH-2026-11A</option>
                  <option value="BATCH-2026-10B">Lô cua gạch · BATCH-2026-10B</option>
                </select>
              </div>
            </label>
            <OpBtn variant="ink" onClick={() => { window.location.href = '/operator/log' }}>
              <PlusCircle className="w-4 h-4" /> Ghi nhật ký
            </OpBtn>
          </>
        }
      />

      <div className="op-stats cols-3">
        <div className="op-stat">
          <div>
            <span>Cua đang nuôi</span>
            <strong>{metrics.crabs.toLocaleString('vi-VN')} <em>con</em></strong>
          </div>
          <div className="op-icon-pill"><Activity className="w-5 h-5" /></div>
        </div>
        <div className={`op-stat ${metrics.alerts > 0 ? 'danger' : ''}`}>
          <div>
            <span style={metrics.alerts > 0 ? { color: '#b42318' } : undefined}>Cảnh báo hệ thống</span>
            <strong>{metrics.alerts} <em>cần xử lý</em></strong>
          </div>
          <div className="op-icon-pill" style={metrics.alerts > 0 ? { background: '#fef2f2', color: '#b42318', borderColor: '#fca5a5' } : undefined}>
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
        <div className="op-stat">
          <div>
            <span>Dự kiến thu hoạch</span>
            <strong>{metrics.harvest.toLocaleString('vi-VN')} <em>kg</em></strong>
          </div>
          <div className="op-icon-pill" style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd' }}>
            <Droplets className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <OpPanel
          className="lg:col-span-2"
          title="Chỉ số môi trường (hôm nay)"
          action={
            <div className="flex gap-4 text-xs font-semibold text-[#6f675e]">
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#0369a1]" /> pH</span>
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#7d4b1a]" /> Nhiệt độ</span>
            </div>
          }
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockChartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8dccb" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#6f675e', fontSize: 11 }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#6f675e', fontSize: 11 }} domain={[6, 9]} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#6f675e', fontSize: 11 }} domain={[25, 35]} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e8dccb', fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="ph" stroke="#0369a1" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="temp" stroke="#7d4b1a" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </OpPanel>

        <OpPanel title="Nhật ký gần nhất" action={<OpBadge tone="gold">3 mục</OpBadge>}>
          <div className="space-y-5">
            {recentLogs.map((log, i) => (
              <div key={log.id} className="relative flex gap-4">
                {i !== recentLogs.length - 1 && <div className="absolute left-2 top-6 w-px h-12 bg-[#e8dccb]" />}
                <div className="relative z-10 w-4 h-4 rounded-full bg-[#fff8ef] border-2 border-[#7d4b1a] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">{log.action}</p>
                  <p className="text-xs text-[#6f675e] mt-1">{log.time} · {log.user}</p>
                </div>
              </div>
            ))}
          </div>
          <OpBtn variant="ghost" full className="mt-6" onClick={() => { window.location.href = '/operator/log' }}>
            Ghi log mới
          </OpBtn>
        </OpPanel>
      </div>
    </OperatorLayout>
  )
}
